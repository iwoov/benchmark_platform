import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import {
    canUserAccessQuestionByMetadata,
    canUserReviewProject,
} from "@/lib/reviews/permissions";
import { invokeAiModel } from "@/lib/ai/invoke";

const requestSchema = z.object({
    questionId: z.string().trim().min(1, "缺少题目 ID"),
    fieldKey: z.string().trim().min(1, "缺少字段名"),
    value: z.string().trim().min(1, "当前字段没有可翻译内容"),
});

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
                where: { enabled: true },
                orderBy: { priority: "asc" },
                select: {
                    endpoint: {
                        select: {
                            provider: {
                                select: { apiKey: true },
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

function parseJsonSafely(input: string) {
    try {
        return JSON.parse(input) as unknown;
    } catch {
        return null;
    }
}

function readOpenAiStreamDelta(raw: any) {
    const delta = raw?.choices?.[0]?.delta?.content;
    if (typeof delta === "string") return delta;
    return "";
}

function readOpenAiResponsesStreamDelta(raw: any) {
    if (
        raw?.type === "response.output_text.delta" &&
        typeof raw.delta === "string"
    ) {
        return raw.delta;
    }

    return "";
}

function readAnthropicStreamDelta(raw: any) {
    if (
        raw?.type === "content_block_delta" &&
        raw?.delta &&
        typeof raw.delta.text === "string"
    ) {
        return raw.delta.text;
    }
    return "";
}

function readGeminiStreamDelta(raw: any) {
    const parts = raw?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return "";
    return parts
        .filter(
            (p: any) => p && typeof p.text === "string" && p.thought !== true,
        )
        .map((p: any) => p.text)
        .join("");
}

function extractDelta(protocol: string, raw: unknown) {
    switch (protocol) {
        case "OPENAI_COMPATIBLE":
            return readOpenAiStreamDelta(raw);
        case "OPENAI_RESPONSES":
            return readOpenAiResponsesStreamDelta(raw);
        case "ANTHROPIC_COMPATIBLE":
            return readAnthropicStreamDelta(raw);
        case "GEMINI_COMPATIBLE":
            return readGeminiStreamDelta(raw);
        default:
            return "";
    }
}

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user) {
        return Response.json(
            { error: "请先登录后再使用翻译功能。" },
            { status: 401 },
        );
    }

    const payload = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
        return Response.json(
            { error: parsed.error.issues[0]?.message ?? "请求参数不合法。" },
            { status: 400 },
        );
    }

    const { questionId, fieldKey, value } = parsed.data;

    const question = await prisma.question.findUnique({
        where: { id: questionId },
        select: { id: true, projectId: true, metadata: true },
    });

    if (!question) {
        return Response.json(
            { error: "题目不存在或已被删除。" },
            { status: 404 },
        );
    }

    const canReview = await canUserReviewProject(
        session.user.id,
        session.user.platformRole,
        question.projectId,
    );

    if (!canReview) {
        return Response.json(
            { error: "你当前没有该项目的查看或审核权限。" },
            { status: 403 },
        );
    }

    const canAccessQuestion = await canUserAccessQuestionByMetadata(
        session.user.id,
        session.user.platformRole,
        question.metadata,
    );

    if (!canAccessQuestion) {
        return Response.json(
            { error: "你当前没有该学科题目的查看权限。" },
            { status: 403 },
        );
    }

    const modelCode = await resolveTranslationModelCode();
    if (!modelCode) {
        return Response.json(
            {
                error: "当前没有可调用的 AI 模型，请先在 AI 设置页配置模型和 API Key。",
            },
            { status: 502 },
        );
    }

    const result = await invokeAiModel({
        modelCode,
        stream: true,
        messages: [
            {
                role: "system",
                content: [
                    "你是一个翻译助手，专门将题目审核系统中的字段值翻译为简体中文。",
                    "规则：",
                    "1. 仅输出翻译后的文本，不要输出任何解释、注释或额外内容",
                    "2. 如果原文已经是中文，直接输出原文",
                    "3. 保持原文的格式和换行",
                    "4. 不要翻译字段名，只翻译字段值的内容",
                ].join("\n"),
            },
            {
                role: "user",
                content: [
                    `字段名：${fieldKey}`,
                    "请将以下字段值翻译为简体中文，只输出翻译结果：",
                    "",
                    value,
                ].join("\n"),
            },
        ],
    });

    if (!result.ok) {
        return Response.json({ error: result.error }, { status: 502 });
    }

    if (!result.stream) {
        // Non-stream fallback
        const text = result.text?.trim() ?? "";

        if (text) {
            await prisma.questionFieldTranslation.upsert({
                where: { questionId_fieldKey: { questionId, fieldKey } },
                create: {
                    questionId,
                    fieldKey,
                    translatedText: text,
                    modelCode,
                },
                update: {
                    translatedText: text,
                    modelCode,
                },
            });
        }

        const encoder = new TextEncoder();
        const body = new ReadableStream({
            start(controller) {
                if (text) {
                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ delta: text })}\n\n`,
                        ),
                    );
                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ done: true, modelCode })}\n\n`,
                        ),
                    );
                } else {
                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ error: "翻译结果为空" })}\n\n`,
                        ),
                    );
                }
                controller.close();
            },
        });

        return new Response(body, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        });
    }

    // True streaming: read AI provider SSE, extract deltas, forward to client
    const protocol = result.protocol;
    const upstreamBody = result.response.body;

    if (!upstreamBody) {
        return Response.json(
            { error: "AI 模型返回了空响应。" },
            { status: 502 },
        );
    }

    const reader = upstreamBody.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let fullText = "";

    const stream = new ReadableStream({
        async pull(controller) {
            try {
                while (true) {
                    const { value, done } = await reader.read();

                    if (done) {
                        // Stream finished – save to DB
                        const trimmedText = fullText.trim();
                        if (trimmedText) {
                            try {
                                await prisma.questionFieldTranslation.upsert({
                                    where: {
                                        questionId_fieldKey: {
                                            questionId,
                                            fieldKey,
                                        },
                                    },
                                    create: {
                                        questionId,
                                        fieldKey,
                                        translatedText: trimmedText,
                                        modelCode,
                                    },
                                    update: {
                                        translatedText: trimmedText,
                                        modelCode,
                                    },
                                });
                            } catch {
                                // DB save failure should not break the stream
                            }
                        }

                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({ done: true, modelCode })}\n\n`,
                            ),
                        );
                        controller.close();
                        return;
                    }

                    if (!value || value.length === 0) continue;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk
                        .split(/\r?\n/)
                        .map((l) => l.trim())
                        .filter(Boolean);

                    for (const line of lines) {
                        const dataPart = line.startsWith("data:")
                            ? line.slice(5).trim()
                            : line;

                        if (!dataPart || dataPart === "[DONE]") continue;

                        const parsed = parseJsonSafely(dataPart);
                        if (parsed === null) continue;

                        const delta = extractDelta(protocol, parsed);

                        if (delta) {
                            fullText += delta;
                            controller.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify({ delta })}\n\n`,
                                ),
                            );
                        }
                    }
                }
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "流式读取失败";
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({ error: message })}\n\n`,
                    ),
                );
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}
