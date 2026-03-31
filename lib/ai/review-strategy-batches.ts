import {
    BatchRunItemStatus,
    BatchRunStatus,
    type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { executeAiReviewStrategy } from "@/lib/ai/review-strategies";
import { aiReviewStrategyDefinitionSchema } from "@/lib/ai/review-strategy-schema";
import { logError, logInfo, logWarn } from "@/lib/logging/app-logger";

const TERMINAL_BATCH_STATUSES = new Set<BatchRunStatus>([
    BatchRunStatus.SUCCESS,
    BatchRunStatus.FAILED,
    BatchRunStatus.CANCELLED,
]);

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

export async function getAiReviewStrategyBatchRunsForProject(
    projectId: string,
    limit = 10,
) {
    if (!process.env.DATABASE_URL) {
        return [];
    }

    const runs = await prisma.aiReviewStrategyBatchRun.findMany({
        where: {
            projectId,
        },
        orderBy: [{ createdAt: "desc" }],
        take: limit,
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
                        },
                    },
                },
            },
        },
    });

    return runs.map(mapBatchRunView);
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

export async function recoverAiReviewStrategyBatchRuns(workerId: string) {
    await prisma.aiReviewStrategyBatchRunItem.updateMany({
        where: {
            status: BatchRunItemStatus.RUNNING,
        },
        data: {
            status: BatchRunItemStatus.PENDING,
            errorMessage: null,
            startedAt: null,
        },
    });

    await prisma.aiReviewStrategyBatchRun.updateMany({
        where: {
            status: BatchRunStatus.RUNNING,
        },
        data: {
            status: BatchRunStatus.PENDING,
            runningCount: 0,
            workerId: null,
            lastHeartbeatAt: null,
        },
    });

    await prisma.aiReviewStrategyBatchRun.updateMany({
        where: {
            workerId,
        },
        data: {
            workerId: null,
        },
    });
}

async function claimNextBatchRun(workerId: string) {
    const batchRun = await prisma.aiReviewStrategyBatchRun.findFirst({
        where: {
            status: {
                in: [
                    BatchRunStatus.PENDING,
                    BatchRunStatus.RUNNING,
                    BatchRunStatus.CANCEL_REQUESTED,
                ],
            },
        },
        orderBy: [{ createdAt: "asc" }],
        select: {
            id: true,
            status: true,
        },
    });

    if (!batchRun) {
        return null;
    }

    await prisma.aiReviewStrategyBatchRun.update({
        where: {
            id: batchRun.id,
        },
        data: {
            status:
                batchRun.status === BatchRunStatus.PENDING
                    ? BatchRunStatus.RUNNING
                    : batchRun.status,
            workerId,
            startedAt:
                batchRun.status === BatchRunStatus.PENDING
                    ? new Date()
                    : undefined,
            lastHeartbeatAt: new Date(),
        },
    });

    return prisma.aiReviewStrategyBatchRun.findUnique({
        where: {
            id: batchRun.id,
        },
        select: {
            id: true,
            strategyId: true,
            createdById: true,
            concurrency: true,
            status: true,
        },
    });
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
    },
    item: {
        id: string;
        questionId: string;
    },
) {
    const startedAt = Date.now();
    try {
        const result = await executeAiReviewStrategy(
            batchRun.strategyId,
            item.questionId,
            batchRun.createdById,
        );

        await prisma.aiReviewStrategyBatchRunItem.update({
            where: {
                id: item.id,
            },
            data: {
                status: BatchRunItemStatus.SUCCESS,
                runId: result.runId,
                errorMessage: null,
                resultPayload: serializeJson({
                    runId: result.runId,
                    status: result.parsedResult.status,
                    finalRecommendation:
                        result.parsedResult.finalRecommendation,
                    reviewPersistence: result.parsedResult.reviewPersistence,
                }),
                finishedAt: new Date(),
            },
        });
        logInfo("batch.item.success", {
            batchRunId: batchRun.id,
            itemId: item.id,
            questionId: item.questionId,
            runId: result.runId,
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
                finishedAt: new Date(),
            },
        });
        logError("batch.item.failed", {
            batchRunId: batchRun.id,
            itemId: item.id,
            questionId: item.questionId,
            durationMs: Date.now() - startedAt,
            error: message,
        });
    } finally {
        await syncBatchRunState(batchRun.id);
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
            },
        });

        if (!batchRun) {
            logInfo("batch.run.missing", {
                batchRunId,
                workerId,
            });
            return;
        }

        await prisma.aiReviewStrategyBatchRun.update({
            where: {
                id: batchRun.id,
            },
            data: {
                workerId,
                lastHeartbeatAt: new Date(),
            },
        });

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
        await Promise.allSettled(
            items.map((item) =>
                executeBatchRunItem(batchRun, {
                    id: item.id,
                    questionId: item.questionId,
                }),
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
