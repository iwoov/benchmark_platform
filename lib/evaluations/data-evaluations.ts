import { BatchRunItemStatus, BatchRunStatus, Prisma } from "@prisma/client";
import { resolveUserAdminScopeId } from "@/lib/auth/admin-scope";
import type { PlatformRoleValue } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import {
    aiReviewStrategyDefinitionSchema,
    getAiToolStepModelCodes,
    type AiReviewAiToolStep,
    type AiReviewStrategyDefinition,
    type AiReviewStrategyStep,
} from "@/lib/ai/review-strategy-schema";
import {
    createDataEvaluationModelRunBatchRun,
    parseDataEvaluationModelRunTaskPayload,
} from "@/lib/ai/review-strategy-batches";
import {
    extractQuestionPrimaryValue,
    getAccessiblePrimaryValueSet,
    questionMatchesPrimaryValueScopeForProject,
} from "@/lib/subjects/access";
import { getReviewQuestionDetail } from "@/lib/reviews/question-list-data";

type EvaluationViewer = {
    userId: string;
    platformRole: PlatformRoleValue;
};

export type DataEvaluationModelColumn = {
    code: string;
    label: string;
    strategyId: string;
    strategyName: string;
    answerModelCode: string | null;
    judgeModelCode: string | null;
};

export type DataEvaluationRunState = {
    columnCode: string;
    batchRunId: string;
    itemStatus: string;
    batchStatus: string;
    errorMessage: string | null;
    updatedAt: string;
};

export type DataEvaluationRawResponsePart = {
    modelCode: string | null;
    modelLabel: string | null;
    stepId: string | null;
    stepName: string | null;
    output: unknown;
    rawResponse: unknown;
};

export type DataEvaluationRawResponse = {
    answer: DataEvaluationRawResponsePart | null;
    judge: DataEvaluationRawResponsePart | null;
};

export type DataEvaluationResult = {
    modelCode: string;
    modelLabel: string;
    answerModelCode: string | null;
    answerModelLabel: string | null;
    judgeModelCode: string | null;
    judgeModelLabel: string | null;
    status: string;
    runId: string;
    strategyName: string;
    updatedAt: string;
    answer: string | null;
    normalizedAnswer: string | null;
    confidence: number | null;
    isCorrect: boolean | null;
    matchLevel: string | null;
    difficultyLevel: string | null;
    score: number | null;
    summary: string | null;
    difference: string | null;
    evidence: string[];
    errorMessage: string | null;
    rawResponse: DataEvaluationRawResponse | null;
};

export type DataEvaluationQuestionRow = {
    id: string;
    title: string;
    sourceQuestionId: string;
    primary: string | null;
    datasourceName: string;
    externalRecordId: string;
    questionType: string | null;
    difficulty: string | null;
    updatedAt: string;
    canManage: boolean;
    rawRecord: Record<string, unknown>;
    results: Record<string, DataEvaluationResult | null>;
};

export type DataEvaluationQuestionNavigation = {
    previousQuestionId: string | null;
    nextQuestionId: string | null;
};

export type DataEvaluationQuestionDetail = NonNullable<
    Awaited<ReturnType<typeof getReviewQuestionDetail>>
>;

function parseStringArray(input: unknown) {
    if (!Array.isArray(input)) {
        return [] as string[];
    }

    return input
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean);
}

function parseDefinition(input: unknown) {
    const parsed = aiReviewStrategyDefinitionSchema.safeParse(input);
    return parsed.success ? parsed.data : null;
}

function hasDataEvaluationStep(definition: AiReviewStrategyDefinition) {
    return definition.steps.some(
        (step) => step.enabled && isAnswerJudgeStep(step),
    );
}

function isEvaluationStep(
    step: AiReviewStrategyStep,
): step is AiReviewAiToolStep {
    return (
        step.kind === "AI_TOOL" &&
        [
            "AI_SOLVE_QUESTION",
            "ANSWER_MATCH_CHECK",
            "DIFFICULTY_EVALUATION",
        ].includes(step.toolType)
    );
}

function isSolveStep(step: AiReviewStrategyStep): step is AiReviewAiToolStep {
    return step.kind === "AI_TOOL" && step.toolType === "AI_SOLVE_QUESTION";
}

function isAnswerJudgeStep(
    step: AiReviewStrategyStep,
): step is AiReviewAiToolStep {
    return step.kind === "AI_TOOL" && step.toolType === "ANSWER_MATCH_CHECK";
}

function isLegacyDifficultyStep(
    step: AiReviewStrategyStep,
): step is AiReviewAiToolStep {
    return step.kind === "AI_TOOL" && step.toolType === "DIFFICULTY_EVALUATION";
}

function buildEvaluationColumnKey(input: {
    answerModelCode: string | null;
    judgeModelCode: string | null;
    fallbackStepId?: string;
}) {
    if (input.answerModelCode && input.judgeModelCode) {
        return `${input.answerModelCode}__${input.judgeModelCode}`;
    }

    return input.judgeModelCode ?? input.answerModelCode ?? input.fallbackStepId ?? "";
}

function strategyMatchesProject(
    strategy: { projectIds: Prisma.JsonValue | null },
    projectId: string,
) {
    const projectIds = parseStringArray(strategy.projectIds);
    return !projectIds.length || projectIds.includes(projectId);
}

function strategyMatchesQuestion(
    strategy: {
        projectIds: Prisma.JsonValue | null;
        datasourceIds: Prisma.JsonValue | null;
        questionTypes: Prisma.JsonValue | null;
    },
    question: {
        project: { id: string };
        datasource: { id: string };
        questionType: string | null;
    },
) {
    const projectIds = parseStringArray(strategy.projectIds);
    const datasourceIds = parseStringArray(strategy.datasourceIds);
    const questionTypes = parseStringArray(strategy.questionTypes);

    return (
        (!projectIds.length || projectIds.includes(question.project.id)) &&
        (!datasourceIds.length ||
            datasourceIds.includes(question.datasource.id)) &&
        (!questionTypes.length ||
            (question.questionType
                ? questionTypes.includes(question.questionType)
                : false))
    );
}

function extractRawRecordString(metadata: unknown, key: string) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return null;
    }

    const rawRecord = (metadata as Record<string, unknown>).rawRecord;

    if (!rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord)) {
        return null;
    }

    const value = (rawRecord as Record<string, unknown>)[key];

    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim();

    return normalized || null;
}

function extractRawRecord(metadata: unknown) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return {} as Record<string, unknown>;
    }

    const rawRecord = (metadata as Record<string, unknown>).rawRecord;

    if (!rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord)) {
        return {} as Record<string, unknown>;
    }

    return rawRecord as Record<string, unknown>;
}

async function getEvaluationStrategies(viewer: EvaluationViewer) {
    const scopeAdminId = await resolveUserAdminScopeId(
        viewer.userId,
        viewer.platformRole,
    );

    const strategies = await prisma.aiReviewStrategy.findMany({
        where: {
            enabled: true,
            ...(viewer.platformRole === "SUPER_ADMIN"
                ? {}
                : {
                      scopeAdminId: scopeAdminId ?? "__no_scope__",
                  }),
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
            id: true,
            name: true,
            projectIds: true,
            datasourceIds: true,
            questionTypes: true,
            definition: true,
        },
    });

    return strategies
        .map((strategy) => {
            const definition = parseDefinition(strategy.definition);

            if (!definition || !hasDataEvaluationStep(definition)) {
                return null;
            }

            return {
                ...strategy,
                definition,
            };
        })
        .filter((strategy): strategy is NonNullable<typeof strategy> =>
            Boolean(strategy),
        );
}

async function getModelLabelMap(modelCodes: string[]) {
    if (!modelCodes.length) {
        return new Map<string, string>();
    }

    const models = await prisma.aiModel.findMany({
        where: {
            code: {
                in: modelCodes,
            },
        },
        select: {
            code: true,
            label: true,
        },
    });

    return new Map(models.map((model) => [model.code, model.label ?? model.code]));
}

function getEvaluationModelCodes(
    strategies: Array<{ definition: AiReviewStrategyDefinition }>,
) {
    return [
        ...new Set(
            strategies.flatMap((strategy) =>
                strategy.definition.steps
                    .filter(
                        (step): step is AiReviewAiToolStep =>
                            step.enabled && isEvaluationStep(step),
                    )
                    .flatMap((step) => getAiToolStepModelCodes(step)),
            ),
        ),
    ];
}

function getEvaluationModelColumns(
    strategies: Array<{
        id: string;
        name: string;
        definition: AiReviewStrategyDefinition;
    }>,
    modelLabelMap: Map<string, string>,
) {
    const columns = new Map<string, DataEvaluationModelColumn>();

    for (const strategy of strategies) {
        const solveSteps = strategy.definition.steps.filter(
            (step): step is AiReviewAiToolStep => step.enabled && isSolveStep(step),
        );
        const solveStepMap = new Map(solveSteps.map((step) => [step.id, step]));
        const judgeSteps = strategy.definition.steps.filter(
            (step): step is AiReviewAiToolStep =>
                step.enabled && isAnswerJudgeStep(step),
        );

        for (const judgeStep of judgeSteps) {
            const solveStep = judgeStep.sourceStepId
                ? solveStepMap.get(judgeStep.sourceStepId)
                : undefined;
            const answerModelCodes = solveStep
                ? getAiToolStepModelCodes(solveStep)
                : [null];

            for (const answerModelCode of answerModelCodes) {
                for (const judgeModelCode of getAiToolStepModelCodes(judgeStep)) {
                    const key = buildEvaluationColumnKey({
                        answerModelCode,
                        judgeModelCode,
                        fallbackStepId: judgeStep.id,
                    });

                    if (columns.has(key)) {
                        continue;
                    }

                    const answerModelLabel = answerModelCode
                        ? (modelLabelMap.get(answerModelCode) ?? answerModelCode)
                        : null;
                    const judgeModelLabel =
                        modelLabelMap.get(judgeModelCode) ?? judgeModelCode;

                    columns.set(key, {
                        code: key,
                        label: answerModelLabel
                            ? `${answerModelLabel} / ${judgeModelLabel}`
                            : judgeModelLabel,
                        strategyId: strategy.id,
                        strategyName: strategy.name,
                        answerModelCode,
                        judgeModelCode,
                    });
                }
            }
        }

        if (judgeSteps.length) {
            continue;
        }

        for (const solveStep of solveSteps) {
            for (const answerModelCode of getAiToolStepModelCodes(solveStep)) {
                const key = buildEvaluationColumnKey({
                    answerModelCode,
                    judgeModelCode: null,
                    fallbackStepId: solveStep.id,
                });

                if (!columns.has(key)) {
                    columns.set(key, {
                        code: key,
                        label: modelLabelMap.get(answerModelCode) ?? answerModelCode,
                        strategyId: strategy.id,
                        strategyName: strategy.name,
                        answerModelCode,
                        judgeModelCode: null,
                    });
                }
            }
        }

        for (const difficultyStep of strategy.definition.steps.filter(
            (step): step is AiReviewAiToolStep =>
                step.enabled && isLegacyDifficultyStep(step),
        )) {
            for (const judgeModelCode of getAiToolStepModelCodes(difficultyStep)) {
                const key = buildEvaluationColumnKey({
                    answerModelCode: null,
                    judgeModelCode,
                    fallbackStepId: difficultyStep.id,
                });

                if (!columns.has(key)) {
                    columns.set(key, {
                        code: key,
                        label: modelLabelMap.get(judgeModelCode) ?? judgeModelCode,
                        strategyId: strategy.id,
                        strategyName: strategy.name,
                        answerModelCode: null,
                        judgeModelCode,
                    });
                }
            }
        }
    }

    return [...columns.values()];
}

function readString(value: unknown) {
    return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringList(value: unknown) {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
}

function readOutputRecord(output: unknown) {
    if (!output || typeof output !== "object" || Array.isArray(output)) {
        return {} as Record<string, unknown>;
    }

    return output as Record<string, unknown>;
}

function readPromptInputRecord(item: Record<string, unknown> | undefined) {
    const promptInput = item?.promptInput;

    if (!promptInput || typeof promptInput !== "object" || Array.isArray(promptInput)) {
        return {};
    }

    return promptInput as Record<string, unknown>;
}

function readPromptSourceOutput(item: Record<string, unknown> | undefined) {
    return readOutputRecord(readPromptInputRecord(item).sourceOutput);
}

function readPromptSourceModelCode(item: Record<string, unknown> | undefined) {
    const sourceMeta = readPromptInputRecord(item).sourceMeta;
    const sourceMetaRecord = readOutputRecord(sourceMeta);

    return readString(sourceMetaRecord.modelCode);
}

function readItemRequestModelCode(item: Record<string, unknown> | undefined) {
    const requestMeta = readOutputRecord(item?.requestMeta);

    return readString(requestMeta.modelCode);
}

function stringifyForComparison(value: unknown) {
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
}

function readStepItems(stepRecord: Record<string, unknown>) {
    return Array.isArray(stepRecord.items)
        ? (stepRecord.items.filter(
              (item): item is Record<string, unknown> =>
                  Boolean(item) &&
                  typeof item === "object" &&
                  !Array.isArray(item),
          ) as Record<string, unknown>[])
        : [];
}

function findSourceStepItem(input: {
    sourceStepRecord: Record<string, unknown> | undefined;
    sourceModelCode: string | null;
    sourceOutput: Record<string, unknown>;
}) {
    if (!input.sourceStepRecord || !input.sourceModelCode) {
        return undefined;
    }

    const expectedOutput = stringifyForComparison(input.sourceOutput);

    return readStepItems(input.sourceStepRecord).find((item) => {
        if (readItemRequestModelCode(item) !== input.sourceModelCode) {
            return false;
        }

        if (!expectedOutput) {
            return true;
        }

        return stringifyForComparison(item.output) === expectedOutput;
    });
}

function buildRawResponsePart(input: {
    item: Record<string, unknown> | undefined;
    modelCode: string | null;
    modelLabel: string | null;
    stepId: string | null;
    stepName: string | null;
}): DataEvaluationRawResponsePart | null {
    if (!input.item) {
        return null;
    }

    return {
        modelCode: input.modelCode,
        modelLabel: input.modelLabel,
        stepId: input.stepId,
        stepName: input.stepName,
        output: input.item.output ?? null,
        rawResponse: input.item.rawResponse ?? null,
    };
}

function readResultOutput(output: unknown) {
    const record = readOutputRecord(output);
    return {
        answer: readString(record.answer),
        normalizedAnswer: readString(record.normalizedAnswer),
        reasoning: readString(record.reasoning),
        confidence: readNumber(record.confidence),
        isCorrect:
            typeof record.isCorrect === "boolean"
                ? record.isCorrect
                : typeof record.isConsistent === "boolean"
                  ? record.isConsistent
                  : null,
        matchLevel: readString(record.matchLevel),
        difficultyLevel: readString(record.difficultyLevel),
        score: readNumber(record.score),
        summary: readString(record.summary),
        difference:
            record.difference === null ? null : readString(record.difference),
        evidence: readStringList(record.evidence),
    };
}

function extractRunResults(
    run: {
        id: string;
        status: string;
        errorMessage: string | null;
        updatedAt: Date;
        parsedResult: Prisma.JsonValue | null;
        strategy: {
            name: string;
            definition: Prisma.JsonValue;
        };
    },
    modelLabelMap: Map<string, string>,
    options?: {
        includeRawResponse?: boolean;
    },
) {
    const definition = parseDefinition(run.strategy.definition);
    if (!definition) {
        return [];
    }

    const stepMap = new Map(definition.steps.map((step) => [step.id, step]));
    const parsedResult = run.parsedResult;

    if (
        !parsedResult ||
        typeof parsedResult !== "object" ||
        Array.isArray(parsedResult)
    ) {
        return [];
    }

    const stepResults = (parsedResult as Record<string, unknown>).stepResults;
    if (!Array.isArray(stepResults)) {
        return [];
    }

    const stepResultRecords = stepResults.filter(
        (stepResult): stepResult is Record<string, unknown> =>
            Boolean(stepResult) &&
            typeof stepResult === "object" &&
            !Array.isArray(stepResult),
    );
    const stepResultByStepId = new Map(
        stepResultRecords
            .map((stepRecord) => [
                typeof stepRecord.stepId === "string" ? stepRecord.stepId : "",
                stepRecord,
            ] as const)
            .filter(([stepId]) => Boolean(stepId)),
    );
    const results: DataEvaluationResult[] = [];

    for (const stepRecord of stepResultRecords) {
        if (stepRecord.stepKind !== "AI_TOOL") {
            continue;
        }

        const stepId = typeof stepRecord.stepId === "string" ? stepRecord.stepId : "";
        const stepDefinition = stepMap.get(stepId);

        if (
            !stepDefinition ||
            stepDefinition.kind !== "AI_TOOL" ||
            !isEvaluationStep(stepDefinition)
        ) {
            continue;
        }

        const items = readStepItems(stepRecord);
        const maybeSourceStep = stepDefinition.sourceStepId
            ? stepMap.get(stepDefinition.sourceStepId)
            : undefined;
        const sourceStep =
            maybeSourceStep?.kind === "AI_TOOL" && maybeSourceStep.enabled
                ? maybeSourceStep
                : null;

        for (const item of items) {
            const itemStatus =
                typeof item.status === "string"
                    ? item.status
                    : String(stepRecord.status ?? run.status);
            const output = readResultOutput(
                itemStatus === "SUCCESS" ? item.output : undefined,
            );
            const sourceOutput = readResultOutput(readPromptSourceOutput(item));
            const itemModelCode =
                readItemRequestModelCode(item) ??
                getAiToolStepModelCodes(stepDefinition)[0] ??
                null;
            const sourceModelCode = readPromptSourceModelCode(item);
            const answerModelCode =
                stepDefinition.toolType === "AI_SOLVE_QUESTION"
                    ? itemModelCode
                    : sourceStep?.toolType === "AI_SOLVE_QUESTION"
                      ? (sourceModelCode ??
                          getAiToolStepModelCodes(sourceStep)[0] ??
                          null)
                      : null;
            const judgeModelCode =
                stepDefinition.toolType === "AI_SOLVE_QUESTION"
                    ? null
                    : itemModelCode;
            const columnKey = buildEvaluationColumnKey({
                answerModelCode,
                judgeModelCode,
                fallbackStepId: stepDefinition.id,
            });
            const answerModelLabel = answerModelCode
                ? (modelLabelMap.get(answerModelCode) ?? answerModelCode)
                : null;
            const judgeModelLabel = judgeModelCode
                ? (modelLabelMap.get(judgeModelCode) ?? judgeModelCode)
                : null;
            const sourceStepRecord = stepDefinition.sourceStepId
                ? stepResultByStepId.get(stepDefinition.sourceStepId)
                : undefined;
            const sourceItem = findSourceStepItem({
                sourceStepRecord,
                sourceModelCode,
                sourceOutput: readPromptSourceOutput(item),
            });
            const answerRawResponse = options?.includeRawResponse
                ? stepDefinition.toolType === "AI_SOLVE_QUESTION"
                    ? buildRawResponsePart({
                          item,
                          modelCode: answerModelCode,
                          modelLabel: answerModelLabel,
                          stepId,
                          stepName:
                              typeof stepRecord.stepName === "string"
                                  ? stepRecord.stepName
                                  : stepDefinition.name,
                      })
                    : buildRawResponsePart({
                          item: sourceItem,
                          modelCode: answerModelCode,
                          modelLabel: answerModelLabel,
                          stepId: stepDefinition.sourceStepId ?? null,
                          stepName: sourceStep?.name ?? null,
                      })
                : null;
            const judgeRawResponse = options?.includeRawResponse
                ? stepDefinition.toolType === "AI_SOLVE_QUESTION"
                    ? null
                    : buildRawResponsePart({
                          item,
                          modelCode: judgeModelCode,
                          modelLabel: judgeModelLabel,
                          stepId,
                          stepName:
                              typeof stepRecord.stepName === "string"
                                  ? stepRecord.stepName
                                  : stepDefinition.name,
                      })
                : null;

            results.push({
                modelCode: columnKey,
                modelLabel:
                    answerModelLabel && judgeModelLabel
                        ? `${answerModelLabel} / ${judgeModelLabel}`
                        : (judgeModelLabel ?? answerModelLabel ?? columnKey),
                answerModelCode,
                answerModelLabel,
                judgeModelCode,
                judgeModelLabel,
                status: itemStatus,
                runId: run.id,
                strategyName: run.strategy.name,
                updatedAt: run.updatedAt.toISOString(),
                answer: output.answer ?? sourceOutput.answer,
                normalizedAnswer:
                    output.normalizedAnswer ?? sourceOutput.normalizedAnswer,
                confidence: output.confidence ?? sourceOutput.confidence,
                isCorrect: output.isCorrect,
                matchLevel: output.matchLevel,
                difficultyLevel: output.difficultyLevel,
                score: output.score,
                summary:
                    output.summary ??
                    output.reasoning ??
                    sourceOutput.reasoning ??
                    (typeof stepRecord.summary === "string"
                        ? stepRecord.summary
                        : null),
                difference: output.difference,
                evidence: output.evidence,
                errorMessage:
                    typeof stepRecord.error === "string"
                        ? stepRecord.error
                        : typeof item.error === "string"
                          ? item.error
                          : run.errorMessage,
                rawResponse:
                    answerRawResponse || judgeRawResponse
                        ? {
                              answer: answerRawResponse,
                              judge: judgeRawResponse,
                          }
                        : null,
            });
        }
    }

    return results;
}

async function getLatestEvaluationResults(
    questionIds: string[],
    modelColumns: DataEvaluationModelColumn[],
    strategies: Array<{ id: string }>,
    options?: {
        includeRawResponse?: boolean;
    },
) {
    const emptyMap = new Map<string, Record<string, DataEvaluationResult | null>>();
    const columnCodes = modelColumns.map((column) => column.code);

    for (const questionId of questionIds) {
        emptyMap.set(
            questionId,
            Object.fromEntries(columnCodes.map((code) => [code, null])),
        );
    }

    if (!questionIds.length || !columnCodes.length || !strategies.length) {
        return emptyMap;
    }

    const modelCodes = [
        ...new Set(
            modelColumns.flatMap((column) =>
                [column.answerModelCode, column.judgeModelCode].filter(
                    (code): code is string => Boolean(code),
                ),
            ),
        ),
    ];
    const modelLabelMap = await getModelLabelMap(modelCodes);
    const runs = await prisma.aiReviewStrategyRun.findMany({
        where: {
            questionId: {
                in: questionIds,
            },
            strategyId: {
                in: strategies.map((strategy) => strategy.id),
            },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
            id: true,
            questionId: true,
            status: true,
            errorMessage: true,
            updatedAt: true,
            parsedResult: true,
            strategy: {
                select: {
                    name: true,
                    definition: true,
                },
            },
        },
    });

    const columnCodeSet = new Set(columnCodes);

    for (const run of runs) {
        const questionResults = emptyMap.get(run.questionId);
        if (!questionResults) {
            continue;
        }

        for (const result of extractRunResults(run, modelLabelMap, options)) {
            if (!columnCodeSet.has(result.modelCode)) {
                continue;
            }

            if (!questionResults[result.modelCode]) {
                questionResults[result.modelCode] = result;
            }
        }
    }

    return emptyMap;
}

export async function getDataEvaluationRunStates(input: {
    questionId: string;
    modelColumns: DataEvaluationModelColumn[];
}) {
    if (!process.env.DATABASE_URL || !input.modelColumns.length) {
        return {} as Record<string, DataEvaluationRunState | null>;
    }

    const columnCodeSet = new Set(
        input.modelColumns.map((column) => column.code),
    );
    const strategyIds = [
        ...new Set(input.modelColumns.map((column) => column.strategyId)),
    ];
    const items = await prisma.aiReviewStrategyBatchRunItem.findMany({
        where: {
            questionId: input.questionId,
            batchRun: {
                strategyId: {
                    in: strategyIds,
                },
            },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 80,
        select: {
            status: true,
            errorMessage: true,
            updatedAt: true,
            resultPayload: true,
            batchRun: {
                select: {
                    id: true,
                    status: true,
                    requestPayload: true,
                },
            },
        },
    });
    const states = new Map<string, DataEvaluationRunState>();

    for (const item of items) {
        const payload =
            parseDataEvaluationModelRunTaskPayload(item.resultPayload) ??
            parseDataEvaluationModelRunTaskPayload(
                item.batchRun.requestPayload,
            );

        if (!payload || !columnCodeSet.has(payload.columnCode)) {
            continue;
        }

        if (states.has(payload.columnCode)) {
            continue;
        }

        states.set(payload.columnCode, {
            columnCode: payload.columnCode,
            batchRunId: item.batchRun.id,
            itemStatus: item.status,
            batchStatus: item.batchRun.status,
            errorMessage: item.errorMessage,
            updatedAt: item.updatedAt.toISOString(),
        });
    }

    return Object.fromEntries(
        input.modelColumns.map((column) => [
            column.code,
            states.get(column.code) ?? null,
        ]),
    ) as Record<string, DataEvaluationRunState | null>;
}

export async function createDataEvaluationModelRun(input: {
    questionId: string;
    modelColumn: DataEvaluationModelColumn;
    createdById: string;
}) {
    const activeItems = await prisma.aiReviewStrategyBatchRunItem.findMany({
        where: {
            questionId: input.questionId,
            status: {
                in: [BatchRunItemStatus.PENDING, BatchRunItemStatus.RUNNING],
            },
            batchRun: {
                strategyId: input.modelColumn.strategyId,
                status: {
                    in: [
                        BatchRunStatus.PENDING,
                        BatchRunStatus.RUNNING,
                        BatchRunStatus.CANCEL_REQUESTED,
                    ],
                },
            },
        },
        select: {
            resultPayload: true,
            batchRun: {
                select: {
                    requestPayload: true,
                },
            },
        },
    });
    const duplicated = activeItems.some((item) => {
        const payload =
            parseDataEvaluationModelRunTaskPayload(item.resultPayload) ??
            parseDataEvaluationModelRunTaskPayload(
                item.batchRun.requestPayload,
            );

        return payload?.columnCode === input.modelColumn.code;
    });

    if (duplicated) {
        throw new Error("该模型评测任务已在排队或执行中，请勿重复提交。");
    }

    return createDataEvaluationModelRunBatchRun({
        strategyId: input.modelColumn.strategyId,
        questionId: input.questionId,
        columnCode: input.modelColumn.code,
        evaluationModelFilter: {
            answerModelCode: input.modelColumn.answerModelCode,
            judgeModelCode: input.modelColumn.judgeModelCode,
        },
        createdById: input.createdById,
    });
}

export async function getDataEvaluationModelColumns(input: {
    projectId: string;
    viewer: EvaluationViewer;
}) {
    if (!process.env.DATABASE_URL || !input.projectId) {
        return [];
    }

    const strategies = (await getEvaluationStrategies(input.viewer)).filter(
        (strategy) => strategyMatchesProject(strategy, input.projectId),
    );
    const modelCodes = getEvaluationModelCodes(strategies);
    const modelLabelMap = await getModelLabelMap(modelCodes);

    return getEvaluationModelColumns(strategies, modelLabelMap);
}

export async function getDataEvaluationQuestionList(input: {
    projectId: string;
    page?: number;
    pageSize?: number;
    viewer: EvaluationViewer;
}) {
    if (!process.env.DATABASE_URL || !input.projectId) {
        return {
            items: [] as DataEvaluationQuestionRow[],
            total: 0,
            page: 1,
            pageSize: input.pageSize ?? 50,
            modelColumns: [] as DataEvaluationModelColumn[],
        };
    }

    const pageSize = [20, 50, 100].includes(input.pageSize ?? 50)
        ? (input.pageSize ?? 50)
        : 50;
    const allowedPrimaryValues = await getAccessiblePrimaryValueSet(
        input.viewer.userId,
        input.viewer.platformRole,
    );
    const strategies = (await getEvaluationStrategies(input.viewer)).filter(
        (strategy) => strategyMatchesProject(strategy, input.projectId),
    );
    const modelCodes = getEvaluationModelCodes(strategies);
    const modelLabelMap = await getModelLabelMap(modelCodes);
    const modelColumns = getEvaluationModelColumns(strategies, modelLabelMap);
    const project = await prisma.project.findUnique({
        where: {
            id: input.projectId,
        },
        select: {
            createdById: true,
        },
    });
    const canManageProjectQuestions =
        input.viewer.platformRole === "SUPER_ADMIN" ||
        (input.viewer.platformRole === "PLATFORM_ADMIN" &&
            project?.createdById === input.viewer.userId);

    const questions = await prisma.question.findMany({
        where: {
            projectId: input.projectId,
            status: "APPROVED",
            isLatestRevision: true,
        },
        orderBy: [{ datasourceId: "asc" }, { updatedAt: "desc" }],
        select: {
            id: true,
            title: true,
            externalRecordId: true,
            questionType: true,
            difficulty: true,
            updatedAt: true,
            metadata: true,
            datasource: {
                select: {
                    name: true,
                },
            },
        },
    });

    const visibleQuestions = questions.filter((question) =>
        questionMatchesPrimaryValueScopeForProject(
            question.metadata,
            allowedPrimaryValues,
            {
                userId: input.viewer.userId,
                platformRole: input.viewer.platformRole,
                projectCreatedById: project?.createdById ?? null,
            },
        ),
    );
    const total = visibleQuestions.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, input.page ?? 1), totalPages);
    const pageQuestions = visibleQuestions.slice(
        (page - 1) * pageSize,
        page * pageSize,
    );
    const resultMap = await getLatestEvaluationResults(
        pageQuestions.map((question) => question.id),
        modelColumns,
        strategies,
        { includeRawResponse: false },
    );

    return {
        items: pageQuestions.map((question) => ({
            id: question.id,
            title: question.title,
            sourceQuestionId:
                extractRawRecordString(question.metadata, "question_id") ??
                question.externalRecordId,
            primary: extractQuestionPrimaryValue(question.metadata),
            datasourceName: question.datasource.name,
            externalRecordId: question.externalRecordId,
            questionType: question.questionType,
            difficulty: question.difficulty,
            updatedAt: question.updatedAt.toISOString(),
            canManage: canManageProjectQuestions,
            rawRecord: extractRawRecord(question.metadata),
            results:
                resultMap.get(question.id) ??
                Object.fromEntries(modelColumns.map((column) => [column.code, null])),
        })),
        total,
        page,
        pageSize,
        modelColumns,
    };
}

export async function getDataEvaluationDetail(input: {
    questionId: string;
    viewer: EvaluationViewer;
    includeRawResponse?: boolean;
}) {
    const question = await getReviewQuestionDetail(
        input.questionId,
        input.viewer,
    );

    if (!question || question.status !== "APPROVED") {
        return null;
    }

    const strategies = (await getEvaluationStrategies(input.viewer)).filter(
        (strategy) => strategyMatchesQuestion(strategy, question),
    );
    const modelCodes = getEvaluationModelCodes(strategies);
    const modelLabelMap = await getModelLabelMap(modelCodes);
    const modelColumns = getEvaluationModelColumns(strategies, modelLabelMap);
    const resultMap = await getLatestEvaluationResults(
        [question.id],
        modelColumns,
        strategies,
        { includeRawResponse: input.includeRawResponse ?? true },
    );

    return {
        question,
        modelColumns,
        results:
            resultMap.get(question.id) ??
            Object.fromEntries(modelColumns.map((column) => [column.code, null])),
    };
}

export async function getDataEvaluationQuestionNavigation(input: {
    questionId: string;
    projectId?: string;
    viewer: EvaluationViewer;
}) {
    const emptyNavigation = {
        previousQuestionId: null,
        nextQuestionId: null,
    } satisfies DataEvaluationQuestionNavigation;

    if (!process.env.DATABASE_URL) {
        return emptyNavigation;
    }

    const currentQuestion = await prisma.question.findUnique({
        where: {
            id: input.questionId,
        },
        select: {
            id: true,
            projectId: true,
            status: true,
            isLatestRevision: true,
        },
    });

    if (
        !currentQuestion ||
        currentQuestion.status !== "APPROVED" ||
        !currentQuestion.isLatestRevision
    ) {
        return emptyNavigation;
    }

    const scopedProjectId = input.projectId || currentQuestion.projectId;
    const project = await prisma.project.findUnique({
        where: {
            id: scopedProjectId,
        },
        select: {
            createdById: true,
        },
    });
    const allowedPrimaryValues = await getAccessiblePrimaryValueSet(
        input.viewer.userId,
        input.viewer.platformRole,
    );
    const questions = await prisma.question.findMany({
        where: {
            projectId: scopedProjectId,
            status: "APPROVED",
            isLatestRevision: true,
        },
        orderBy: [{ datasourceId: "asc" }, { updatedAt: "desc" }],
        select: {
            id: true,
            metadata: true,
        },
    });
    const visibleQuestions = questions.filter((question) =>
        questionMatchesPrimaryValueScopeForProject(
            question.metadata,
            allowedPrimaryValues,
            {
                userId: input.viewer.userId,
                platformRole: input.viewer.platformRole,
                projectCreatedById: project?.createdById ?? null,
            },
        ),
    );
    const currentIndex = visibleQuestions.findIndex(
        (question) => question.id === input.questionId,
    );

    if (currentIndex < 0) {
        return emptyNavigation;
    }

    return {
        previousQuestionId: visibleQuestions[currentIndex - 1]?.id ?? null,
        nextQuestionId: visibleQuestions[currentIndex + 1]?.id ?? null,
    } satisfies DataEvaluationQuestionNavigation;
}
