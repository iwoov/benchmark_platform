"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { canUserReviewProject } from "@/lib/reviews/permissions";
import { invokeAiModel, resolveAiInvocationText } from "@/lib/ai/invoke";
import { translateToChineseOutputSchema } from "@/lib/ai/review-strategy-schema";

const translateReviewFieldSchema = z.object({
    questionId: z.string().trim().min(1, "缺少题目 ID"),
    fieldKey: z.string().trim().min(1, "缺少字段名"),
    value: z.string().trim().min(1, "当前字段没有可翻译内容"),
});

export type TranslateReviewFieldResult = {
    error?: string;
    translatedText?: string;
    sourceLanguage?: string | null;
    modelCode?: string;
};

function extractJson(text: string | null) {
    if (!text) {
        throw new Error("模型没有返回文本结果");
    }

    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? text.trim();

    function sanitizeJsonString(input: string) {
        let result = "";

        for (let index = 0; index < input.length; index += 1) {
            const current = input[index];
            const next = input[index + 1];

            if (current === "\\") {
                if (next && !`"\\/bfnrtu`.includes(next)) {
                    result += "\\\\";
                    continue;
                }
            }

            result += current;
        }

        return result;
    }

    function tryParse(input: string) {
        try {
            return JSON.parse(input);
        } catch {
            return null;
        }
    }

    const directParsed = tryParse(candidate);
    if (directParsed !== null) {
        return directParsed;
    }

    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

    if (start >= 0 && end > start) {
        const objectCandidate = candidate.slice(start, end + 1);
        const objectParsed = tryParse(objectCandidate);

        if (objectParsed !== null) {
            return objectParsed;
        }

        const sanitizedParsed = tryParse(sanitizeJsonString(objectCandidate));
        if (sanitizedParsed !== null) {
            return sanitizedParsed;
        }
    }

    throw new Error("模型返回内容不是合法 JSON");
}

function extractTranslatedTextFallback(text: string | null) {
    if (!text) {
        return null;
    }

    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? text.trim();
    const translatedTextMatch = candidate.match(
        /"translatedText"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"summary"|\})/,
    );

    if (!translatedTextMatch) {
        return null;
    }

    return translatedTextMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .trim();
}

function normalizeTranslatedText(value: string) {
    const trimmed = value.trim();

    if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
        try {
            const parsed = JSON.parse(trimmed) as unknown;

            if (
                parsed &&
                typeof parsed === "object" &&
                "value" in parsed &&
                typeof (parsed as { value?: unknown }).value === "string"
            ) {
                return (parsed as { value: string }).value.trim();
            }

            return trimmed;
        } catch {
            return trimmed;
        }
    }

    return trimmed;
}

async function resolveTranslationModelCode() {
    const preferredModelCodes = [
        "gemini-3.1-flash-lite-preview",
        "gemini-3.1-flash-preview",
        "gemini-3.1-pro-preview",
    ];

    const models = await prisma.aiModel.findMany({
        orderBy: [{ label: "asc" }, { code: "asc" }],
        select: {
            code: true,
            endpoints: {
                where: {
                    enabled: true,
                },
                orderBy: {
                    priority: "asc",
                },
                select: {
                    endpoint: {
                        select: {
                            provider: {
                                select: {
                                    apiKey: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    const callableModelCodes = models
        .filter((model) =>
            model.endpoints.some((route) =>
                Boolean(route.endpoint.provider.apiKey),
            ),
        )
        .map((model) => model.code);

    const preferred = preferredModelCodes.find((code) =>
        callableModelCodes.includes(code),
    );

    return preferred ?? callableModelCodes[0] ?? null;
}

export async function translateReviewFieldAction(
    input: z.input<typeof translateReviewFieldSchema>,
): Promise<TranslateReviewFieldResult> {
    const session = await auth();

    if (!session?.user) {
        return {
            error: "请先登录后再使用翻译功能。",
        };
    }

    if (!process.env.DATABASE_URL) {
        return {
            error: "当前未配置数据库，无法调用翻译功能。",
        };
    }

    const parsed = translateReviewFieldSchema.safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "翻译参数不完整。",
        };
    }

    const question = await prisma.question.findUnique({
        where: {
            id: parsed.data.questionId,
        },
        select: {
            id: true,
            projectId: true,
            title: true,
        },
    });

    if (!question) {
        return {
            error: "题目不存在或已被删除。",
        };
    }

    const canReview = await canUserReviewProject(
        session.user.id,
        session.user.platformRole,
        question.projectId,
    );

    if (!canReview) {
        return {
            error: "你当前没有该项目的查看或审核权限。",
        };
    }

    const modelCode = await resolveTranslationModelCode();

    if (!modelCode) {
        return {
            error: "当前没有可调用的 AI 模型，请先在 AI 设置页配置模型和 API Key。",
        };
    }

    const response = await invokeAiModel({
        modelCode,
        stream: true,
        responseMimeType: "application/json",
        messages: [
            {
                role: "system",
                content: [
                    "你正在执行题目审核系统中的「翻译为中文」步骤。",
                    "你的任务是仅将用户提供的字段值内容忠实翻译为简体中文。",
                    "不要翻译字段名，不要包装成新的 JSON，不要复述输入结构。",
                    "如果原文已经是中文，可以直接返回原文。",
                    "必须只返回一个 JSON 对象，不要输出 Markdown、代码块、解释或额外文字。",
                    '输出结构：{"translatedText":string,"summary":string,"sourceLanguage":string|null}',
                ].join("\n"),
            },
            {
                role: "user",
                content: [
                    `字段名：${parsed.data.fieldKey}`,
                    "请只翻译下面这段字段值内容本身，不要输出字段名，不要输出额外说明。",
                    "原文：",
                    parsed.data.value,
                ].join("\n\n"),
            },
        ],
    });

    if (!response.ok) {
        return {
            error: response.error,
        };
    }

    const resolvedResponse = await resolveAiInvocationText(response);

    try {
        const payload = extractJson(resolvedResponse.text);
        const parsedOutput = translateToChineseOutputSchema.safeParse(payload);

        if (!parsedOutput.success) {
            throw new Error(
                parsedOutput.error.issues[0]?.message ?? "翻译结果结构不合法",
            );
        }

        return {
            translatedText: normalizeTranslatedText(
                parsedOutput.data.translatedText,
            ),
            sourceLanguage: parsedOutput.data.sourceLanguage,
            modelCode,
        };
    } catch (error) {
        const fallbackTranslatedText = extractTranslatedTextFallback(
            resolvedResponse.text,
        );

        if (fallbackTranslatedText) {
            return {
                translatedText: normalizeTranslatedText(fallbackTranslatedText),
                sourceLanguage: null,
                modelCode,
            };
        }

        return {
            error:
                error instanceof Error ? error.message : "翻译结果解析失败。",
        };
    }
}
