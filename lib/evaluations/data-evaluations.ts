import { Prisma } from "@prisma/client";
import { resolveUserAdminScopeId } from "@/lib/auth/admin-scope";
import type { PlatformRoleValue } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import {
    aiReviewStrategyDefinitionSchema,
    type AiReviewAiToolStep,
    type AiReviewStrategyDefinition,
    type AiReviewStrategyStep,
} from "@/lib/ai/review-strategy-schema";
import {
    getAccessiblePrimaryValueSet,
    questionMatchesPrimaryValueScope,
} from "@/lib/subjects/access";
import { getReviewQuestionDetail } from "@/lib/reviews/question-list-data";

type EvaluationViewer = {
    userId: string;
    platformRole: PlatformRoleValue;
};

export type DataEvaluationModelColumn = {
    code: string;
    label: string;
};

export type DataEvaluationResult = {
    modelCode: string;
    modelLabel: string;
    status: string;
    runId: string;
    strategyName: string;
    updatedAt: string;
    difficultyLevel: string | null;
    score: number | null;
    summary: string | null;
    evidence: string[];
    errorMessage: string | null;
};

export type DataEvaluationQuestionRow = {
    id: string;
    title: string;
    datasourceName: string;
    externalRecordId: string;
    questionType: string | null;
    difficulty: string | null;
    updatedAt: string;
    results: Record<string, DataEvaluationResult | null>;
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

function hasEvaluationStep(definition: AiReviewStrategyDefinition) {
    return definition.steps.some((step) => step.enabled && isEvaluationStep(step));
}

function isEvaluationStep(
    step: AiReviewStrategyStep,
): step is AiReviewAiToolStep {
    return (
        step.kind === "AI_TOOL" && step.toolType === "DIFFICULTY_EVALUATION"
    );
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

            if (!definition || !hasEvaluationStep(definition)) {
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
                    .map((step) => step.modelCode),
            ),
        ),
    ];
}

function readResultOutput(output: unknown) {
    if (!output || typeof output !== "object" || Array.isArray(output)) {
        return {
            difficultyLevel: null,
            score: null,
            summary: null,
            evidence: [],
        };
    }

    const record = output as Record<string, unknown>;
    return {
        difficultyLevel:
            typeof record.difficultyLevel === "string"
                ? record.difficultyLevel
                : null,
        score: typeof record.score === "number" ? record.score : null,
        summary: typeof record.summary === "string" ? record.summary : null,
        evidence: Array.isArray(record.evidence)
            ? record.evidence.filter(
                  (item): item is string => typeof item === "string",
              )
            : [],
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
) {
    const definition = parseDefinition(run.strategy.definition);
    if (!definition) {
        return [];
    }

    const stepModelMap = new Map(
        definition.steps
            .filter(
                (step): step is AiReviewAiToolStep => isEvaluationStep(step),
            )
            .map((step) => [step.id, step.modelCode]),
    );
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

    const results: DataEvaluationResult[] = [];

    for (const stepResult of stepResults) {
        if (
            !stepResult ||
            typeof stepResult !== "object" ||
            Array.isArray(stepResult)
        ) {
            continue;
        }

        const stepRecord = stepResult as Record<string, unknown>;
        if (
            stepRecord.stepKind !== "AI_TOOL" ||
            stepRecord.stepType !== "DIFFICULTY_EVALUATION"
        ) {
            continue;
        }

        const modelCode =
            typeof stepRecord.stepId === "string"
                ? stepModelMap.get(stepRecord.stepId)
                : null;
        if (!modelCode) {
            continue;
        }

        const items = Array.isArray(stepRecord.items) ? stepRecord.items : [];
        const successfulItem = items.find(
            (item) =>
                item &&
                typeof item === "object" &&
                !Array.isArray(item) &&
                (item as Record<string, unknown>).status === "SUCCESS",
        ) as Record<string, unknown> | undefined;
        const output = readResultOutput(successfulItem?.output);

        results.push({
            modelCode,
            modelLabel: modelLabelMap.get(modelCode) ?? modelCode,
            status: String(stepRecord.status ?? run.status),
            runId: run.id,
            strategyName: run.strategy.name,
            updatedAt: run.updatedAt.toISOString(),
            difficultyLevel: output.difficultyLevel,
            score: output.score,
            summary:
                output.summary ??
                (typeof stepRecord.summary === "string"
                    ? stepRecord.summary
                    : null),
            evidence: output.evidence,
            errorMessage:
                typeof stepRecord.error === "string"
                    ? stepRecord.error
                    : run.errorMessage,
        });
    }

    return results;
}

async function getLatestEvaluationResults(
    questionIds: string[],
    modelCodes: string[],
    strategies: Array<{ id: string }>,
) {
    const emptyMap = new Map<string, Record<string, DataEvaluationResult | null>>();

    for (const questionId of questionIds) {
        emptyMap.set(
            questionId,
            Object.fromEntries(modelCodes.map((code) => [code, null])),
        );
    }

    if (!questionIds.length || !modelCodes.length || !strategies.length) {
        return emptyMap;
    }

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

    const modelCodeSet = new Set(modelCodes);

    for (const run of runs) {
        const questionResults = emptyMap.get(run.questionId);
        if (!questionResults) {
            continue;
        }

        for (const result of extractRunResults(run, modelLabelMap)) {
            if (!modelCodeSet.has(result.modelCode)) {
                continue;
            }

            if (!questionResults[result.modelCode]) {
                questionResults[result.modelCode] = result;
            }
        }
    }

    return emptyMap;
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

    return modelCodes.map((code) => ({
        code,
        label: modelLabelMap.get(code) ?? code,
    }));
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
    const modelColumns = modelCodes.map((code) => ({
        code,
        label: modelLabelMap.get(code) ?? code,
    }));

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
        questionMatchesPrimaryValueScope(question.metadata, allowedPrimaryValues),
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
        modelCodes,
        strategies,
    );

    return {
        items: pageQuestions.map((question) => ({
            id: question.id,
            title: question.title,
            datasourceName: question.datasource.name,
            externalRecordId: question.externalRecordId,
            questionType: question.questionType,
            difficulty: question.difficulty,
            updatedAt: question.updatedAt.toISOString(),
            results:
                resultMap.get(question.id) ??
                Object.fromEntries(modelCodes.map((code) => [code, null])),
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
    const modelColumns = modelCodes.map((code) => ({
        code,
        label: modelLabelMap.get(code) ?? code,
    }));
    const resultMap = await getLatestEvaluationResults(
        [question.id],
        modelCodes,
        strategies,
    );

    return {
        question,
        modelColumns,
        results:
            resultMap.get(question.id) ??
            Object.fromEntries(modelCodes.map((code) => [code, null])),
    };
}
