import {
    BatchRunItemStatus,
    BatchRunStatus,
    type Prisma,
} from "@prisma/client";
import {
    resolveUserAdminScopeId,
} from "@/lib/auth/admin-scope";
import type { PlatformRoleValue } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import {
    executeAiReviewStrategy,
    retryAiReviewStrategyRunItem,
    type EvaluationModelFilter,
} from "@/lib/ai/review-strategies";
import { aiReviewStrategyDefinitionSchema } from "@/lib/ai/review-strategy-schema";
import { logError, logInfo, logWarn } from "@/lib/logging/app-logger";
import {
    getAccessiblePrimaryValueSet,
    questionMatchesPrimaryValueScope,
} from "@/lib/subjects/access";

const TERMINAL_BATCH_STATUSES = new Set<BatchRunStatus>([
    BatchRunStatus.SUCCESS,
    BatchRunStatus.FAILED,
    BatchRunStatus.CANCELLED,
]);
const ACTIVE_BATCH_STATUSES = [
    BatchRunStatus.RUNNING,
    BatchRunStatus.CANCEL_REQUESTED,
    BatchRunStatus.PENDING,
] as const;
const BATCH_RUN_HEARTBEAT_INTERVAL_MS = 30 * 1000;
const STALE_BATCH_RUN_HEARTBEAT_MS = 15 * 60 * 1000;

function getStaleBatchRunReason(run: {
    status: BatchRunStatus;
    workerId: string | null;
    lastHeartbeatAt: Date | null;
}) {
    if (TERMINAL_BATCH_STATUSES.has(run.status)) {
        return null;
    }

    if (!run.workerId) {
        return null;
    }

    if (!run.lastHeartbeatAt) {
        return "worker 已占用任务，但没有心跳记录。";
    }

    const staleBefore = Date.now() - STALE_BATCH_RUN_HEARTBEAT_MS;

    if (run.lastHeartbeatAt.getTime() < staleBefore) {
        return "worker 心跳已超过 15 分钟未更新。";
    }

    return null;
}

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

function isRunnableReviewStrategy(definition: {
    steps: Array<{ kind: string; enabled: boolean; toolType?: string }>;
}) {
    const enabledSteps = definition.steps.filter((step) => step.enabled);

    if (!enabledSteps.length) {
        return false;
    }

    return enabledSteps.some(
        (step) =>
            step.kind !== "AI_TOOL" || step.toolType !== "TRANSLATE_TO_CHINESE",
    );
}

function strategyAppliesToQuestion(
    strategy: { projectIds: unknown; datasourceIds: unknown },
    question: { projectId: string; datasourceId: string },
) {
    const projectIds = parseStringArray(strategy.projectIds);

    if (projectIds.length && !projectIds.includes(question.projectId)) {
        return false;
    }

    const datasourceIds = parseStringArray(strategy.datasourceIds);

    if (!datasourceIds.length) {
        return true;
    }

    return datasourceIds.includes(question.datasourceId);
}

function serializeJson(value: unknown) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

type RetryRunItemTaskPayload = {
    mode: "RETRY_RUN_ITEM";
    runId: string;
    stepId: string;
    itemIndex: number;
    questionId: string;
    result?: {
        runId?: string;
        status?: string;
        finalRecommendation?: unknown;
        reviewPersistence?: unknown;
        errorMessage?: string;
    };
};

export type DataEvaluationModelRunTaskPayload = {
    mode: "DATA_EVALUATION_MODEL_RUN";
    strategyId: string;
    questionId: string;
    columnCode: string;
    evaluationModelFilter: EvaluationModelFilter;
};

export type AiReviewStrategyRetryStateView = {
    key: string;
    runId: string;
    stepId: string;
    itemIndex: number;
    batchRunId: string;
    status: BatchRunItemStatus;
    errorMessage: string | null;
    updatedAt: string;
};

function buildRetryStateKey(runId: string, stepId: string, itemIndex: number) {
    return `${runId}:${stepId}:${itemIndex}`;
}

function parseRetryRunItemTaskPayload(
    input: unknown,
): RetryRunItemTaskPayload | null {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return null;
    }

    const candidate = input as Record<string, unknown>;

    if (candidate.mode !== "RETRY_RUN_ITEM") {
        return null;
    }

    if (
        typeof candidate.runId !== "string" ||
        typeof candidate.stepId !== "string" ||
        typeof candidate.itemIndex !== "number" ||
        typeof candidate.questionId !== "string"
    ) {
        return null;
    }

    return {
        mode: "RETRY_RUN_ITEM",
        runId: candidate.runId,
        stepId: candidate.stepId,
        itemIndex: candidate.itemIndex,
        questionId: candidate.questionId,
        result:
            candidate.result &&
            typeof candidate.result === "object" &&
            !Array.isArray(candidate.result)
                ? (candidate.result as RetryRunItemTaskPayload["result"])
                : undefined,
    };
}

export function parseDataEvaluationModelRunTaskPayload(
    input: unknown,
): DataEvaluationModelRunTaskPayload | null {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return null;
    }

    const candidate = input as Record<string, unknown>;

    if (candidate.mode !== "DATA_EVALUATION_MODEL_RUN") {
        return null;
    }

    const filter = candidate.evaluationModelFilter;

    if (
        typeof candidate.strategyId !== "string" ||
        typeof candidate.questionId !== "string" ||
        typeof candidate.columnCode !== "string" ||
        !filter ||
        typeof filter !== "object" ||
        Array.isArray(filter)
    ) {
        return null;
    }

    const filterRecord = filter as Record<string, unknown>;
    const answerModelCode =
        typeof filterRecord.answerModelCode === "string"
            ? filterRecord.answerModelCode
            : null;
    const judgeModelCode =
        typeof filterRecord.judgeModelCode === "string"
            ? filterRecord.judgeModelCode
            : null;

    if (!answerModelCode && !judgeModelCode) {
        return null;
    }

    return {
        mode: "DATA_EVALUATION_MODEL_RUN",
        strategyId: candidate.strategyId,
        questionId: candidate.questionId,
        columnCode: candidate.columnCode,
        evaluationModelFilter: {
            answerModelCode,
            judgeModelCode,
        },
    };
}

function hasRetryRunItemMode(input: unknown) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return false;
    }

    return (input as Record<string, unknown>).mode === "RETRY_RUN_ITEM";
}

function parseDataEvaluationModelRunPayloadFromItem(
    item: { resultPayload: Prisma.JsonValue | null },
    batchRun: { requestPayload: Prisma.JsonValue },
) {
    return (
        parseDataEvaluationModelRunTaskPayload(item.resultPayload) ??
        parseDataEvaluationModelRunTaskPayload(batchRun.requestPayload)
    );
}

type BatchCounts = {
    totalCount: number;
    pendingCount: number;
    runningCount: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    cancelledCount: number;
};

function summarizeBatchCounts(statuses: BatchRunItemStatus[]): BatchCounts {
    return statuses.reduce<BatchCounts>(
        (counts, status) => {
            counts.totalCount += 1;

            if (status === BatchRunItemStatus.PENDING) counts.pendingCount += 1;
            if (status === BatchRunItemStatus.RUNNING) counts.runningCount += 1;
            if (status === BatchRunItemStatus.SUCCESS) counts.successCount += 1;
            if (status === BatchRunItemStatus.FAILED) counts.failedCount += 1;
            if (status === BatchRunItemStatus.SKIPPED) counts.skippedCount += 1;
            if (status === BatchRunItemStatus.CANCELLED)
                counts.cancelledCount += 1;

            return counts;
        },
        {
            totalCount: 0,
            pendingCount: 0,
            runningCount: 0,
            successCount: 0,
            failedCount: 0,
            skippedCount: 0,
            cancelledCount: 0,
        },
    );
}

export type AiReviewStrategyBatchRunView = {
    id: string;
    status: BatchRunStatus;
    concurrency: number;
    totalCount: number;
    pendingCount: number;
    runningCount: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    errorMessage: string | null;
    workerId: string | null;
    lastHeartbeatAt: string | null;
    isStale: boolean;
    staleReason: string | null;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    createdByName: string;
    strategy: {
        id: string;
        name: string;
        code: string;
    };
    currentItems: Array<{
        questionId: string;
        questionExternalRecordId: string;
        status: BatchRunItemStatus;
    }>;
    recentFailures: Array<{
        questionId: string;
        questionExternalRecordId: string;
        errorMessage: string;
    }>;
};

export type AiReviewStrategyBatchRunPage = {
    runs: AiReviewStrategyBatchRunView[];
    page: number;
    pageSize: number;
    total: number;
};

function mapBatchRunView(run: {
    id: string;
    status: BatchRunStatus;
    concurrency: number;
    totalCount: number;
    pendingCount: number;
    runningCount: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    errorMessage: string | null;
    workerId: string | null;
    lastHeartbeatAt: Date | null;
    createdAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdBy: { name: string | null };
    strategy: { id: string; name: string; code: string };
    items: Array<{
        status: BatchRunItemStatus;
        errorMessage: string | null;
        question: { id: string; externalRecordId: string };
    }>;
}): AiReviewStrategyBatchRunView {
    const staleReason = getStaleBatchRunReason(run);

    return {
        id: run.id,
        status: run.status,
        concurrency: run.concurrency,
        totalCount: run.totalCount,
        pendingCount: run.pendingCount,
        runningCount: run.runningCount,
        successCount: run.successCount,
        failedCount: run.failedCount,
        skippedCount: run.skippedCount,
        errorMessage: run.errorMessage,
        workerId: run.workerId,
        lastHeartbeatAt: run.lastHeartbeatAt?.toISOString() ?? null,
        isStale: Boolean(staleReason),
        staleReason,
        createdAt: run.createdAt.toISOString(),
        startedAt: run.startedAt?.toISOString() ?? null,
        finishedAt: run.finishedAt?.toISOString() ?? null,
        createdByName: run.createdBy.name ?? "未知用户",
        strategy: run.strategy,
        currentItems: run.items
            .filter((item) => item.status === BatchRunItemStatus.RUNNING)
            .map((item) => ({
                questionId: item.question.id,
                questionExternalRecordId: item.question.externalRecordId,
                status: item.status,
            })),
        recentFailures: run.items
            .filter(
                (item): item is typeof item & { errorMessage: string } =>
                    item.status === BatchRunItemStatus.FAILED &&
                    Boolean(item.errorMessage),
            )
            .map((item) => ({
                questionId: item.question.id,
                questionExternalRecordId: item.question.externalRecordId,
                errorMessage: item.errorMessage,
            })),
    };
}

function getBatchRunStatusSortRank(status: BatchRunStatus) {
    if (status === BatchRunStatus.RUNNING) return 0;
    if (status === BatchRunStatus.CANCEL_REQUESTED) return 1;
    if (status === BatchRunStatus.PENDING) return 2;
    return 3;
}

export async function getAiReviewStrategyBatchRunsForProject(
    projectId: string,
    viewer?: {
        userId: string;
        platformRole: PlatformRoleValue;
    },
    options: {
        page?: number;
        pageSize?: number;
    } = {},
): Promise<AiReviewStrategyBatchRunPage> {
    if (!process.env.DATABASE_URL) {
        return {
            runs: [],
            page: 1,
            pageSize: 20,
            total: 0,
        };
    }

    const pageSize = [20, 50, 100].includes(options.pageSize ?? 20)
        ? (options.pageSize ?? 20)
        : 20;
    const requestedPage =
        Number.isInteger(options.page) && (options.page ?? 0) > 0
            ? (options.page as number)
            : 1;

    const scopeAdminId = viewer
        ? await resolveUserAdminScopeId(viewer.userId, viewer.platformRole)
        : null;
    const allowedPrimaryValues = viewer
        ? await getAccessiblePrimaryValueSet(viewer.userId, viewer.platformRole)
        : null;

    const baseWhere = {
        projectId,
        ...(viewer?.platformRole === "SUPER_ADMIN"
            ? {}
            : {
                  strategy: {
                      scopeAdminId: scopeAdminId ?? "__no_scope__",
                  },
              }),
    } satisfies Prisma.AiReviewStrategyBatchRunWhereInput;

    const include = {
        strategy: {
            select: {
                id: true,
                name: true,
                code: true,
            },
        },
        createdBy: {
            select: {
                name: true,
            },
        },
        items: {
            where: {
                OR: [
                    {
                        status: BatchRunItemStatus.RUNNING,
                    },
                    {
                        status: BatchRunItemStatus.FAILED,
                    },
                ],
            },
            orderBy: [{ updatedAt: "desc" }],
            take: 6,
            include: {
                question: {
                    select: {
                        id: true,
                        externalRecordId: true,
                        metadata: true,
                    },
                },
            },
        },
    } satisfies Prisma.AiReviewStrategyBatchRunInclude;

    const activeWhere = {
        ...baseWhere,
        status: {
            in: [...ACTIVE_BATCH_STATUSES],
        },
    } satisfies Prisma.AiReviewStrategyBatchRunWhereInput;
    const completedWhere = {
        ...baseWhere,
        status: {
            notIn: [...ACTIVE_BATCH_STATUSES],
        },
    } satisfies Prisma.AiReviewStrategyBatchRunWhereInput;
    const [activeTotal, completedTotal] = await Promise.all([
        prisma.aiReviewStrategyBatchRun.count({
            where: activeWhere,
        }),
        prisma.aiReviewStrategyBatchRun.count({
            where: completedWhere,
        }),
    ]);
    const total = activeTotal + completedTotal;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    const activeRuns =
        offset < activeTotal
            ? await prisma.aiReviewStrategyBatchRun.findMany({
                  where: activeWhere,
                  orderBy: [{ createdAt: "desc" }],
                  include,
              })
            : [];

    activeRuns.sort((left, right) => {
        const statusDiff =
            getBatchRunStatusSortRank(left.status) -
            getBatchRunStatusSortRank(right.status);

        if (statusDiff !== 0) {
            return statusDiff;
        }

        return right.createdAt.getTime() - left.createdAt.getTime();
    });

    const activePageRuns = activeRuns.slice(offset, offset + pageSize);
    const completedTake = pageSize - activePageRuns.length;
    const completedSkip = Math.max(0, offset - activeTotal);
    const completedRuns =
        completedTake > 0
            ? await prisma.aiReviewStrategyBatchRun.findMany({
                  where: completedWhere,
                  orderBy: [{ createdAt: "desc" }],
                  skip: completedSkip,
                  take: completedTake,
                  include,
              })
            : [];

    const runs = [...activePageRuns, ...completedRuns]
        .map((run) => ({
            ...run,
            items: run.items.filter((item) =>
                questionMatchesPrimaryValueScope(
                    item.question.metadata,
                    allowedPrimaryValues,
                ),
            ),
        }))
        .filter((run) => allowedPrimaryValues === null || run.items.length > 0)
        .map(mapBatchRunView);

    return {
        runs,
        page,
        pageSize,
        total,
    };
}

async function syncBatchRunState(batchRunId: string) {
    const [batchRun, items] = await Promise.all([
        prisma.aiReviewStrategyBatchRun.findUnique({
            where: {
                id: batchRunId,
            },
            select: {
                id: true,
                status: true,
                startedAt: true,
                finishedAt: true,
            },
        }),
        prisma.aiReviewStrategyBatchRunItem.findMany({
            where: {
                batchRunId,
            },
            select: {
                status: true,
            },
        }),
    ]);

    if (!batchRun) {
        return null;
    }

    const counts = summarizeBatchCounts(items.map((item) => item.status));
    let nextStatus = batchRun.status;
    let finishedAt = batchRun.finishedAt;

    if (batchRun.status === BatchRunStatus.CANCEL_REQUESTED) {
        nextStatus = counts.runningCount
            ? BatchRunStatus.CANCEL_REQUESTED
            : BatchRunStatus.CANCELLED;
    } else if (!counts.pendingCount && !counts.runningCount) {
        nextStatus = counts.failedCount
            ? BatchRunStatus.FAILED
            : BatchRunStatus.SUCCESS;
    } else if (batchRun.startedAt) {
        nextStatus = BatchRunStatus.RUNNING;
    } else {
        nextStatus = BatchRunStatus.PENDING;
    }

    if (TERMINAL_BATCH_STATUSES.has(nextStatus)) {
        finishedAt = finishedAt ?? new Date();
    } else {
        finishedAt = null;
    }

    await prisma.aiReviewStrategyBatchRun.update({
        where: {
            id: batchRunId,
        },
        data: {
            status: nextStatus,
            totalCount: counts.totalCount,
            pendingCount: counts.pendingCount,
            runningCount: counts.runningCount,
            successCount: counts.successCount,
            failedCount: counts.failedCount,
            skippedCount: counts.skippedCount + counts.cancelledCount,
            finishedAt,
            workerId:
                TERMINAL_BATCH_STATUSES.has(nextStatus) ? null : undefined,
            lastHeartbeatAt:
                TERMINAL_BATCH_STATUSES.has(nextStatus) ? null : undefined,
            summaryPayload: serializeJson({
                cancelledCount: counts.cancelledCount,
            }),
        },
    });

    return {
        ...counts,
        status: nextStatus,
    };
}

export async function createAiReviewStrategyBatchRun(input: {
    strategyId: string;
    questionIds: string[];
    concurrency: number;
    createdById: string;
}) {
    if (!process.env.DATABASE_URL) {
        throw new Error("当前未配置 DATABASE_URL，无法创建批量任务。");
    }

    const strategy = await prisma.aiReviewStrategy.findUnique({
        where: {
            id: input.strategyId,
        },
        select: {
            id: true,
            code: true,
            name: true,
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

    if (!definition || !isRunnableReviewStrategy(definition)) {
        throw new Error("当前策略不可执行。");
    }

    if (!strategy.enabled) {
        throw new Error("当前策略已停用，无法创建批量任务。");
    }

    const uniqueQuestionIds = [...new Set(input.questionIds)];

    if (!uniqueQuestionIds.length) {
        throw new Error("至少选择 1 道题目后才能创建批量任务。");
    }

    const questions = await prisma.question.findMany({
        where: {
            id: {
                in: uniqueQuestionIds,
            },
        },
        select: {
            id: true,
            title: true,
            projectId: true,
            datasourceId: true,
        },
    });

    if (questions.length !== uniqueQuestionIds.length) {
        throw new Error("部分题目不存在或已被删除，请刷新后重试。");
    }

    const projectId = questions[0]?.projectId;

    if (
        !projectId ||
        questions.some((question) => question.projectId !== projectId)
    ) {
        throw new Error("批量任务暂只支持同一项目下的题目。");
    }

    const orderedQuestions = uniqueQuestionIds.map((questionId) => {
        const question = questions.find((item) => item.id === questionId);

        if (!question) {
            throw new Error("题目顺序数据异常，请刷新后重试。");
        }

        return question;
    });
    const resolvedConcurrency = Math.min(
        2,
        Math.max(1, Math.floor(input.concurrency || 1)),
    );
    const items = orderedQuestions.map((question, index) => {
        const applicable = strategyAppliesToQuestion(strategy, question);

        return {
            questionId: question.id,
            sequence: index + 1,
            status: applicable
                ? BatchRunItemStatus.PENDING
                : BatchRunItemStatus.SKIPPED,
            errorMessage: applicable
                ? null
                : "当前题目不在策略适用范围内，已跳过。",
        };
    });
    const pendingCount = items.filter(
        (item) => item.status === BatchRunItemStatus.PENDING,
    ).length;
    const skippedCount = items.filter(
        (item) => item.status === BatchRunItemStatus.SKIPPED,
    ).length;

    const batchRun = await prisma.$transaction(async (tx) => {
        const created = await tx.aiReviewStrategyBatchRun.create({
            data: {
                strategyId: strategy.id,
                projectId,
                createdById: input.createdById,
                status: pendingCount
                    ? BatchRunStatus.PENDING
                    : BatchRunStatus.SUCCESS,
                concurrency: resolvedConcurrency,
                totalCount: items.length,
                pendingCount,
                runningCount: 0,
                successCount: 0,
                failedCount: 0,
                skippedCount,
                requestPayload: serializeJson({
                    strategy: {
                        id: strategy.id,
                        code: strategy.code,
                        name: strategy.name,
                    },
                    questionIds: orderedQuestions.map(
                        (question) => question.id,
                    ),
                }),
                finishedAt: pendingCount ? null : new Date(),
            },
            include: {
                strategy: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                createdBy: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        await tx.aiReviewStrategyBatchRunItem.createMany({
            data: items.map((item) => ({
                batchRunId: created.id,
                questionId: item.questionId,
                sequence: item.sequence,
                status: item.status,
                errorMessage: item.errorMessage,
                finishedAt:
                    item.status === BatchRunItemStatus.SKIPPED
                        ? new Date()
                        : null,
            })),
        });

        return created;
    });

    return {
        id: batchRun.id,
        status: batchRun.status,
    };
}

export async function createDataEvaluationModelRunBatchRun(input: {
    strategyId: string;
    questionId: string;
    columnCode: string;
    evaluationModelFilter: EvaluationModelFilter;
    createdById: string;
}) {
    if (!process.env.DATABASE_URL) {
        throw new Error("当前未配置 DATABASE_URL，无法创建数据评测任务。");
    }

    const [strategy, question] = await Promise.all([
        prisma.aiReviewStrategy.findUnique({
            where: {
                id: input.strategyId,
            },
            select: {
                id: true,
                code: true,
                name: true,
                enabled: true,
                projectIds: true,
                datasourceIds: true,
                definition: true,
            },
        }),
        prisma.question.findUnique({
            where: {
                id: input.questionId,
            },
            select: {
                id: true,
                projectId: true,
                datasourceId: true,
            },
        }),
    ]);

    if (!strategy) {
        throw new Error("评测策略不存在。");
    }

    if (!question) {
        throw new Error("题目不存在或已被删除。");
    }

    const definition = parseDefinition(strategy.definition);

    if (!definition || !isRunnableReviewStrategy(definition)) {
        throw new Error("当前策略不可执行。");
    }

    if (!strategy.enabled) {
        throw new Error("当前策略已停用，无法创建数据评测任务。");
    }

    if (!strategyAppliesToQuestion(strategy, question)) {
        throw new Error("当前策略不适用于这道题目。");
    }

    const taskPayload: DataEvaluationModelRunTaskPayload = {
        mode: "DATA_EVALUATION_MODEL_RUN",
        strategyId: strategy.id,
        questionId: question.id,
        columnCode: input.columnCode,
        evaluationModelFilter: input.evaluationModelFilter,
    };

    const batchRun = await prisma.$transaction(async (tx) => {
        const created = await tx.aiReviewStrategyBatchRun.create({
            data: {
                strategyId: strategy.id,
                projectId: question.projectId,
                createdById: input.createdById,
                status: BatchRunStatus.PENDING,
                concurrency: 1,
                totalCount: 1,
                pendingCount: 1,
                runningCount: 0,
                successCount: 0,
                failedCount: 0,
                skippedCount: 0,
                requestPayload: serializeJson(taskPayload),
            },
        });

        await tx.aiReviewStrategyBatchRunItem.create({
            data: {
                batchRunId: created.id,
                questionId: question.id,
                sequence: 1,
                status: BatchRunItemStatus.PENDING,
                resultPayload: serializeJson(taskPayload),
            },
        });

        return created;
    });

    return {
        id: batchRun.id,
        status: batchRun.status,
    };
}

export async function createDataEvaluationModelRunBatchRunGroup(input: {
    strategyId: string;
    items: Array<{
        questionId: string;
        columnCode: string;
        evaluationModelFilter: EvaluationModelFilter;
    }>;
    createdById: string;
}) {
    if (!process.env.DATABASE_URL) {
        throw new Error("当前未配置 DATABASE_URL，无法创建数据评测批量任务。");
    }

    const uniqueItems = [
        ...new Map(
            input.items.map((item) => [
                `${item.questionId}::${item.columnCode}`,
                item,
            ]),
        ).values(),
    ];

    if (!uniqueItems.length) {
        throw new Error("至少选择 1 个题目模型组合后才能创建批量任务。");
    }

    const [strategy, questions] = await Promise.all([
        prisma.aiReviewStrategy.findUnique({
            where: {
                id: input.strategyId,
            },
            select: {
                id: true,
                code: true,
                name: true,
                enabled: true,
                projectIds: true,
                datasourceIds: true,
                definition: true,
            },
        }),
        prisma.question.findMany({
            where: {
                id: {
                    in: [...new Set(uniqueItems.map((item) => item.questionId))],
                },
            },
            select: {
                id: true,
                projectId: true,
                datasourceId: true,
            },
        }),
    ]);

    if (!strategy) {
        throw new Error("评测策略不存在。");
    }

    const definition = parseDefinition(strategy.definition);

    if (!definition || !isRunnableReviewStrategy(definition)) {
        throw new Error("当前策略不可执行。");
    }

    if (!strategy.enabled) {
        throw new Error("当前策略已停用，无法创建数据评测批量任务。");
    }

    const questionMap = new Map(
        questions.map((question) => [question.id, question]),
    );
    const projectId = questions[0]?.projectId;

    if (
        !projectId ||
        questions.some((question) => question.projectId !== projectId)
    ) {
        throw new Error("数据评测批量任务暂只支持同一项目下的题目。");
    }

    const items = uniqueItems.map((item, index) => {
        const question = questionMap.get(item.questionId);

        if (!question) {
            throw new Error("部分题目不存在或已被删除，请刷新后重试。");
        }

        const taskPayload: DataEvaluationModelRunTaskPayload = {
            mode: "DATA_EVALUATION_MODEL_RUN",
            strategyId: strategy.id,
            questionId: question.id,
            columnCode: item.columnCode,
            evaluationModelFilter: item.evaluationModelFilter,
        };
        const applicable = strategyAppliesToQuestion(strategy, question);

        return {
            questionId: question.id,
            sequence: index + 1,
            status: applicable
                ? BatchRunItemStatus.PENDING
                : BatchRunItemStatus.SKIPPED,
            errorMessage: applicable
                ? null
                : "当前策略不适用于这道题目，已跳过。",
            taskPayload,
        };
    });
    const pendingCount = items.filter(
        (item) => item.status === BatchRunItemStatus.PENDING,
    ).length;
    const skippedCount = items.filter(
        (item) => item.status === BatchRunItemStatus.SKIPPED,
    ).length;

    const batchRun = await prisma.$transaction(async (tx) => {
        const created = await tx.aiReviewStrategyBatchRun.create({
            data: {
                strategyId: strategy.id,
                projectId,
                createdById: input.createdById,
                status: pendingCount
                    ? BatchRunStatus.PENDING
                    : BatchRunStatus.SUCCESS,
                concurrency: 1,
                totalCount: items.length,
                pendingCount,
                runningCount: 0,
                successCount: 0,
                failedCount: 0,
                skippedCount,
                requestPayload: serializeJson({
                    mode: "DATA_EVALUATION_MODEL_RUN_BATCH",
                    strategy: {
                        id: strategy.id,
                        code: strategy.code,
                        name: strategy.name,
                    },
                    itemCount: items.length,
                }),
                finishedAt: pendingCount ? null : new Date(),
            },
        });

        await tx.aiReviewStrategyBatchRunItem.createMany({
            data: items.map((item) => ({
                batchRunId: created.id,
                questionId: item.questionId,
                sequence: item.sequence,
                status: item.status,
                errorMessage: item.errorMessage,
                resultPayload: serializeJson(item.taskPayload),
                finishedAt:
                    item.status === BatchRunItemStatus.SKIPPED
                        ? new Date()
                        : null,
            })),
        });

        return created;
    });

    return {
        id: batchRun.id,
        status: batchRun.status,
        totalCount: batchRun.totalCount,
        pendingCount: batchRun.pendingCount,
        skippedCount: batchRun.skippedCount,
    };
}

export async function createAiReviewStrategyRetryRunItemBatchRun(input: {
    runId: string;
    stepId: string;
    itemIndex: number;
    createdById: string;
}) {
    if (!process.env.DATABASE_URL) {
        throw new Error("当前未配置 DATABASE_URL，无法创建重试任务。");
    }

    const run = await prisma.aiReviewStrategyRun.findUnique({
        where: {
            id: input.runId,
        },
        select: {
            id: true,
            strategyId: true,
            questionId: true,
            question: {
                select: {
                    projectId: true,
                },
            },
            strategy: {
                select: {
                    id: true,
                    code: true,
                    name: true,
                },
            },
        },
    });

    if (!run) {
        throw new Error("运行记录不存在。");
    }

    const activeItems = await prisma.aiReviewStrategyBatchRunItem.findMany({
        where: {
            questionId: run.questionId,
            status: {
                in: [BatchRunItemStatus.PENDING, BatchRunItemStatus.RUNNING],
            },
            batchRun: {
                projectId: run.question.projectId,
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
            id: true,
            resultPayload: true,
        },
    });

    const duplicated = activeItems.some((item) => {
        const payload = parseRetryRunItemTaskPayload(item.resultPayload);

        return (
            payload?.runId === input.runId &&
            payload.stepId === input.stepId &&
            payload.itemIndex === input.itemIndex
        );
    });

    if (duplicated) {
        throw new Error("该执行项已在待重试或执行中，请勿重复提交。");
    }

    const taskPayload: RetryRunItemTaskPayload = {
        mode: "RETRY_RUN_ITEM",
        runId: input.runId,
        stepId: input.stepId,
        itemIndex: input.itemIndex,
        questionId: run.questionId,
    };

    const batchRun = await prisma.$transaction(async (tx) => {
        const created = await tx.aiReviewStrategyBatchRun.create({
            data: {
                strategyId: run.strategyId,
                projectId: run.question.projectId,
                createdById: input.createdById,
                status: BatchRunStatus.PENDING,
                concurrency: 1,
                totalCount: 1,
                pendingCount: 1,
                runningCount: 0,
                successCount: 0,
                failedCount: 0,
                skippedCount: 0,
                requestPayload: serializeJson(taskPayload),
            },
        });

        await tx.aiReviewStrategyBatchRunItem.create({
            data: {
                batchRunId: created.id,
                questionId: run.questionId,
                sequence: 1,
                status: BatchRunItemStatus.PENDING,
                runId: input.runId,
                resultPayload: serializeJson(taskPayload),
            },
        });

        return created;
    });

    return {
        id: batchRun.id,
        status: batchRun.status,
    };
}

export async function getAiReviewStrategyRetryStatesForQuestion(
    questionId: string,
    viewer?: {
        userId: string;
        platformRole: PlatformRoleValue;
    },
    limit = 30,
) {
    if (!process.env.DATABASE_URL) {
        return [] as AiReviewStrategyRetryStateView[];
    }

    const items = await prisma.aiReviewStrategyBatchRunItem.findMany({
        where: {
            questionId,
            batchRun: {
                status: {
                    in: [
                        BatchRunStatus.PENDING,
                        BatchRunStatus.RUNNING,
                        BatchRunStatus.CANCEL_REQUESTED,
                        BatchRunStatus.SUCCESS,
                        BatchRunStatus.FAILED,
                    ],
                },
            },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: limit,
        select: {
            batchRunId: true,
            status: true,
            errorMessage: true,
            updatedAt: true,
            resultPayload: true,
        },
    });

    const deduped = new Map<string, AiReviewStrategyRetryStateView>();

    for (const item of items) {
        const payload = parseRetryRunItemTaskPayload(item.resultPayload);

        if (!payload) {
            continue;
        }

        const key = buildRetryStateKey(
            payload.runId,
            payload.stepId,
            payload.itemIndex,
        );

        if (deduped.has(key)) {
            continue;
        }

        deduped.set(key, {
            key,
            runId: payload.runId,
            stepId: payload.stepId,
            itemIndex: payload.itemIndex,
            batchRunId: item.batchRunId,
            status: item.status,
            errorMessage: item.errorMessage,
            updatedAt: item.updatedAt.toISOString(),
        });
    }

    return [...deduped.values()];
}

export async function cancelAiReviewStrategyBatchRun(batchRunId: string) {
    const batchRun = await prisma.aiReviewStrategyBatchRun.findUnique({
        where: {
            id: batchRunId,
        },
        select: {
            id: true,
            status: true,
        },
    });

    if (!batchRun) {
        throw new Error("批量任务不存在。");
    }

    if (TERMINAL_BATCH_STATUSES.has(batchRun.status)) {
        return;
    }

    await prisma.aiReviewStrategyBatchRun.update({
        where: {
            id: batchRunId,
        },
        data: {
            status: BatchRunStatus.CANCEL_REQUESTED,
        },
    });
}

export async function deleteAiReviewStrategyBatchRun(batchRunId: string) {
    const batchRun = await prisma.aiReviewStrategyBatchRun.findUnique({
        where: {
            id: batchRunId,
        },
        select: {
            id: true,
            status: true,
            runningCount: true,
        },
    });

    if (!batchRun) {
        throw new Error("批量任务不存在。");
    }

    if (
        (batchRun.status === BatchRunStatus.RUNNING ||
            batchRun.status === BatchRunStatus.CANCEL_REQUESTED) &&
        batchRun.runningCount > 0
    ) {
        throw new Error("任务仍在执行中，请先取消并等待当前题目执行完成。");
    }

    await prisma.aiReviewStrategyBatchRun.delete({
        where: {
            id: batchRunId,
        },
    });
}

export async function restartStaleAiReviewStrategyBatchRun(batchRunId: string) {
    const batchRun = await prisma.aiReviewStrategyBatchRun.findUnique({
        where: {
            id: batchRunId,
        },
        select: {
            id: true,
            status: true,
            workerId: true,
            lastHeartbeatAt: true,
        },
    });

    if (!batchRun) {
        throw new Error("批量任务不存在。");
    }

    if (TERMINAL_BATCH_STATUSES.has(batchRun.status)) {
        throw new Error("已结束的批量任务不能重启。");
    }

    const staleReason = getStaleBatchRunReason(batchRun);

    if (!staleReason) {
        throw new Error("该批量任务心跳仍在更新，不能判定为卡死任务。");
    }

    await prisma.$transaction(async (tx) => {
        await tx.aiReviewStrategyBatchRunItem.updateMany({
            where: {
                batchRunId,
                status: BatchRunItemStatus.RUNNING,
            },
            data: {
                status: BatchRunItemStatus.PENDING,
                errorMessage: null,
                startedAt: null,
                finishedAt: null,
            },
        });

        await tx.aiReviewStrategyBatchRun.update({
            where: {
                id: batchRunId,
            },
            data: {
                status: BatchRunStatus.PENDING,
                workerId: null,
                lastHeartbeatAt: null,
                startedAt: null,
                finishedAt: null,
                errorMessage: null,
            },
        });
    });

    await syncBatchRunState(batchRunId);
}

export async function recoverAiReviewStrategyBatchRuns(workerId: string) {
    const staleBefore = new Date(Date.now() - STALE_BATCH_RUN_HEARTBEAT_MS);
    const staleRuns = await prisma.aiReviewStrategyBatchRun.findMany({
        where: {
            OR: [
                {
                    status: BatchRunStatus.RUNNING,
                    OR: [
                        {
                            lastHeartbeatAt: null,
                        },
                        {
                            lastHeartbeatAt: {
                                lt: staleBefore,
                            },
                        },
                    ],
                },
                {
                    status: BatchRunStatus.CANCEL_REQUESTED,
                    OR: [
                        {
                            lastHeartbeatAt: null,
                        },
                        {
                            lastHeartbeatAt: {
                                lt: staleBefore,
                            },
                        },
                    ],
                },
            ],
        },
        select: {
            id: true,
            status: true,
            workerId: true,
        },
    });

    for (const staleRun of staleRuns) {
        if (staleRun.status === BatchRunStatus.CANCEL_REQUESTED) {
            await prisma.aiReviewStrategyBatchRunItem.updateMany({
                where: {
                    batchRunId: staleRun.id,
                    status: {
                        in: [
                            BatchRunItemStatus.PENDING,
                            BatchRunItemStatus.RUNNING,
                        ],
                    },
                },
                data: {
                    status: BatchRunItemStatus.CANCELLED,
                    errorMessage: "批量任务已取消。",
                    finishedAt: new Date(),
                },
            });

            await syncBatchRunState(staleRun.id);
            continue;
        }

        await prisma.aiReviewStrategyBatchRunItem.updateMany({
            where: {
                batchRunId: staleRun.id,
                status: BatchRunItemStatus.RUNNING,
            },
            data: {
                status: BatchRunItemStatus.PENDING,
                errorMessage: null,
                startedAt: null,
                finishedAt: null,
            },
        });

        await prisma.aiReviewStrategyBatchRun.update({
            where: {
                id: staleRun.id,
            },
            data: {
                status: BatchRunStatus.PENDING,
                runningCount: 0,
                workerId: null,
                lastHeartbeatAt: null,
            },
        });

        await syncBatchRunState(staleRun.id);
    }

    await prisma.aiReviewStrategyBatchRun.updateMany({
        where: {
            workerId,
        },
        data: {
            workerId: null,
            lastHeartbeatAt: null,
        },
    });
}

async function claimNextBatchRun(workerId: string) {
    const candidates = await prisma.aiReviewStrategyBatchRun.findMany({
        where: {
            workerId: null,
            status: {
                in: [
                    BatchRunStatus.PENDING,
                    BatchRunStatus.RUNNING,
                    BatchRunStatus.CANCEL_REQUESTED,
                ],
            },
        },
        orderBy: [{ createdAt: "asc" }],
        take: 20,
        select: {
            id: true,
            status: true,
        },
    });

    for (const candidate of candidates) {
        const claimedAt = new Date();
        const result = await prisma.aiReviewStrategyBatchRun.updateMany({
            where: {
                id: candidate.id,
                workerId: null,
                status: candidate.status,
            },
            data: {
                status:
                    candidate.status === BatchRunStatus.PENDING
                        ? BatchRunStatus.RUNNING
                        : candidate.status,
                workerId,
                startedAt:
                    candidate.status === BatchRunStatus.PENDING
                        ? claimedAt
                        : undefined,
                lastHeartbeatAt: claimedAt,
            },
        });

        if (result.count !== 1) {
            continue;
        }

        return prisma.aiReviewStrategyBatchRun.findUnique({
            where: {
                id: candidate.id,
            },
            select: {
                id: true,
                strategyId: true,
                createdById: true,
                concurrency: true,
                status: true,
                requestPayload: true,
            },
        });
    }

    return null;
}

async function claimBatchRunItems(batchRunId: string, limit: number) {
    const pendingItems = await prisma.aiReviewStrategyBatchRunItem.findMany({
        where: {
            batchRunId,
            status: BatchRunItemStatus.PENDING,
        },
        orderBy: [{ sequence: "asc" }],
        take: limit,
        include: {
            question: {
                select: {
                    id: true,
                    title: true,
                },
            },
        },
    });

    if (!pendingItems.length) {
        return [];
    }

    const claimedAt = new Date();

    await prisma.aiReviewStrategyBatchRunItem.updateMany({
        where: {
            id: {
                in: pendingItems.map((item) => item.id),
            },
            status: BatchRunItemStatus.PENDING,
        },
        data: {
            status: BatchRunItemStatus.RUNNING,
            startedAt: claimedAt,
            attemptCount: {
                increment: 1,
            },
        },
    });

    return pendingItems;
}

async function executeBatchRunItem(
    batchRun: {
        id: string;
        strategyId: string;
        createdById: string;
        requestPayload: Prisma.JsonValue;
    },
    item: {
        id: string;
        questionId: string;
        resultPayload: Prisma.JsonValue | null;
    },
) {
    const startedAt = Date.now();
    const dataEvaluationPayload = parseDataEvaluationModelRunPayloadFromItem(
        item,
        batchRun,
    );
    const retryModeRequested =
        hasRetryRunItemMode(item.resultPayload) ||
        hasRetryRunItemMode(batchRun.requestPayload);
    const retryPayload =
        parseRetryRunItemTaskPayload(item.resultPayload) ??
        parseRetryRunItemTaskPayload(batchRun.requestPayload);

    try {
        if (retryModeRequested && !retryPayload) {
            throw new Error(
                "重试任务参数已损坏，已阻止回退为整题重跑。请刷新页面后重新提交重试。",
            );
        }

        const execution = dataEvaluationPayload
            ? await executeAiReviewStrategy(
                  batchRun.strategyId,
                  item.questionId,
                  batchRun.createdById,
                  {
                      disableReviewPersistence: true,
                      evaluationModelFilter:
                          dataEvaluationPayload.evaluationModelFilter,
                  },
              )
            : retryPayload
            ? await retryAiReviewStrategyRunItem(
                  retryPayload.runId,
                  retryPayload.stepId,
                  retryPayload.itemIndex,
              )
            : await executeAiReviewStrategy(
                  batchRun.strategyId,
                  item.questionId,
                  batchRun.createdById,
              );
        const executionRunId = "runId" in execution ? execution.runId : execution.id;
        const executionParsedResult = execution.parsedResult;

        if (!executionParsedResult) {
            throw new Error("重试后的运行结果为空。");
        }

        await prisma.aiReviewStrategyBatchRunItem.update({
            where: {
                id: item.id,
            },
            data: {
                status: BatchRunItemStatus.SUCCESS,
                runId: executionRunId,
                errorMessage: null,
                resultPayload: serializeJson(
                    dataEvaluationPayload
                        ? {
                              ...dataEvaluationPayload,
                              result: {
                                  runId: executionRunId,
                                  status: executionParsedResult.status,
                              },
                          }
                        : retryPayload
                        ? {
                              ...retryPayload,
                              result: {
                                  runId: executionRunId,
                                  status: executionParsedResult.status,
                                  finalRecommendation:
                                      executionParsedResult.finalRecommendation,
                                  reviewPersistence:
                                      executionParsedResult.reviewPersistence,
                              },
                          }
                        : {
                              runId: executionRunId,
                              status: executionParsedResult.status,
                              finalRecommendation:
                                  executionParsedResult.finalRecommendation,
                              reviewPersistence:
                                  executionParsedResult.reviewPersistence,
                          },
                ),
                finishedAt: new Date(),
            },
        });
        logInfo("batch.item.success", {
            batchRunId: batchRun.id,
            itemId: item.id,
            questionId: item.questionId,
            runId: executionRunId,
            mode: dataEvaluationPayload
                ? "DATA_EVALUATION_MODEL_RUN"
                : retryPayload
                  ? "RETRY_RUN_ITEM"
                  : "EXECUTE_STRATEGY",
            durationMs: Date.now() - startedAt,
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "批量任务执行失败。";
        await prisma.aiReviewStrategyBatchRunItem.update({
            where: {
                id: item.id,
            },
            data: {
                status: BatchRunItemStatus.FAILED,
                errorMessage: message,
                resultPayload: dataEvaluationPayload
                    ? serializeJson({
                          ...dataEvaluationPayload,
                          result: {
                              errorMessage: message,
                          },
                      })
                    : retryPayload
                    ? serializeJson({
                          ...retryPayload,
                          result: {
                              errorMessage: message,
                          },
                      })
                    : item.resultPayload ?? undefined,
                finishedAt: new Date(),
            },
        });
        logError("batch.item.failed", {
            batchRunId: batchRun.id,
            itemId: item.id,
            questionId: item.questionId,
            mode: dataEvaluationPayload
                ? "DATA_EVALUATION_MODEL_RUN"
                : retryPayload
                  ? "RETRY_RUN_ITEM"
                  : "EXECUTE_STRATEGY",
            durationMs: Date.now() - startedAt,
            error: message,
        });
    } finally {
        await syncBatchRunState(batchRun.id);
    }
}

async function withBatchRunHeartbeat<T>(
    batchRunId: string,
    workerId: string,
    work: () => Promise<T>,
) {
    const interval = setInterval(() => {
        void prisma.aiReviewStrategyBatchRun
            .updateMany({
                where: {
                    id: batchRunId,
                    workerId,
                },
                data: {
                    lastHeartbeatAt: new Date(),
                },
            })
            .catch((error) => {
                logWarn("batch.run.heartbeat_tick_failed", {
                    batchRunId,
                    workerId,
                    error:
                        error instanceof Error
                            ? error.message
                            : "批量任务心跳更新失败。",
                });
            });
    }, BATCH_RUN_HEARTBEAT_INTERVAL_MS);

    interval.unref?.();

    try {
        return await work();
    } finally {
        clearInterval(interval);
    }
}

async function processBatchRun(batchRunId: string, workerId: string) {
    while (true) {
        const batchRun = await prisma.aiReviewStrategyBatchRun.findUnique({
            where: {
                id: batchRunId,
            },
            select: {
                id: true,
                strategyId: true,
                createdById: true,
                concurrency: true,
                status: true,
                pendingCount: true,
                runningCount: true,
                workerId: true,
                requestPayload: true,
            },
        });

        if (!batchRun) {
            logInfo("batch.run.missing", {
                batchRunId,
                workerId,
            });
            return;
        }

        if (batchRun.workerId !== workerId) {
            logWarn("batch.run.worker_mismatch", {
                batchRunId: batchRun.id,
                expectedWorkerId: workerId,
                actualWorkerId: batchRun.workerId,
            });
            return;
        }

        const heartbeat = await prisma.aiReviewStrategyBatchRun.updateMany({
            where: {
                id: batchRun.id,
                workerId,
            },
            data: {
                lastHeartbeatAt: new Date(),
            },
        });

        if (heartbeat.count !== 1) {
            logWarn("batch.run.heartbeat_lost", {
                batchRunId: batchRun.id,
                workerId,
            });
            return;
        }

        if (batchRun.status === BatchRunStatus.CANCEL_REQUESTED) {
            logWarn("batch.run.cancel_requested", {
                batchRunId: batchRun.id,
                workerId,
                runningCount: batchRun.runningCount,
                pendingCount: batchRun.pendingCount,
            });
            await prisma.aiReviewStrategyBatchRunItem.updateMany({
                where: {
                    batchRunId: batchRun.id,
                    status: BatchRunItemStatus.PENDING,
                },
                data: {
                    status: BatchRunItemStatus.CANCELLED,
                    errorMessage: "批量任务已取消。",
                    finishedAt: new Date(),
                },
            });

            const nextState = await syncBatchRunState(batchRun.id);

            if (!nextState?.runningCount) {
                logInfo("batch.run.cancelled", {
                    batchRunId: batchRun.id,
                    workerId,
                });
                return;
            }
        }

        if (!batchRun.pendingCount && !batchRun.runningCount) {
            await syncBatchRunState(batchRun.id);
            logInfo("batch.run.finished", {
                batchRunId: batchRun.id,
                workerId,
            });
            return;
        }

        const limit = Math.min(Math.max(batchRun.concurrency, 1), 2);
        const items = await claimBatchRunItems(batchRun.id, limit);

        if (!items.length) {
            await syncBatchRunState(batchRun.id);
            logInfo("batch.run.no_items_to_claim", {
                batchRunId: batchRun.id,
                workerId,
            });
            return;
        }

        logInfo("batch.run.items_claimed", {
            batchRunId: batchRun.id,
            workerId,
            claimCount: items.length,
            limit,
            questionIds: items.map((item) => item.questionId),
        });

        await syncBatchRunState(batchRun.id);
        await withBatchRunHeartbeat(batchRun.id, workerId, () =>
            Promise.allSettled(
                items.map((item) =>
                    executeBatchRunItem(batchRun, {
                        id: item.id,
                        questionId: item.questionId,
                        resultPayload: item.resultPayload,
                    }),
                ),
            ),
        );
    }
}

export async function runAiReviewStrategyBatchWorkerOnce(workerId: string) {
    if (!process.env.DATABASE_URL) {
        return false;
    }

    const batchRun = await claimNextBatchRun(workerId);

    if (!batchRun) {
        return false;
    }

    logInfo("batch.run.claimed", {
        batchRunId: batchRun.id,
        workerId,
        strategyId: batchRun.strategyId,
        status: batchRun.status,
        concurrency: batchRun.concurrency,
    });

    await processBatchRun(batchRun.id, workerId);
    return true;
}
