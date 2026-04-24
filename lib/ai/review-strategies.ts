import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import {
    getPlatformAdminScopeOptions,
    resolveUserAdminScopeId,
} from "@/lib/auth/admin-scope";
import type { PlatformRoleValue } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import { ensureDefaultAiReviewStrategyForAdmin } from "@/lib/ai/default-review-strategy";
import {
    invokeAiModel,
    resolveAiInvocationText,
    type AiMessagePart,
} from "@/lib/ai/invoke";
import type { AiBuiltInToolType } from "@/lib/ai/provider-catalog";
import {
    aiReviewOutputSchemas,
    aiReviewStrategyDefinitionSchema,
    aiReviewToolLabels,
    type AiReviewAiToolStep,
    type AiReviewAiToolType,
    type AiReviewComparisonOperator,
    type AiReviewRuleStep,
    type AiReviewStrategyDefinition,
} from "@/lib/ai/review-strategy-schema";
import { readImageFields, readImageMap } from "@/lib/datasources/sync-config";
import {
    resolveUploadPath,
    UPLOAD_URL_PREFIX,
} from "@/lib/import/file-storage";
import {
    getReviewQuestionDetail,
    type ReviewQuestionDetail,
} from "@/lib/reviews/question-list-data";

export type StepExecutionItem = {
    index: number;
    status: "SUCCESS" | "FAILED";
    sourceStepId?: string;
    promptInput?: unknown;
    requestMeta?: {
        modelCode: string;
        protocol?: string | null;
        reasoningLevel?: string | null;
        providerCode?: string | null;
        providerName?: string | null;
        endpointCode?: string | null;
        endpointLabel?: string | null;
        baseUrl?: string | null;
    };
    output?: unknown;
    rawResponse?: unknown;
    derived?: Record<string, unknown>;
    error?: string;
};

export type StepExecutionResult = {
    stepId: string;
    stepName: string;
    stepKind: "AI_TOOL" | "RULE";
    stepType: string;
    status: "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
    summary: string;
    outcomeLabel?: "PASS" | "REJECT" | "FLAG";
    items: StepExecutionItem[];
    metrics?: Record<string, unknown>;
    error?: string;
};

export type StrategyExecutionResult = {
    version: 1;
    strategy: {
        id: string;
        code: string;
        name: string;
    };
    question: {
        id: string;
        title: string;
        projectName: string;
        projectCode: string;
        datasourceName: string;
    };
    status: "RUNNING" | "SUCCESS" | "FAILED";
    stepResults: StepExecutionResult[];
    finalRecommendation: {
        decision?: "PASS" | "REJECT";
        riskLevel?: string;
        summary: string;
    } | null;
    reviewPersistence: {
        status: "SAVED" | "SKIPPED" | "FAILED";
        message: string;
        reviewId?: string;
        decision?: "PASS" | "REJECT";
        comment?: string;
        questionStatus?: "APPROVED" | "REJECTED";
    } | null;
};

export type AiReviewStrategyRunView = {
    id: string;
    status: string;
    errorMessage: string | null;
    createdAt: string;
    finishedAt: string | null;
    strategy: {
        id: string;
        name: string;
        code: string;
    };
    triggeredByName: string;
    parsedResult: StrategyExecutionResult | null;
};

function parseStringArray(input: unknown) {
    if (!Array.isArray(input)) {
        return [] as string[];
    }

    return input
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean);
}

function extractRawFieldOrder(input: unknown) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return [] as string[];
    }

    const rawFieldOrder = (input as Record<string, unknown>).rawFieldOrder;

    if (!Array.isArray(rawFieldOrder)) {
        return [] as string[];
    }

    return rawFieldOrder.filter(
        (value): value is string =>
            typeof value === "string" && Boolean(value.trim()),
    );
}

function parseDefinition(input: unknown) {
    const parsed = aiReviewStrategyDefinitionSchema.safeParse(input);
    return parsed.success ? parsed.data : null;
}

function normalizeText(value: string | null | undefined) {
    return value?.replace(/\s+/g, " ").trim() ?? "";
}

function normalizeAnswer(value: string | null | undefined) {
    return normalizeText(value)
        .replace(/[，,。.;；、:：()（）[\]【】]/g, "")
        .toUpperCase();
}

function serializeJson(value: unknown) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function toReviewDecision(value: unknown): "PASS" | "REJECT" | undefined {
    return value === "PASS" || value === "REJECT" ? value : undefined;
}

function toQuestionStatus(
    decision: "PASS" | "REJECT",
): "APPROVED" | "REJECTED" {
    return decision === "PASS" ? "APPROVED" : "REJECTED";
}

function buildAutoReviewComment(
    strategy: { name: string; code: string },
    finalRecommendation: NonNullable<
        StrategyExecutionResult["finalRecommendation"]
    >,
    stepResults: StepExecutionResult[],
) {
    const lines = [finalRecommendation.summary];

    const stepSummaries = stepResults
        .filter((step) => step.status !== "SKIPPED")
        .slice(0, 6)
        .map((step) => `${step.stepName}: ${step.summary}`);

    if (stepSummaries.length) {
        lines.push("", ...stepSummaries);
    }

    return lines.join("\n").slice(0, 1000);
}

function createExecutionResultShell(
    strategy: {
        id: string;
        code: string;
        name: string;
    },
    question: ReviewQuestionDetail,
): StrategyExecutionResult {
    return {
        version: 1,
        strategy: {
            id: strategy.id,
            code: strategy.code,
            name: strategy.name,
        },
        question: {
            id: question.id,
            title: question.title,
            projectName: question.project.name,
            projectCode: question.project.code,
            datasourceName: question.datasource.name,
        },
        status: "RUNNING",
        stepResults: [],
        finalRecommendation: null,
        reviewPersistence: null,
    };
}

function buildRunResponsePayload(stepResults: StepExecutionResult[]) {
    return {
        stepResults: stepResults.map((step) => ({
            stepId: step.stepId,
            stepName: step.stepName,
            status: step.status,
            rawResponses: step.items.map((item) => item.rawResponse ?? null),
        })),
    };
}

function buildRunView(run: {
    id: string;
    status: string;
    errorMessage: string | null;
    createdAt: Date;
    finishedAt: Date | null;
    strategy: {
        id: string;
        name: string;
        code: string;
    };
    triggeredBy: {
        name: string | null;
    };
    parsedResult: Prisma.JsonValue | null;
}): AiReviewStrategyRunView {
    return {
        id: run.id,
        status: run.status,
        errorMessage: run.errorMessage,
        createdAt: run.createdAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        strategy: run.strategy,
        triggeredByName: run.triggeredBy.name ?? "未知用户",
        parsedResult: run.parsedResult as StrategyExecutionResult | null,
    };
}

async function persistRunProgress(
    runId: string,
    parsedResult: StrategyExecutionResult,
    errorMessage?: string,
) {
    await prisma.aiReviewStrategyRun.update({
        where: {
            id: runId,
        },
        data: {
            status: parsedResult.status,
            errorMessage,
            parsedResult: serializeJson(parsedResult),
            responsePayload: serializeJson(
                buildRunResponsePayload(parsedResult.stepResults),
            ),
        },
    });
}

function extractJson(text: string | null) {
    if (!text) {
        throw new Error("模型没有返回文本结果");
    }

    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? text.trim();

    const safeParseJson = (input: string) => {
        try {
            return JSON.parse(input);
        } catch {
            return JSON.parse(repairInvalidJsonEscapes(input));
        }
    };

    try {
        return safeParseJson(candidate);
    } catch {
        const start = candidate.indexOf("{");
        const end = candidate.lastIndexOf("}");

        if (start >= 0 && end > start) {
            return safeParseJson(candidate.slice(start, end + 1));
        }

        throw new Error("模型返回内容不是合法 JSON");
    }
}

function repairInvalidJsonEscapes(input: string) {
    let output = "";
    let inString = false;
    let quoteEscaped = false;

    const isValidJsonEscape = (char: string) =>
        char === '"' ||
        char === "\\" ||
        char === "/" ||
        char === "b" ||
        char === "f" ||
        char === "n" ||
        char === "r" ||
        char === "t" ||
        char === "u";

    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];

        if (!inString) {
            output += char;
            if (char === '"' && !quoteEscaped) {
                inString = true;
            }
            quoteEscaped = char === "\\" && !quoteEscaped;
            continue;
        }

        if (char === '"' && !quoteEscaped) {
            inString = false;
            output += char;
            quoteEscaped = false;
            continue;
        }

        if (char === "\\") {
            const nextChar = input[index + 1];

            if (!nextChar) {
                output += "\\\\";
                quoteEscaped = false;
                continue;
            }

            if (!isValidJsonEscape(nextChar)) {
                output += "\\\\";
                quoteEscaped = false;
                continue;
            }

            if (nextChar === "u") {
                const unicodeHex = input.slice(index + 2, index + 6);
                if (!/^[0-9a-fA-F]{4}$/.test(unicodeHex)) {
                    output += "\\\\";
                    quoteEscaped = false;
                    continue;
                }
            }

            output += char;
            quoteEscaped = true;
            continue;
        }

        output += char;
        quoteEscaped = false;
    }

    return output;
}

function compareWithOperator(
    left: number,
    operator: AiReviewComparisonOperator,
    right: number,
) {
    if (operator === ">") return left > right;
    if (operator === ">=") return left >= right;
    if (operator === "<") return left < right;
    if (operator === "<=") return left <= right;
    return left === right;
}

function renderSummaryTemplate(
    template: string | undefined,
    variables: Record<string, string | number>,
    fallback: string,
) {
    if (!template) {
        return fallback;
    }

    return Object.entries(variables).reduce(
        (current, [key, value]) =>
            current.replaceAll(`{{${key}}}`, String(value)),
        template,
    );
}

function selectFields(
    question: ReviewQuestionDetail,
    fieldKeys: string[],
): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    for (const fieldKey of fieldKeys) {
        if (fieldKey === "rawRecord") {
            payload.rawRecord = question.rawRecord;
            continue;
        }

        if (fieldKey === "title") {
            payload.title = question.title;
            continue;
        }

        if (fieldKey === "content") {
            payload.content = question.content;
            continue;
        }

        if (fieldKey === "answer") {
            payload.answer = question.answer;
            continue;
        }

        if (fieldKey === "analysis") {
            payload.analysis = question.analysis;
            continue;
        }

        if (fieldKey === "questionType") {
            payload.questionType = question.questionType;
            continue;
        }

        if (fieldKey === "difficulty") {
            payload.difficulty = question.difficulty;
            continue;
        }

        payload[fieldKey] = question.rawRecord[fieldKey] ?? null;
    }

    return payload;
}

const IMAGE_MIME_TYPES: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".avif": "image/avif",
};

function normalizeForImageMatch(value: string) {
    return value.replace(/[^a-zA-Z0-9.\-]/g, "_").toLowerCase();
}

function stripArchiveExt(value: string) {
    return value.replace(/\.(zip|rar)$/i, "");
}

function lookupImageUrlsFromMap(
    value: string,
    imageMap: Record<string, string[]>,
): string[] | null {
    const exact = imageMap[value];
    if (exact?.length) return exact;

    const normalized = normalizeForImageMatch(value);
    const normalizedNoArchive = stripArchiveExt(normalized);
    for (const [key, urls] of Object.entries(imageMap)) {
        if (!urls.length) continue;
        const normalizedKey = normalizeForImageMatch(key);
        if (normalizedKey === normalized) {
            return urls;
        }
        if (stripArchiveExt(normalizedKey) === normalizedNoArchive) {
            return urls;
        }
    }

    return null;
}

async function readImageAsBase64(
    url: string,
): Promise<{ base64: string; mimeType: string } | null> {
    if (!url.startsWith(UPLOAD_URL_PREFIX)) return null;

    const relativePath = url.slice(UPLOAD_URL_PREFIX.length);
    const absolutePath = await resolveUploadPath(relativePath);
    if (!absolutePath) return null;

    const ext = path.extname(absolutePath).toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[ext];
    if (!mimeType) return null;

    const buffer = await fs.readFile(absolutePath);
    return { base64: buffer.toString("base64"), mimeType };
}

/**
 * Resolve image fields in the selected fields to base64 AiMessageParts.
 * Returns image parts and a modified selectedFields where image fields
 * are replaced with a placeholder.
 */
async function resolveImageParts(
    selectedFields: Record<string, unknown>,
    question: ReviewQuestionDetail,
): Promise<{
    imageParts: AiMessagePart[];
    fieldsWithPlaceholders: Record<string, unknown>;
}> {
    const imageFieldSet = new Set(question.imageFields ?? []);
    const imageMap = question.imageMap ?? {};
    const imageParts: AiMessagePart[] = [];
    const fieldsWithPlaceholders: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(selectedFields)) {
        if (!imageFieldSet.has(key)) {
            fieldsWithPlaceholders[key] = value;
            continue;
        }

        // Mark null/empty image fields as null — still visible in promptInput
        // but excluded from the AI message text by buildUserPrompt
        if (value == null || (typeof value === "string" && !value.trim())) {
            fieldsWithPlaceholders[key] = null;
            continue;
        }

        const strValue = String(value).trim();
        const urls = lookupImageUrlsFromMap(strValue, imageMap);

        if (!urls?.length) {
            // No matching images — include as text so AI knows the field exists
            fieldsWithPlaceholders[key] = strValue;
            continue;
        }

        fieldsWithPlaceholders[key] = `[图片: ${strValue}]`;

        for (const url of urls) {
            const imageData = await readImageAsBase64(url);
            if (imageData) {
                imageParts.push({
                    type: "image_base64",
                    base64: imageData.base64,
                    mimeType: imageData.mimeType,
                });
            }
        }
    }

    return { imageParts, fieldsWithPlaceholders };
}

function getToolContract(type: AiReviewAiToolType) {
    switch (type) {
        case "COMPREHENSIVE_CHECK":
            return `{"passed":boolean,"summary":string,"issues":[{"category":string,"severity":"LOW|MEDIUM|HIGH","field":string,"title":string,"detail":string}],"warnings":string[],"suggestions":string[]}`;
        case "QUESTION_COMPLETENESS_CHECK":
            return `{"passed":boolean,"summary":string,"missingFields":string[],"warnings":string[]}`;
        case "TEXT_QUALITY_CHECK":
            return `{"passed":boolean,"severity":"LOW|MEDIUM|HIGH","summary":string,"issues":[{"field":string,"type":string,"content":string}],"suggestions":string[]}`;
        case "TRANSLATE_TO_CHINESE":
            return `{"translatedText":string,"summary":string,"sourceLanguage":string|null}`;
        case "AI_SOLVE_QUESTION":
            return `{"answer":string,"normalizedAnswer":string,"reasoning":string,"confidence":0-1}`;
        case "ANSWER_MATCH_CHECK":
            return `{"matchLevel":"EXACT|SEMANTIC_MATCH|PARTIAL_MATCH|MISMATCH|UNKNOWN","isConsistent":boolean,"summary":string,"difference":string|null}`;
        case "REASONING_COMPARE":
            return `{"isConsistent":boolean,"summary":string,"missingPoints":string[],"riskLevel":"LOW|MEDIUM|HIGH"}`;
        case "DIFFICULTY_EVALUATION":
            return `{"difficultyLevel":"EASY|MEDIUM|HARD","score":1-5,"summary":string,"evidence":string[]}`;
        case "REVIEW_SUMMARY":
            return `{"recommendedDecision":"PASS|REJECT","riskLevel":"LOW|MEDIUM|HIGH","summary":string,"keyIssues":string[]}`;
    }
}

function buildSystemPrompt(step: AiReviewAiToolStep) {
    const formattingGuard =
        step.toolType === "AI_SOLVE_QUESTION"
            ? "所有字符串字段必须是纯文本，禁止输出 Markdown、代码块、LaTeX 公式或任何反斜杠数学命令（例如 \\omega、\\frac、\\text）。reasoning 字段只能写自然语言解释。"
            : "所有字符串字段必须是纯文本，禁止输出 Markdown、代码块、LaTeX 公式或任何未转义的反斜杠命令。";

    return [
        `你正在执行题目审核系统中的「${aiReviewToolLabels[step.toolType]}」步骤。`,
        "必须只返回一个 JSON 对象，不要输出 Markdown、代码块、解释或额外文字。",
        formattingGuard,
        "如果信息不足，也要返回符合字段结构的 JSON，并在 summary 中明确说明原因。",
        `输出结构：${getToolContract(step.toolType)}`,
    ].join("\n");
}

function buildUserPrompt(
    step: AiReviewAiToolStep,
    question: ReviewQuestionDetail,
    selectedFields: Record<string, unknown>,
    sourceOutput: unknown,
    previousResults: StepExecutionResult[],
) {
    // Filter out null image fields so they don't appear in the AI prompt
    const filteredFields = Object.fromEntries(
        Object.entries(selectedFields).filter(([, v]) => v != null),
    );

    const payload: Record<string, unknown> = {
        task: aiReviewToolLabels[step.toolType],
        additionalInstruction: step.promptTemplate,
        questionMeta: {
            id: question.id,
            projectCode: question.project.code,
            projectName: question.project.name,
            datasourceName: question.datasource.name,
            questionType: question.questionType,
            difficulty: question.difficulty,
        },
        selectedFields: filteredFields,
    };

    if (sourceOutput) {
        payload.upstreamResult = sourceOutput;
    }

    if (step.toolType === "REVIEW_SUMMARY") {
        payload.previousResults = previousResults.map((result) => ({
            stepId: result.stepId,
            stepName: result.stepName,
            stepType: result.stepType,
            status: result.status,
            summary: result.summary,
            metrics: result.metrics,
            items: result.items
                .filter((item) => item.status === "SUCCESS")
                .map((item) => ({
                    output: item.output,
                    derived: item.derived,
                })),
        }));
    }

    return [
        "请严格按照系统要求完成本次审核步骤。",
        "以下是输入数据 JSON：",
        JSON.stringify(payload, null, 2),
    ].join("\n\n");
}

function coerceAiOutput(
    toolType: AiReviewAiToolType,
    payload: Record<string, unknown>,
) {
    const toLooseString = (value: unknown): string | null => {
        if (typeof value === "string") {
            const trimmed = value.trim();
            return trimmed || null;
        }

        if (
            typeof value === "number" ||
            typeof value === "boolean" ||
            typeof value === "bigint"
        ) {
            return String(value);
        }

        if (value && typeof value === "object" && !Array.isArray(value)) {
            const record = value as Record<string, unknown>;
            const title: string | null = toLooseString(record.title);
            const detail: string | null =
                toLooseString(record.detail) ??
                toLooseString(record.content) ??
                toLooseString(record.summary) ??
                toLooseString(record.message);

            if (title && detail) {
                return `${title}：${detail}`;
            }

            if (title) {
                return title;
            }

            if (detail) {
                return detail;
            }
        }

        try {
            const text = JSON.stringify(value);
            return text && text !== "null" ? text : null;
        } catch {
            return null;
        }
    };
    const toStringList = (value: unknown) => {
        if (!Array.isArray(value)) {
            return [] as string[];
        }

        return value
            .map((item) => toLooseString(item))
            .filter((item): item is string => Boolean(item));
    };
    const normalizeSeverity = (value: unknown) => {
        if (typeof value !== "string") {
            return "MEDIUM";
        }

        const normalized = value.trim().toUpperCase();
        return normalized === "LOW" ||
            normalized === "MEDIUM" ||
            normalized === "HIGH"
            ? normalized
            : "MEDIUM";
    };
    const coerceComprehensiveIssues = (value: unknown) => {
        if (!Array.isArray(value)) {
            return [] as Array<{
                category: string;
                severity: "LOW" | "MEDIUM" | "HIGH";
                field: string;
                title: string;
                detail: string;
            }>;
        }

        return value
            .map((item) => {
                if (!item || typeof item !== "object" || Array.isArray(item)) {
                    return null;
                }

                const record = item as Record<string, unknown>;
                const title = toLooseString(record.title);
                const detail =
                    toLooseString(record.detail) ??
                    toLooseString(record.content);

                if (!title || !detail) {
                    return null;
                }

                return {
                    category:
                        toLooseString(record.category) ??
                        toLooseString(record.type) ??
                        "其他",
                    severity: normalizeSeverity(record.severity) as
                        | "LOW"
                        | "MEDIUM"
                        | "HIGH",
                    field: toLooseString(record.field) ?? "unknown",
                    title,
                    detail,
                };
            })
            .filter(
                (
                    item,
                ): item is {
                    category: string;
                    severity: "LOW" | "MEDIUM" | "HIGH";
                    field: string;
                    title: string;
                    detail: string;
                } => Boolean(item),
            );
    };
    const coerceTextQualityIssues = (value: unknown) => {
        if (!Array.isArray(value)) {
            return [] as Array<{
                field: string;
                type: string;
                content: string;
            }>;
        }

        return value
            .map((item) => {
                if (!item || typeof item !== "object" || Array.isArray(item)) {
                    return null;
                }

                const record = item as Record<string, unknown>;
                const content =
                    toLooseString(record.content) ??
                    toLooseString(record.detail) ??
                    toLooseString(record.summary);

                if (!content) {
                    return null;
                }

                return {
                    field: toLooseString(record.field) ?? "unknown",
                    type:
                        toLooseString(record.type) ??
                        toLooseString(record.category) ??
                        "其他",
                    content,
                };
            })
            .filter(
                (
                    item,
                ): item is {
                    field: string;
                    type: string;
                    content: string;
                } => Boolean(item),
            );
    };

    payload.summary = toLooseString(payload.summary) ?? "";

    if (toolType === "AI_SOLVE_QUESTION") {
        const answer = toLooseString(payload.answer) ?? "";
        if (!payload.normalizedAnswer && answer) {
            payload.normalizedAnswer = normalizeAnswer(answer);
        }
        payload.answer = answer;
        payload.reasoning = toLooseString(payload.reasoning) ?? "";
        payload.normalizedAnswer =
            toLooseString(payload.normalizedAnswer) ?? "";

        if (typeof payload.confidence === "string") {
            const next = Number(payload.confidence);
            if (!Number.isNaN(next)) {
                payload.confidence = next;
            }
        }
    }

    if (
        toolType === "DIFFICULTY_EVALUATION" &&
        typeof payload.score === "string"
    ) {
        const next = Number(payload.score);
        if (!Number.isNaN(next)) {
            payload.score = next;
        }
    }

    if (toolType === "COMPREHENSIVE_CHECK") {
        payload.issues = coerceComprehensiveIssues(payload.issues);
        payload.warnings = toStringList(payload.warnings);
        payload.suggestions = toStringList(payload.suggestions);
    }

    if (toolType === "QUESTION_COMPLETENESS_CHECK") {
        payload.missingFields = toStringList(payload.missingFields);
        payload.warnings = toStringList(payload.warnings);
    }

    if (toolType === "TEXT_QUALITY_CHECK") {
        payload.severity = normalizeSeverity(payload.severity);
        payload.issues = coerceTextQualityIssues(payload.issues);
        payload.suggestions = toStringList(payload.suggestions);
    }

    if (toolType === "TRANSLATE_TO_CHINESE") {
        payload.translatedText = toLooseString(payload.translatedText) ?? "";
        payload.sourceLanguage =
            payload.sourceLanguage === null
                ? null
                : (toLooseString(payload.sourceLanguage) ?? null);
    }

    if (toolType === "ANSWER_MATCH_CHECK") {
        payload.summary = toLooseString(payload.summary) ?? "";
        payload.difference =
            payload.difference === null
                ? null
                : (toLooseString(payload.difference) ?? null);
    }

    if (toolType === "REASONING_COMPARE") {
        payload.summary = toLooseString(payload.summary) ?? "";
        payload.missingPoints = toStringList(payload.missingPoints);
        payload.riskLevel = normalizeSeverity(payload.riskLevel);
    }

    if (toolType === "DIFFICULTY_EVALUATION") {
        payload.summary = toLooseString(payload.summary) ?? "";
        payload.evidence = toStringList(payload.evidence);
    }

    if (toolType === "REVIEW_SUMMARY") {
        payload.summary = toLooseString(payload.summary) ?? "";
        payload.keyIssues = toStringList(payload.keyIssues);
        payload.riskLevel = normalizeSeverity(payload.riskLevel);
        // Normalize decision: only PASS is accepted as-is; anything else (NEEDS_REVISION, etc.) maps to REJECT
        if (payload.recommendedDecision !== "PASS") {
            payload.recommendedDecision = "REJECT";
        }
    }

    return payload;
}

function deriveMetrics(
    toolType: AiReviewAiToolType,
    output: Record<string, unknown>,
    question: ReviewQuestionDetail,
) {
    const metrics: Record<string, unknown> = {};

    if (typeof output.passed === "boolean") {
        metrics.passed = output.passed;
    }

    if (Array.isArray(output.issues)) {
        metrics.issueCount = output.issues.length;
    }

    if (typeof output.isConsistent === "boolean") {
        metrics.isConsistent = output.isConsistent;
    }

    if (typeof output.confidence === "number") {
        metrics.confidence = output.confidence;
    }

    if (typeof output.score === "number") {
        metrics.score = output.score;
    }

    if (typeof output.matchLevel === "string") {
        metrics.matchLevel = output.matchLevel;
    }

    if (typeof output.riskLevel === "string") {
        metrics.riskLevel = output.riskLevel;
    }

    if (typeof output.difficultyLevel === "string") {
        metrics.difficultyLevel = output.difficultyLevel;
    }

    if (typeof output.recommendedDecision === "string") {
        metrics.recommendedDecision = output.recommendedDecision;
    }

    if (toolType === "AI_SOLVE_QUESTION") {
        const normalizedAnswerValue =
            typeof output.normalizedAnswer === "string"
                ? normalizeAnswer(output.normalizedAnswer)
                : normalizeAnswer(
                      typeof output.answer === "string"
                          ? output.answer
                          : undefined,
                  );
        const standardAnswer = normalizeAnswer(question.answer);

        metrics.normalizedAnswer = normalizedAnswerValue;
        metrics.isCorrect = Boolean(
            normalizedAnswerValue &&
            standardAnswer &&
            normalizedAnswerValue === standardAnswer,
        );
    }

    return metrics;
}

async function executeAiToolItem(
    step: AiReviewAiToolStep,
    question: ReviewQuestionDetail,
    previousResults: StepExecutionResult[],
    sourceItem: StepExecutionItem | undefined,
    index: number,
    runIndex: number,
    options?: {
        enableBuiltInTools?: boolean;
    },
) {
    const selectedFields = selectFields(question, step.fieldKeys);

    // Resolve image fields to base64 parts for multimodal AI invocation
    const { imageParts, fieldsWithPlaceholders } = await resolveImageParts(
        selectedFields,
        question,
    );

    const promptInput = {
        runIndex,
        sourceOutput: sourceItem?.output ?? null,
        selectedFields: fieldsWithPlaceholders,
        originalSelectedFields: selectedFields,
    };

    const userPromptText = buildUserPrompt(
        step,
        question,
        fieldsWithPlaceholders,
        sourceItem?.output,
        previousResults,
    );

    // Build user message: text + optional image parts
    const userContent: AiMessagePart[] = [
        { type: "text", text: userPromptText },
        ...imageParts,
    ];

    const response = await invokeAiModel({
        modelCode: step.modelCode,
        stream: true,
        responseMimeType: "application/json",
        enableBuiltInTools: options?.enableBuiltInTools,
        messages: [
            {
                role: "system",
                content: buildSystemPrompt(step),
            },
            {
                role: "user",
                content: imageParts.length > 0 ? userContent : userPromptText,
            },
        ],
    });

    if (!response.ok) {
        return {
            index,
            status: "FAILED" as const,
            sourceStepId: step.sourceStepId,
            promptInput,
            requestMeta: {
                modelCode: step.modelCode,
                protocol: response.protocol,
            },
            rawResponse: {
                failure: response,
            },
            error: response.error,
        };
    }

    const resolvedResponse = await resolveAiInvocationText(response);
    const responseText = resolvedResponse.text;
    const responseRaw = resolvedResponse.raw;

    try {
        const parsedRaw = extractJson(responseText);
        const normalizedPayload =
            parsedRaw &&
            typeof parsedRaw === "object" &&
            !Array.isArray(parsedRaw)
                ? coerceAiOutput(
                      step.toolType,
                      parsedRaw as Record<string, unknown>,
                  )
                : (() => {
                      throw new Error("模型返回的 JSON 不是对象");
                  })();
        const parsed =
            aiReviewOutputSchemas[step.toolType].safeParse(normalizedPayload);

        if (!parsed.success) {
            throw new Error(
                parsed.error.issues[0]?.message ?? "模型结果结构不合法",
            );
        }

        return {
            index,
            status: "SUCCESS" as const,
            sourceStepId: step.sourceStepId,
            promptInput,
            requestMeta: {
                modelCode: response.modelCode,
                protocol: response.protocol,
                reasoningLevel: response.reasoningLevel,
                providerCode: response.route.providerCode,
                providerName: response.route.providerName,
                endpointCode: response.route.endpointCode,
                endpointLabel: response.route.endpointLabel,
                baseUrl: response.route.baseUrl,
            },
            output: parsed.data,
            rawResponse: {
                route: response.route,
                raw: responseRaw,
            },
            derived: deriveMetrics(step.toolType, parsed.data, question),
        };
    } catch (error) {
        return {
            index,
            status: "FAILED" as const,
            sourceStepId: step.sourceStepId,
            promptInput,
            requestMeta: {
                modelCode: response.modelCode,
                protocol: response.protocol,
                reasoningLevel: response.reasoningLevel,
                providerCode: response.route.providerCode,
                providerName: response.route.providerName,
                endpointCode: response.route.endpointCode,
                endpointLabel: response.route.endpointLabel,
                baseUrl: response.route.baseUrl,
            },
            rawResponse: {
                route: response.route,
                raw: responseRaw,
                text: responseText,
            },
            error: error instanceof Error ? error.message : "模型结果解析失败",
        };
    }
}

function buildRunningAiToolStepResult(
    step: AiReviewAiToolStep,
    items: StepExecutionItem[],
    totalItems: number,
): StepExecutionResult {
    return {
        stepId: step.id,
        stepName: step.name,
        stepKind: "AI_TOOL",
        stepType: step.toolType,
        status: "RUNNING",
        summary:
            totalItems <= 1
                ? `正在执行 ${step.name}...`
                : `正在执行 ${step.name}，已完成 ${items.length}/${totalItems} 项。`,
        items,
    };
}

function buildAiToolTasks(
    step: AiReviewAiToolStep,
    previousResults: StepExecutionResult[],
) {
    const sourceStepItems =
        step.sourceStepId &&
        previousResults.find((item) => item.stepId === step.sourceStepId)
            ? previousResults
                  .find((item) => item.stepId === step.sourceStepId)!
                  .items.filter((item) => item.status === "SUCCESS")
            : [undefined];

    if (step.sourceStepId && !sourceStepItems.length) {
        return {
            sourceStepItems,
            tasks: [] as Array<{
                index: number;
                runIndex: number;
                sourceItem: StepExecutionItem | undefined;
            }>,
        };
    }

    const tasks: Array<{
        index: number;
        runIndex: number;
        sourceItem: StepExecutionItem | undefined;
    }> = [];
    let currentIndex = 1;

    for (const sourceItem of sourceStepItems) {
        for (let runIndex = 1; runIndex <= step.runCount; runIndex += 1) {
            tasks.push({
                index: currentIndex,
                runIndex,
                sourceItem,
            });
            currentIndex += 1;
        }
    }

    return {
        sourceStepItems,
        tasks,
    };
}

function buildCompletedAiToolStepResult(
    step: AiReviewAiToolStep,
    items: StepExecutionItem[],
): StepExecutionResult {
    const successItems = items.filter((item) => item.status === "SUCCESS");
    const firstSuccess = successItems[0];
    const firstOutput =
        firstSuccess?.output && typeof firstSuccess.output === "object"
            ? (firstSuccess.output as Record<string, unknown>)
            : null;
    const summary =
        typeof firstOutput?.summary === "string"
            ? firstOutput.summary
            : step.toolType === "AI_SOLVE_QUESTION"
              ? `已完成 ${successItems.length} 次 AI 作答`
              : successItems.length
                ? `${step.name} 已完成`
                : `${step.name} 执行失败`;

    return {
        stepId: step.id,
        stepName: step.name,
        stepKind: "AI_TOOL",
        stepType: step.toolType,
        status: successItems.length ? "SUCCESS" : "FAILED",
        summary,
        items,
        error: successItems.length ? undefined : items[0]?.error,
    };
}

async function runAiToolStep(
    step: AiReviewAiToolStep,
    question: ReviewQuestionDetail,
    previousResults: StepExecutionResult[],
    executionOptions?: {
        enableBuiltInTools?: boolean;
    },
    onProgress?: (partial: StepExecutionResult) => void | Promise<void>,
) {
    const { sourceStepItems, tasks } = buildAiToolTasks(step, previousResults);

    if (step.sourceStepId && !sourceStepItems.length) {
        return {
            stepId: step.id,
            stepName: step.name,
            stepKind: "AI_TOOL" as const,
            stepType: step.toolType,
            status: "SKIPPED" as const,
            summary: "来源步骤没有可用结果，当前步骤已跳过。",
            items: [],
        };
    }

    if (onProgress) {
        await onProgress(buildRunningAiToolStepResult(step, [], tasks.length));
    }

    const items: Array<StepExecutionItem | undefined> = new Array(tasks.length);
    let progressChain = Promise.resolve();

    await Promise.all(
        tasks.map(async (task, position) => {
            const item = await executeAiToolItem(
                step,
                question,
                previousResults,
                task.sourceItem,
                task.index,
                task.runIndex,
                executionOptions,
            );

            items[position] = item;

            if (!onProgress) {
                return;
            }

            const completedItems = items.filter(
                (current): current is StepExecutionItem => Boolean(current),
            );

            progressChain = progressChain.then(() =>
                onProgress(
                    buildRunningAiToolStepResult(
                        step,
                        completedItems,
                        tasks.length,
                    ),
                ),
            );
            await progressChain;
        }),
    );

    await progressChain;

    return buildCompletedAiToolStepResult(
        step,
        items.filter((item): item is StepExecutionItem => Boolean(item)),
    );
}

function readMetricValue(item: StepExecutionItem, metric: string) {
    const derived = item.derived ?? {};

    if (metric in derived) {
        return derived[metric];
    }

    const output =
        item.output && typeof item.output === "object"
            ? (item.output as Record<string, unknown>)
            : {};

    return output[metric];
}

function runRuleStep(
    step: AiReviewRuleStep,
    previousResults: StepExecutionResult[],
) {
    const sourceStep = previousResults.find(
        (result) => result.stepId === step.sourceStepId,
    );

    if (!sourceStep) {
        return {
            stepId: step.id,
            stepName: step.name,
            stepKind: "RULE" as const,
            stepType: step.ruleType,
            status: "FAILED" as const,
            summary: "来源步骤不存在，无法执行规则判断。",
            items: [],
            error: "来源步骤不存在",
        };
    }

    const successItems = sourceStep.items.filter(
        (item) => item.status === "SUCCESS",
    );

    if (!successItems.length) {
        return {
            stepId: step.id,
            stepName: step.name,
            stepKind: "RULE" as const,
            stepType: step.ruleType,
            status: "SKIPPED" as const,
            summary: "来源步骤没有成功结果，规则判断已跳过。",
            items: [],
        };
    }

    if (step.ruleType === "MAJORITY_VOTE") {
        const votes = new Map<string, number>();

        for (const item of successItems) {
            const value = readMetricValue(item, step.metric);
            if (value === null || value === undefined || value === "") {
                continue;
            }

            const key = String(value);
            votes.set(key, (votes.get(key) ?? 0) + 1);
        }

        const sortedVotes = [...votes.entries()].sort(
            (left, right) => right[1] - left[1],
        );
        const [majorityValue = "", majorityCount = 0] = sortedVotes[0] ?? [];
        const matched = majorityCount >= step.minimumVotes;
        const summary = renderSummaryTemplate(
            step.summaryTemplate,
            {
                total: successItems.length,
                majorityCount,
                minimumVotes: step.minimumVotes,
                majorityValue,
            },
            matched
                ? `多数投票结果为 ${majorityValue}，票数 ${majorityCount}/${successItems.length}。`
                : `多数投票未达到最少票数要求，当前最高票 ${majorityCount}/${successItems.length}。`,
        );

        return {
            stepId: step.id,
            stepName: step.name,
            stepKind: "RULE" as const,
            stepType: step.ruleType,
            status: "SUCCESS" as const,
            summary,
            outcomeLabel: matched ? step.outcomeLabel : undefined,
            items: [
                {
                    index: 1,
                    status: "SUCCESS" as const,
                    output: {
                        matched,
                        majorityValue,
                        majorityCount,
                        total: successItems.length,
                    },
                },
            ],
            metrics: {
                matched,
                majorityValue,
                majorityCount,
                total: successItems.length,
            },
        };
    }

    const booleanValues = successItems
        .map((item) => readMetricValue(item, step.metric))
        .filter((value): value is boolean => typeof value === "boolean");

    if (!booleanValues.length) {
        return {
            stepId: step.id,
            stepName: step.name,
            stepKind: "RULE" as const,
            stepType: step.ruleType,
            status: "FAILED" as const,
            summary: "来源步骤缺少可统计的结构化结果。",
            items: [],
            error: "来源步骤缺少可统计的结构化结果",
        };
    }

    const total = booleanValues.length;
    const trueCount = booleanValues.filter((value) => value === true).length;
    const falseCount = booleanValues.filter((value) => value === false).length;
    const trueRatio = total ? trueCount / total : 0;
    const falseRatio = total ? falseCount / total : 0;

    const actualValue =
        step.ruleType === "COUNT_THRESHOLD"
            ? step.aggregate === "COUNT_TRUE"
                ? trueCount
                : falseCount
            : step.aggregate === "TRUE_RATIO"
              ? trueRatio
              : falseRatio;
    const matched = compareWithOperator(
        actualValue,
        step.operator,
        step.threshold,
    );
    const summary = renderSummaryTemplate(
        step.summaryTemplate,
        {
            total,
            trueCount,
            falseCount,
            trueRatio: Number(trueRatio.toFixed(4)),
            falseRatio: Number(falseRatio.toFixed(4)),
            actualValue: Number(actualValue.toFixed(4)),
            threshold: step.threshold,
        },
        matched
            ? `${step.name} 已命中，统计值 ${actualValue.toFixed(4)}。`
            : `${step.name} 未命中，统计值 ${actualValue.toFixed(4)}。`,
    );

    return {
        stepId: step.id,
        stepName: step.name,
        stepKind: "RULE" as const,
        stepType: step.ruleType,
        status: "SUCCESS" as const,
        summary,
        outcomeLabel: matched ? step.outcomeLabel : undefined,
        items: [
            {
                index: 1,
                status: "SUCCESS" as const,
                output: {
                    matched,
                    actualValue,
                    threshold: step.threshold,
                    total,
                    trueCount,
                    falseCount,
                    trueRatio,
                    falseRatio,
                },
            },
        ],
        metrics: {
            matched,
            actualValue,
            threshold: step.threshold,
            total,
            trueCount,
            falseCount,
            trueRatio,
            falseRatio,
        },
    };
}

function resolveFinalRecommendation(stepResults: StepExecutionResult[]) {
    const reviewSummaryStep = [...stepResults]
        .reverse()
        .find(
            (step) =>
                step.stepKind === "AI_TOOL" &&
                step.stepType === "REVIEW_SUMMARY" &&
                step.status === "SUCCESS",
        );

    if (reviewSummaryStep?.items[0]?.output) {
        const output = reviewSummaryStep.items[0].output as Record<
            string,
            unknown
        >;
        const decision = toReviewDecision(output.recommendedDecision);

        return {
            decision,
            riskLevel:
                typeof output.riskLevel === "string"
                    ? output.riskLevel
                    : undefined,
            summary:
                typeof output.summary === "string"
                    ? output.summary
                    : "已生成审核总结建议。",
        };
    }

    const matchedRule = stepResults.find(
        (step) => step.stepKind === "RULE" && step.outcomeLabel,
    );

    if (matchedRule) {
        const decision = toReviewDecision(matchedRule.outcomeLabel);

        return {
            decision,
            summary: matchedRule.summary,
        };
    }

    return null;
}

function hasBlockingComprehensiveCheckFailure(
    stepResults: StepExecutionResult[],
) {
    return stepResults.some((step) => {
        if (
            step.stepKind !== "AI_TOOL" ||
            step.stepType !== "COMPREHENSIVE_CHECK" ||
            step.status !== "SUCCESS"
        ) {
            return false;
        }

        return step.items.some((item) => {
            if (item.status !== "SUCCESS" || !item.output) {
                return false;
            }

            const output =
                typeof item.output === "object"
                    ? (item.output as Record<string, unknown>)
                    : null;

            return output?.passed === false;
        });
    });
}

function strategyAppliesToQuestion(
    strategy: { projectIds: unknown; datasourceIds: unknown },
    question: ReviewQuestionDetail,
) {
    const projectIds = parseStringArray(strategy.projectIds);
    if (projectIds.length && !projectIds.includes(question.project.id)) {
        return false;
    }

    const datasourceIds = parseStringArray(strategy.datasourceIds);
    if (!datasourceIds.length) {
        return true;
    }

    return datasourceIds.includes(question.datasource.id);
}

function isRunnableReviewStrategy(definition: AiReviewStrategyDefinition) {
    const enabledSteps = definition.steps.filter((step) => step.enabled);

    if (!enabledSteps.length) {
        return false;
    }

    return enabledSteps.some(
        (step) =>
            step.kind !== "AI_TOOL" || step.toolType !== "TRANSLATE_TO_CHINESE",
    );
}

export async function getAiReviewStrategyConsoleData(input: {
    userId: string;
    platformRole: PlatformRoleValue;
    scopeAdminId?: string;
}) {
    if (!process.env.DATABASE_URL) {
        return {
            databaseEnabled: false,
            modelOptions: [] as Array<{
                code: string;
                label: string;
                protocol: string;
            }>,
            projects: [] as Array<{
                id: string;
                name: string;
                code: string;
            }>,
            datasources: [] as Array<{
                id: string;
                name: string;
                projectId: string;
                projectName: string;
                projectCode: string;
                rawFieldOrder: string[];
            }>,
            strategies: [] as Array<{
                id: string;
                code: string;
                name: string;
                description: string | null;
                enabled: boolean;
                scopeAdminId: string;
                scopeAdminName: string;
                projectIds: string[];
                datasourceIds: string[];
                definition: AiReviewStrategyDefinition;
                createdByName: string;
                updatedAt: string;
            }>,
            adminScopeOptions: [] as Array<{
                id: string;
                name: string;
                username: string | null;
            }>,
            activeScopeAdminId: null as string | null,
        };
    }

    const adminScopeOptions = await getPlatformAdminScopeOptions();
    const activeScopeAdminId =
        input.platformRole === "SUPER_ADMIN"
            ? input.scopeAdminId ??
              adminScopeOptions.find((admin) => admin.id === input.userId)?.id ??
              adminScopeOptions[0]?.id ??
              null
            : input.userId;

    if (activeScopeAdminId) {
        await ensureDefaultAiReviewStrategyForAdmin({
            scopeAdminId: activeScopeAdminId,
            createdById: input.userId,
        });
    }

    const [models, projects, datasources, strategies] = await Promise.all([
        prisma.aiModel.findMany({
            orderBy: [{ label: "asc" }, { code: "asc" }],
            select: {
                code: true,
                label: true,
                protocol: true,
            },
        }),
        prisma.project.findMany({
            where: {
                status: "ACTIVE",
            },
            orderBy: [{ name: "asc" }],
            select: {
                id: true,
                name: true,
                code: true,
            },
        }),
        prisma.projectDataSource.findMany({
            where: {
                status: "ACTIVE",
            },
            orderBy: [{ project: { name: "asc" } }, { name: "asc" }],
            select: {
                id: true,
                name: true,
                projectId: true,
                syncConfig: true,
                project: {
                    select: {
                        name: true,
                        code: true,
                    },
                },
            },
        }),
        prisma.aiReviewStrategy.findMany({
            where:
                input.platformRole === "SUPER_ADMIN" && !activeScopeAdminId
                    ? undefined
                    : {
                          scopeAdminId:
                              input.platformRole === "SUPER_ADMIN"
                                  ? activeScopeAdminId ?? undefined
                                  : input.userId,
                      },
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            include: {
                createdBy: {
                    select: {
                        name: true,
                    },
                },
                scopeAdmin: {
                    select: {
                        name: true,
                    },
                },
            },
        }),
    ]);

    return {
        databaseEnabled: true,
        modelOptions: models.map((model) => ({
            code: model.code,
            label: model.label ?? model.code,
            protocol: model.protocol,
        })),
        projects,
        datasources: datasources.map((datasource) => ({
            id: datasource.id,
            name: datasource.name,
            projectId: datasource.projectId,
            projectName: datasource.project.name,
            projectCode: datasource.project.code,
            rawFieldOrder: extractRawFieldOrder(datasource.syncConfig),
        })),
        strategies: strategies
            .map((strategy) => {
                const definition = parseDefinition(strategy.definition);

                if (!definition) {
                    return null;
                }

                return {
                    id: strategy.id,
                    code: strategy.code,
                    name: strategy.name,
                    description: strategy.description,
                    enabled: strategy.enabled,
                    scopeAdminId: strategy.scopeAdminId,
                    scopeAdminName: strategy.scopeAdmin.name,
                    projectIds: parseStringArray(strategy.projectIds),
                    datasourceIds: parseStringArray(strategy.datasourceIds),
                    definition,
                    createdByName: strategy.createdBy.name,
                    updatedAt: strategy.updatedAt.toISOString(),
                };
            })
            .filter((strategy): strategy is NonNullable<typeof strategy> =>
                Boolean(strategy),
            ),
        adminScopeOptions,
        activeScopeAdminId,
    };
}

export async function getApplicableAiReviewStrategies(
    question: ReviewQuestionDetail,
    viewer?: {
        userId: string;
        platformRole: PlatformRoleValue;
    },
) {
    if (!process.env.DATABASE_URL) {
        return [];
    }

    const scopeAdminId = viewer
        ? await resolveUserAdminScopeId(viewer.userId, viewer.platformRole)
        : null;

    const strategies = await prisma.aiReviewStrategy.findMany({
        where: {
            enabled: true,
            ...(viewer?.platformRole === "SUPER_ADMIN"
                ? {}
                : {
                      scopeAdminId: scopeAdminId ?? "__no_scope__",
                  }),
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    const definitions = strategies
        .map((strategy) => ({
            strategy,
            definition: parseDefinition(strategy.definition),
        }))
        .filter(
            (
                item,
            ): item is {
                strategy: (typeof strategies)[number];
                definition: AiReviewStrategyDefinition;
            } => Boolean(item.definition),
        );

    const modelCodes = [
        ...new Set(
            definitions.flatMap(({ definition }) =>
                definition.steps
                    .filter((step) => step.kind === "AI_TOOL")
                    .map((step) => step.modelCode),
            ),
        ),
    ];

    const models = modelCodes.length
        ? await prisma.aiModel.findMany({
              where: {
                  code: {
                      in: modelCodes,
                  },
              },
              select: {
                  code: true,
                  builtInTools: true,
              },
          })
        : [];

    const modelBuiltInToolsMap = Object.fromEntries(
        models.map((model) => [
            model.code,
            model.builtInTools as AiBuiltInToolType[],
        ]),
    ) as Record<string, AiBuiltInToolType[]>;

    return definitions
        .map(({ strategy, definition }) => {
            if (
                !strategyAppliesToQuestion(strategy, question) ||
                !isRunnableReviewStrategy(definition)
            ) {
                return null;
            }

            const builtInTools = [
                ...new Set(
                    definition.steps.flatMap((step) =>
                        step.kind === "AI_TOOL"
                            ? (modelBuiltInToolsMap[step.modelCode] ?? [])
                            : [],
                    ),
                ),
            ];

            return {
                id: strategy.id,
                name: strategy.name,
                code: strategy.code,
                description: strategy.description,
                stepCount: definition.steps.length,
                datasourceIds: parseStringArray(strategy.datasourceIds),
                builtInTools,
            };
        })
        .filter((strategy): strategy is NonNullable<typeof strategy> =>
            Boolean(strategy),
        );
}

export async function getReviewQuestionListAiStrategies(
    projectIds?: string[],
    viewer?: {
        userId: string;
        platformRole: PlatformRoleValue;
    },
) {
    if (!process.env.DATABASE_URL) {
        return [];
    }

    const scopeAdminId = viewer
        ? await resolveUserAdminScopeId(viewer.userId, viewer.platformRole)
        : null;
    const allowedProjectIds = projectIds ? new Set(projectIds) : null;
    const strategies = await prisma.aiReviewStrategy.findMany({
        where: {
            enabled: true,
            ...(viewer?.platformRole === "SUPER_ADMIN"
                ? {}
                : {
                      scopeAdminId: scopeAdminId ?? "__no_scope__",
                  }),
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    return strategies
        .map((strategy) => {
            const definition = parseDefinition(strategy.definition);

            if (!definition || !isRunnableReviewStrategy(definition)) {
                return null;
            }

            const strategyProjectIds = parseStringArray(strategy.projectIds);

            if (
                allowedProjectIds &&
                strategyProjectIds.length &&
                !strategyProjectIds.some((projectId) =>
                    allowedProjectIds.has(projectId),
                )
            ) {
                return null;
            }

            return {
                id: strategy.id,
                name: strategy.name,
                code: strategy.code,
                description: strategy.description,
                stepCount: definition.steps.length,
                projectIds: strategyProjectIds,
                datasourceIds: parseStringArray(strategy.datasourceIds),
            };
        })
        .filter((strategy): strategy is NonNullable<typeof strategy> =>
            Boolean(strategy),
        );
}

export async function getAiReviewStrategyRunsForQuestion(
    questionId: string,
    viewer?: {
        userId: string;
        platformRole: PlatformRoleValue;
    },
) {
    if (!process.env.DATABASE_URL) {
        return [];
    }

    const runs = await prisma.aiReviewStrategyRun.findMany({
        where: {
            questionId,
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        include: {
            strategy: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
            triggeredBy: {
                select: {
                    name: true,
                },
            },
        },
    });

    return runs.slice(0, 20).map(buildRunView);
}

async function loadStrategyForExecution(strategyId: string) {
    const strategy = await prisma.aiReviewStrategy.findUnique({
        where: {
            id: strategyId,
        },
        select: {
            id: true,
            code: true,
            name: true,
            description: true,
            enabled: true,
            scopeAdminId: true,
            projectIds: true,
            datasourceIds: true,
            definition: true,
        },
    });

    if (!strategy) {
        throw new Error("审核策略不存在。");
    }

    const definition = parseDefinition(strategy.definition);

    if (!definition) {
        throw new Error("审核策略定义已损坏，无法执行。");
    }

    return {
        ...strategy,
        definition,
    };
}

function extractRunDefinition(requestPayload: unknown) {
    if (!requestPayload || typeof requestPayload !== "object") {
        return null;
    }

    const strategy =
        "strategy" in requestPayload
            ? (requestPayload as Record<string, unknown>).strategy
            : null;

    if (!strategy || typeof strategy !== "object") {
        return null;
    }

    const definition =
        "definition" in strategy
            ? (strategy as Record<string, unknown>).definition
            : null;

    return parseDefinition(definition);
}

function extractRunExecutionOptions(requestPayload: unknown): {
    enableBuiltInTools: boolean;
} {
    if (!requestPayload || typeof requestPayload !== "object") {
        return {
            enableBuiltInTools: false,
        };
    }

    const execution =
        "execution" in requestPayload
            ? (requestPayload as Record<string, unknown>).execution
            : null;

    if (!execution || typeof execution !== "object") {
        return {
            enableBuiltInTools: false,
        };
    }

    return {
        enableBuiltInTools:
            "enableBuiltInTools" in execution &&
            execution.enableBuiltInTools === true,
    };
}

function getImpactedRetryState(
    definition: AiReviewStrategyDefinition,
    stepResults: StepExecutionResult[],
    retriedStepId: string,
) {
    const impactedStepIds = new Set([retriedStepId]);
    let hasStaleAiStep = false;
    let reachedRetriedStep = false;

    for (const step of definition.steps) {
        if (step.id === retriedStepId) {
            reachedRetriedStep = true;
            continue;
        }

        if (!reachedRetriedStep) {
            continue;
        }

        if (
            !step.enabled ||
            !stepResults.some((result) => result.stepId === step.id)
        ) {
            continue;
        }

        if (step.kind === "RULE") {
            if (impactedStepIds.has(step.sourceStepId)) {
                impactedStepIds.add(step.id);
            }
            continue;
        }

        if (step.toolType === "REVIEW_SUMMARY") {
            if (
                stepResults.some((result) => impactedStepIds.has(result.stepId))
            ) {
                hasStaleAiStep = true;
            }
            continue;
        }

        if (step.sourceStepId && impactedStepIds.has(step.sourceStepId)) {
            hasStaleAiStep = true;
        }
    }

    return {
        hasStaleAiStep,
    };
}

export async function retryAiReviewStrategyRunItem(
    runId: string,
    stepId: string,
    itemIndex: number,
) {
    const run = await prisma.aiReviewStrategyRun.findUnique({
        where: {
            id: runId,
        },
        include: {
            strategy: {
                select: {
                    id: true,
                    code: true,
                    name: true,
                    definition: true,
                },
            },
            triggeredBy: {
                select: {
                    name: true,
                },
            },
        },
    });

    if (!run) {
        throw new Error("运行记录不存在。");
    }

    if (run.status === "RUNNING" || run.status === "PENDING") {
        throw new Error("当前运行尚未结束，暂不支持重试单条请求。");
    }

    if (!run.parsedResult) {
        throw new Error("当前运行没有可重试的执行结果。");
    }

    const parsedResult = cloneJson(run.parsedResult as StrategyExecutionResult);
    const definition =
        extractRunDefinition(run.requestPayload) ??
        parseDefinition(run.strategy.definition);

    if (!definition) {
        throw new Error("运行记录中的策略定义已损坏，无法重试。");
    }

    const stepIndex = parsedResult.stepResults.findIndex(
        (step) => step.stepId === stepId,
    );

    if (stepIndex < 0) {
        throw new Error("未找到要重试的步骤。");
    }

    const currentStep = parsedResult.stepResults[stepIndex];
    const stepDefinition = definition.steps.find((step) => step.id === stepId);

    if (!stepDefinition || stepDefinition.kind !== "AI_TOOL") {
        throw new Error("只有 AI 步骤的单次执行项支持重试。");
    }

    const currentItem = currentStep.items.find(
        (item) => item.index === itemIndex,
    );

    if (!currentItem) {
        throw new Error("未找到要重试的执行记录。");
    }

    const previousResults = parsedResult.stepResults.slice(0, stepIndex);
    const question = await getReviewQuestionDetail(run.questionId);

    if (!question) {
        throw new Error("题目不存在或已被删除。");
    }

    const { sourceStepItems, tasks } = buildAiToolTasks(
        stepDefinition,
        previousResults,
    );

    if (stepDefinition.sourceStepId && !sourceStepItems.length) {
        throw new Error("来源步骤当前没有可用成功结果，无法重试这一项。");
    }

    const targetTask = tasks.find((task) => task.index === itemIndex);

    if (!targetTask) {
        throw new Error("当前步骤任务索引已变化，无法定位这条失败请求。");
    }

    const retriedItem = await executeAiToolItem(
        stepDefinition,
        question,
        previousResults,
        targetTask.sourceItem,
        targetTask.index,
        targetTask.runIndex,
        extractRunExecutionOptions(run.requestPayload),
    );
    const nextItems = currentStep.items
        .filter((item) => item.index !== itemIndex)
        .concat(retriedItem)
        .sort((left, right) => left.index - right.index);

    parsedResult.stepResults[stepIndex] = buildCompletedAiToolStepResult(
        stepDefinition,
        nextItems,
    );

    for (
        let downstreamIndex = stepIndex + 1;
        downstreamIndex < parsedResult.stepResults.length;
        downstreamIndex += 1
    ) {
        const downstreamResult = parsedResult.stepResults[downstreamIndex];
        const downstreamDefinition = definition.steps.find(
            (step) => step.id === downstreamResult.stepId,
        );

        if (!downstreamDefinition || downstreamDefinition.kind !== "RULE") {
            continue;
        }

        parsedResult.stepResults[downstreamIndex] = runRuleStep(
            downstreamDefinition,
            parsedResult.stepResults.slice(0, downstreamIndex),
        );
    }

    parsedResult.status = parsedResult.stepResults.some(
        (step) => step.status === "FAILED",
    )
        ? "FAILED"
        : "SUCCESS";

    const { hasStaleAiStep } = getImpactedRetryState(
        definition,
        parsedResult.stepResults,
        stepId,
    );

    parsedResult.finalRecommendation = hasStaleAiStep
        ? null
        : resolveFinalRecommendation(parsedResult.stepResults);
    parsedResult.reviewPersistence = {
        status: "SKIPPED",
        message: hasStaleAiStep
            ? "已重试并更新当前失败请求，但下游 AI 步骤未重跑，自动审核回填已失效，请人工确认。"
            : "已重试并更新当前失败请求，本次未自动回填审核结论。",
    };

    const updatedRun = await prisma.aiReviewStrategyRun.update({
        where: {
            id: run.id,
        },
        data: {
            status: parsedResult.status,
            errorMessage:
                parsedResult.status === "SUCCESS" ? null : run.errorMessage,
            parsedResult: serializeJson(parsedResult),
            responsePayload: serializeJson(
                buildRunResponsePayload(parsedResult.stepResults),
            ),
            finishedAt: new Date(),
        },
        include: {
            strategy: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
            triggeredBy: {
                select: {
                    name: true,
                },
            },
        },
    });

    return buildRunView(updatedRun);
}

export async function executeAiReviewStrategy(
    strategyId: string,
    questionId: string,
    triggeredById: string,
    executionOptions?: {
        enableBuiltInTools?: boolean;
    },
) {
    const [strategy, question] = await Promise.all([
        loadStrategyForExecution(strategyId),
        getReviewQuestionDetail(questionId),
    ]);

    if (!question) {
        throw new Error("题目不存在或已被删除。");
    }

    if (!strategy.enabled) {
        throw new Error("当前策略已停用，无法执行。");
    }

    if (!strategyAppliesToQuestion(strategy, question)) {
        throw new Error("当前策略不适用于这道题目。");
    }

    const requestPayload = serializeJson({
        strategy: {
            id: strategy.id,
            code: strategy.code,
            name: strategy.name,
            definition: strategy.definition,
        },
        execution: {
            enableBuiltInTools: executionOptions?.enableBuiltInTools === true,
        },
        question: {
            id: question.id,
            title: question.title,
            projectCode: question.project.code,
            datasourceName: question.datasource.name,
        },
    });
    const existingRun = await prisma.aiReviewStrategyRun.findFirst({
        where: {
            strategyId: strategy.id,
            questionId: question.id,
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
            id: true,
        },
    });
    const run = existingRun
        ? await prisma.aiReviewStrategyRun.update({
              where: {
                  id: existingRun.id,
              },
              data: {
                  triggeredById,
                  status: "RUNNING",
                  requestPayload,
                  responsePayload: Prisma.JsonNull,
                  parsedResult: Prisma.JsonNull,
                  errorMessage: null,
                  startedAt: new Date(),
                  finishedAt: null,
              },
          })
        : await prisma.aiReviewStrategyRun.create({
              data: {
                  strategyId: strategy.id,
                  questionId: question.id,
                  triggeredById,
                  status: "RUNNING",
                  startedAt: new Date(),
                  requestPayload,
              },
          });

    const parsedResult = createExecutionResultShell(strategy, question);
    const stepResults = parsedResult.stepResults;

    await persistRunProgress(run.id, parsedResult);

    try {
        for (const step of strategy.definition.steps) {
            if (!step.enabled) {
                stepResults.push({
                    stepId: step.id,
                    stepName: step.name,
                    stepKind: step.kind,
                    stepType:
                        step.kind === "AI_TOOL" ? step.toolType : step.ruleType,
                    status: "SKIPPED",
                    summary: "步骤已停用。",
                    items: [],
                });
                await persistRunProgress(run.id, parsedResult);
                continue;
            }

            if (
                step.kind === "AI_TOOL" &&
                step.toolType === "AI_SOLVE_QUESTION" &&
                hasBlockingComprehensiveCheckFailure(stepResults)
            ) {
                stepResults.push({
                    stepId: step.id,
                    stepName: step.name,
                    stepKind: "AI_TOOL",
                    stepType: step.toolType,
                    status: "SKIPPED",
                    summary:
                        "全面检查未通过，已跳过 AI 独立解题并直接进入后续总结。",
                    items: [],
                });
                await persistRunProgress(run.id, parsedResult);
                continue;
            }

            if (step.kind === "AI_TOOL") {
                const stepIndex = stepResults.push({
                    stepId: step.id,
                    stepName: step.name,
                    stepKind: "AI_TOOL",
                    stepType: step.toolType,
                    status: "RUNNING",
                    summary: `正在执行 ${step.name}...`,
                    items: [],
                });
                await persistRunProgress(run.id, parsedResult);

                stepResults[stepIndex - 1] = await runAiToolStep(
                    step,
                    question,
                    stepResults.slice(0, -1),
                    executionOptions,
                    async (partial) => {
                        stepResults[stepIndex - 1] = partial;
                        await persistRunProgress(run.id, parsedResult);
                    },
                );
            } else {
                const stepIndex = stepResults.push({
                    stepId: step.id,
                    stepName: step.name,
                    stepKind: "RULE",
                    stepType: step.ruleType,
                    status: "RUNNING",
                    summary: `正在执行 ${step.name}...`,
                    items: [],
                });
                await persistRunProgress(run.id, parsedResult);
                stepResults[stepIndex - 1] = runRuleStep(
                    step,
                    stepResults.slice(0, -1),
                );
            }

            await persistRunProgress(run.id, parsedResult);
        }

        parsedResult.status = stepResults.some(
            (step) => step.status === "FAILED",
        )
            ? "FAILED"
            : "SUCCESS";
        parsedResult.finalRecommendation =
            resolveFinalRecommendation(stepResults);
        parsedResult.reviewPersistence = null;

        if (parsedResult.finalRecommendation?.decision) {
            const comment = buildAutoReviewComment(
                {
                    name: strategy.name,
                    code: strategy.code,
                },
                parsedResult.finalRecommendation,
                stepResults,
            );

            try {
                const saved = await prisma.$transaction(async (tx) => {
                    const review = await tx.review.create({
                        data: {
                            projectId: question.project.id,
                            datasourceId: question.datasource.id,
                            externalRecordId: question.externalRecordId,
                            reviewerId: triggeredById,
                            decision:
                                parsedResult.finalRecommendation!.decision!,
                            comment,
                            suggestions: {
                                source: "AI_STRATEGY",
                                autoGenerated: true,
                                runId: run.id,
                                strategyId: strategy.id,
                                strategyCode: strategy.code,
                                strategyName: strategy.name,
                                finalRecommendation:
                                    parsedResult.finalRecommendation,
                                stepSummaries: stepResults.map((step) => ({
                                    stepId: step.stepId,
                                    stepName: step.stepName,
                                    stepType: step.stepType,
                                    status: step.status,
                                    summary: step.summary,
                                })),
                            },
                        },
                    });

                    const questionStatus = toQuestionStatus(
                        parsedResult.finalRecommendation!.decision!,
                    );

                    await tx.question.update({
                        where: {
                            id: question.id,
                        },
                        data: {
                            status: questionStatus,
                        },
                    });

                    return {
                        reviewId: review.id,
                        questionStatus,
                    };
                });

                parsedResult.reviewPersistence = {
                    status: "SAVED",
                    message: "已根据策略粗略结论自动保存审核记录。",
                    reviewId: saved.reviewId,
                    decision: parsedResult.finalRecommendation.decision,
                    comment,
                    questionStatus: saved.questionStatus,
                };
            } catch (error) {
                parsedResult.reviewPersistence = {
                    status: "FAILED",
                    message:
                        error instanceof Error
                            ? error.message
                            : "自动保存审核记录失败。",
                    decision: parsedResult.finalRecommendation.decision,
                    comment,
                };
            }
        } else {
            parsedResult.reviewPersistence = {
                status: "SKIPPED",
                message: "策略未输出可自动落库的审核结论。",
            };
        }

        await prisma.aiReviewStrategyRun.update({
            where: {
                id: run.id,
            },
            data: {
                status: parsedResult.status,
                parsedResult: serializeJson(parsedResult),
                responsePayload: serializeJson(
                    buildRunResponsePayload(stepResults),
                ),
                finishedAt: new Date(),
            },
        });

        return {
            runId: run.id,
            parsedResult,
        };
    } catch (error) {
        await prisma.aiReviewStrategyRun.update({
            where: {
                id: run.id,
            },
            data: {
                status: "FAILED",
                errorMessage:
                    error instanceof Error ? error.message : "策略执行失败",
                parsedResult: serializeJson({
                    ...parsedResult,
                    status: "FAILED",
                    finalRecommendation: null,
                    reviewPersistence: {
                        status: "SKIPPED",
                        message: "策略执行失败，未自动保存审核记录。",
                    },
                }),
                responsePayload: serializeJson(
                    buildRunResponsePayload(stepResults),
                ),
                finishedAt: new Date(),
            },
        });

        throw error;
    }
}
