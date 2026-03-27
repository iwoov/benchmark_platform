import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { invokeAiModel } from "@/lib/ai/invoke";
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
import {
    getReviewQuestionDetail,
    type ReviewQuestionDetail,
} from "@/lib/reviews/question-list-data";

type StepExecutionItem = {
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

type StepExecutionResult = {
    stepId: string;
    stepName: string;
    stepKind: "AI_TOOL" | "RULE";
    stepType: string;
    status: "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
    summary: string;
    outcomeLabel?: "PASS" | "NEEDS_REVISION" | "REJECT" | "FLAG";
    items: StepExecutionItem[];
    metrics?: Record<string, unknown>;
    error?: string;
};

type StrategyExecutionResult = {
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
        decision?: "PASS" | "NEEDS_REVISION" | "REJECT";
        riskLevel?: string;
        summary: string;
    } | null;
    reviewPersistence: {
        status: "SAVED" | "SKIPPED" | "FAILED";
        message: string;
        reviewId?: string;
        decision?: "PASS" | "NEEDS_REVISION" | "REJECT";
        comment?: string;
        questionStatus?: "APPROVED" | "REJECTED";
    } | null;
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

function toReviewDecision(
    value: unknown,
): "PASS" | "NEEDS_REVISION" | "REJECT" | undefined {
    return value === "PASS" || value === "NEEDS_REVISION" || value === "REJECT"
        ? value
        : undefined;
}

function toQuestionStatus(
    decision: "PASS" | "NEEDS_REVISION" | "REJECT",
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
    const lines = [
        `[AI 审核策略] ${strategy.name} (${strategy.code})`,
        finalRecommendation.summary,
    ];

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

    try {
        return JSON.parse(candidate);
    } catch {
        const start = candidate.indexOf("{");
        const end = candidate.lastIndexOf("}");

        if (start >= 0 && end > start) {
            return JSON.parse(candidate.slice(start, end + 1));
        }

        throw new Error("模型返回内容不是合法 JSON");
    }
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

function getToolContract(type: AiReviewAiToolType) {
    switch (type) {
        case "COMPREHENSIVE_CHECK":
            return `{"passed":boolean,"summary":string,"issues":[{"category":string,"severity":"LOW|MEDIUM|HIGH","field":string,"title":string,"detail":string}],"warnings":string[],"suggestions":string[]}`;
        case "QUESTION_COMPLETENESS_CHECK":
            return `{"passed":boolean,"summary":string,"missingFields":string[],"warnings":string[]}`;
        case "TEXT_QUALITY_CHECK":
            return `{"passed":boolean,"severity":"LOW|MEDIUM|HIGH","summary":string,"issues":[{"field":string,"type":string,"content":string}],"suggestions":string[]}`;
        case "AI_SOLVE_QUESTION":
            return `{"answer":string,"normalizedAnswer":string,"reasoning":string,"confidence":0-1}`;
        case "ANSWER_MATCH_CHECK":
            return `{"matchLevel":"EXACT|SEMANTIC_MATCH|PARTIAL_MATCH|MISMATCH|UNKNOWN","isConsistent":boolean,"summary":string,"difference":string|null}`;
        case "REASONING_COMPARE":
            return `{"isConsistent":boolean,"summary":string,"missingPoints":string[],"riskLevel":"LOW|MEDIUM|HIGH"}`;
        case "DIFFICULTY_EVALUATION":
            return `{"difficultyLevel":"EASY|MEDIUM|HARD","score":1-5,"summary":string,"evidence":string[]}`;
        case "REVIEW_SUMMARY":
            return `{"recommendedDecision":"PASS|NEEDS_REVISION|REJECT","riskLevel":"LOW|MEDIUM|HIGH","summary":string,"keyIssues":string[]}`;
    }
}

function buildSystemPrompt(step: AiReviewAiToolStep) {
    return [
        `你正在执行题目审核系统中的「${aiReviewToolLabels[step.toolType]}」步骤。`,
        "必须只返回一个 JSON 对象，不要输出 Markdown、代码块、解释或额外文字。",
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
        selectedFields,
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
    if (toolType === "AI_SOLVE_QUESTION") {
        const answer =
            typeof payload.answer === "string" ? payload.answer.trim() : "";
        if (!payload.normalizedAnswer && answer) {
            payload.normalizedAnswer = normalizeAnswer(answer);
        }

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
) {
    const selectedFields = selectFields(question, step.fieldKeys);
    const promptInput = {
        selectedFields,
        sourceOutput: sourceItem?.output ?? null,
        runIndex,
    };
    const response = await invokeAiModel({
        modelCode: step.modelCode,
        stream: false,
        messages: [
            {
                role: "system",
                content: buildSystemPrompt(step),
            },
            {
                role: "user",
                content: buildUserPrompt(
                    step,
                    question,
                    selectedFields,
                    sourceItem?.output,
                    previousResults,
                ),
            },
        ],
    });

    if (!response.ok || response.stream) {
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
            error: response.ok ? "当前步骤不支持流式结果。" : response.error,
        };
    }

    try {
        const parsedRaw = extractJson(response.text);
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
                raw: response.raw,
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
                raw: response.raw,
                text: response.text,
            },
            error:
                error instanceof Error ? error.message : "模型结果解析失败",
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
    onProgress?: (partial: StepExecutionResult) => void | Promise<void>,
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
            stepId: step.id,
            stepName: step.name,
            stepKind: "AI_TOOL" as const,
            stepType: step.toolType,
            status: "SKIPPED" as const,
            summary: "来源步骤没有可用结果，当前步骤已跳过。",
            items: [],
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
        items.filter(
            (item): item is StepExecutionItem => Boolean(item),
        ),
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

export async function getAiReviewStrategyConsoleData() {
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
                projectIds: string[];
                datasourceIds: string[];
                definition: AiReviewStrategyDefinition;
                createdByName: string;
                updatedAt: string;
            }>,
        };
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
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            include: {
                createdBy: {
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
    };
}

export async function getApplicableAiReviewStrategies(
    question: ReviewQuestionDetail,
) {
    if (!process.env.DATABASE_URL) {
        return [];
    }

    const strategies = await prisma.aiReviewStrategy.findMany({
        where: {
            enabled: true,
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    return strategies
        .map((strategy) => {
            const definition = parseDefinition(strategy.definition);

            if (!definition || !strategyAppliesToQuestion(strategy, question)) {
                return null;
            }

            return {
                id: strategy.id,
                name: strategy.name,
                code: strategy.code,
                description: strategy.description,
                stepCount: definition.steps.length,
                datasourceIds: parseStringArray(strategy.datasourceIds),
            };
        })
        .filter((strategy): strategy is NonNullable<typeof strategy> =>
            Boolean(strategy),
        );
}

export async function getAiReviewStrategyRunsForQuestion(questionId: string) {
    if (!process.env.DATABASE_URL) {
        return [];
    }

    const runs = await prisma.aiReviewStrategyRun.findMany({
        where: {
            questionId,
        },
        orderBy: [{ createdAt: "desc" }],
        take: 6,
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

    return runs.map((run) => ({
        id: run.id,
        status: run.status,
        errorMessage: run.errorMessage,
        createdAt: run.createdAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        strategy: run.strategy,
        triggeredByName: run.triggeredBy.name,
        parsedResult: run.parsedResult as StrategyExecutionResult | null,
    }));
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

export async function executeAiReviewStrategy(
    strategyId: string,
    questionId: string,
    triggeredById: string,
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

    const run = await prisma.aiReviewStrategyRun.create({
        data: {
            strategyId: strategy.id,
            questionId: question.id,
            triggeredById,
            status: "RUNNING",
            startedAt: new Date(),
            requestPayload: serializeJson({
                strategy: {
                    id: strategy.id,
                    code: strategy.code,
                    name: strategy.name,
                    definition: strategy.definition,
                },
                question: {
                    id: question.id,
                    title: question.title,
                    projectCode: question.project.code,
                    datasourceName: question.datasource.name,
                },
            }),
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

        parsedResult.status = stepResults.some((step) => step.status === "FAILED")
            ? "FAILED"
            : "SUCCESS";
        parsedResult.finalRecommendation = resolveFinalRecommendation(stepResults);
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
                responsePayload: serializeJson(buildRunResponsePayload(stepResults)),
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
                responsePayload: serializeJson(buildRunResponsePayload(stepResults)),
                finishedAt: new Date(),
            },
        });

        throw error;
    }
}
