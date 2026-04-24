"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { canAccessAdminScope } from "@/lib/auth/admin-scope";
import {
    canUserAccessQuestionByMetadata,
    canUserReviewProject,
} from "@/lib/reviews/permissions";
import { isAdminRole } from "@/lib/auth/roles";
import { logError, logInfo, logWarn } from "@/lib/logging/app-logger";
import {
    aiReviewStrategyPersistedSchema,
    type AiReviewStrategyPersistedInput,
} from "@/lib/ai/review-strategy-schema";
import {
    executeAiReviewStrategy,
    type AiReviewStrategyRunView,
} from "@/lib/ai/review-strategies";
import {
    cancelAiReviewStrategyBatchRun,
    createAiReviewStrategyBatchRun,
    createAiReviewStrategyRetryRunItemBatchRun,
    deleteAiReviewStrategyBatchRun,
} from "@/lib/ai/review-strategy-batches";

export type AiReviewStrategyActionState = {
    error?: string;
    success?: string;
    run?: AiReviewStrategyRunView;
    batchRunId?: string;
};

function formatExternalRecordIdsForMessage(
    externalRecordIds: string[],
    maxPreview = 20,
) {
    if (!externalRecordIds.length) {
        return "无";
    }

    const preview = externalRecordIds.slice(0, maxPreview).join("、");
    const remaining = externalRecordIds.length - maxPreview;

    return remaining > 0 ? `${preview} 等 ${externalRecordIds.length} 条` : preview;
}

const saveStrategySchema = z.object({
    strategyId: z
        .string()
        .trim()
        .optional()
        .transform((value) => value || undefined),
    scopeAdminId: z
        .string()
        .trim()
        .optional()
        .transform((value) => value || undefined),
    payload: aiReviewStrategyPersistedSchema,
});

const deleteStrategySchema = z.object({
    strategyId: z.string().trim().min(1, "缺少策略 ID"),
});

const runStrategySchema = z.object({
    strategyId: z.string().trim().min(1, "请选择要执行的策略"),
    questionId: z.string().trim().min(1, "缺少题目 ID"),
    enableBuiltInTools: z.boolean().optional(),
});

const retryRunItemSchema = z.object({
    runId: z.string().trim().min(1, "缺少运行记录 ID"),
    stepId: z.string().trim().min(1, "缺少步骤 ID"),
    itemIndex: z.number().int("重试项索引无效").min(1, "重试项索引无效"),
});

const createBatchRunSchema = z.object({
    strategyId: z.string().trim().min(1, "请选择要执行的策略"),
    projectId: z.string().trim().min(1, "缺少项目 ID"),
    questionIds: z
        .array(z.string().trim().min(1, "缺少题目 ID"))
        .min(1, "至少选择 1 道题目"),
    concurrency: z.number().int("并发数无效").min(1).max(2),
});

const cancelBatchRunSchema = z.object({
    batchRunId: z.string().trim().min(1, "缺少批量任务 ID"),
});

const deleteBatchRunSchema = z.object({
    batchRunId: z.string().trim().min(1, "缺少批量任务 ID"),
});

async function requireStrategyAdminAccess() {
    const session = await auth();

    if (!isAdminRole(session?.user.platformRole)) {
        return {
            error: "只有管理员可以维护 AI 审核策略。",
        } satisfies AiReviewStrategyActionState;
    }

    if (!process.env.DATABASE_URL) {
        return {
            error: "当前未配置 DATABASE_URL，无法保存审核策略。",
        } satisfies AiReviewStrategyActionState;
    }

    return null;
}

function revalidateStrategyPaths(questionId?: string) {
    revalidatePath("/admin/ai-strategies");
    revalidatePath("/dashboard/ai-strategies");

    if (questionId) {
        revalidatePath(`/admin/review-tasks/${questionId}`);
        revalidatePath(`/workspace/reviews/${questionId}`);
    }
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

async function validateStrategyPayload(input: AiReviewStrategyPersistedInput) {
    const projectIds = [...new Set(input.projectIds)];
    const datasourceIds = [...new Set(input.datasourceIds)];
    const systemFieldSet = new Set([
        "title",
        "content",
        "answer",
        "analysis",
        "questionType",
        "difficulty",
        "rawRecord",
    ]);
    let datasourceFieldSet = new Set<string>();

    if (projectIds.length) {
        const projects = await prisma.project.findMany({
            where: {
                id: {
                    in: projectIds,
                },
            },
            select: {
                id: true,
            },
        });

        if (projects.length !== projectIds.length) {
            return "部分项目不存在，请刷新后重试。";
        }
    }

    if (datasourceIds.length) {
        const datasources = await prisma.projectDataSource.findMany({
            where: {
                id: {
                    in: datasourceIds,
                },
            },
            select: {
                id: true,
                projectId: true,
            },
        });

        if (datasources.length !== datasourceIds.length) {
            return "部分数据源不存在，请刷新后重试。";
        }

        if (
            projectIds.length &&
            datasources.some(
                (datasource) => !projectIds.includes(datasource.projectId),
            )
        ) {
            return "所选数据源与适用项目不匹配，请调整后再保存。";
        }

        const datasourceDetails = await prisma.projectDataSource.findMany({
            where: {
                id: {
                    in: datasourceIds,
                },
            },
            select: {
                syncConfig: true,
            },
        });

        datasourceFieldSet = new Set(
            datasourceDetails.flatMap((datasource) =>
                extractRawFieldOrder(datasource.syncConfig),
            ),
        );
    }

    const modelCodes = [
        ...new Set(
            input.definition.steps
                .filter((step) => step.kind === "AI_TOOL")
                .map((step) => step.modelCode),
        ),
    ];

    if (modelCodes.length) {
        const models = await prisma.aiModel.findMany({
            where: {
                code: {
                    in: modelCodes,
                },
            },
            select: {
                code: true,
            },
        });

        if (models.length !== modelCodes.length) {
            return "部分步骤引用的模型不存在，请先到 AI 设置页维护模型。";
        }
    }

    const aiToolSteps = input.definition.steps.filter(
        (
            step,
        ): step is Extract<
            (typeof input.definition.steps)[number],
            { kind: "AI_TOOL" }
        > => step.kind === "AI_TOOL",
    );

    for (const step of aiToolSteps) {
        const rawDatasourceFields = step.fieldKeys.filter(
            (fieldKey) => !systemFieldSet.has(fieldKey),
        );

        if (rawDatasourceFields.length && !datasourceIds.length) {
            return "请先选择适用数据源，再配置 AI 步骤要提交的原始字段。";
        }

        if (
            rawDatasourceFields.some(
                (fieldKey) => !datasourceFieldSet.has(fieldKey),
            )
        ) {
            return `步骤 ${step.name} 选择了不属于当前数据源的原始字段，请重新选择。`;
        }
    }

    return null;
}

export async function saveAiReviewStrategyAction(
    input: z.input<typeof saveStrategySchema>,
): Promise<AiReviewStrategyActionState> {
    const accessError = await requireStrategyAdminAccess();

    if (accessError) {
        return accessError;
    }

    const parsed = saveStrategySchema.safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "审核策略参数不完整。",
        };
    }

    const validationError = await validateStrategyPayload(parsed.data.payload);

    if (validationError) {
        return {
            error: validationError,
        };
    }

    const session = await auth();
    const scopeAdminId =
        session!.user.platformRole === "SUPER_ADMIN"
            ? parsed.data.scopeAdminId
            : session!.user.id;

    if (!scopeAdminId) {
        return {
            error: "请选择策略所属管理员。",
        };
    }

    const scopeAdmin = await prisma.user.findFirst({
        where: {
            id: scopeAdminId,
            platformRole: {
                in: ["SUPER_ADMIN", "PLATFORM_ADMIN"],
            },
        },
        select: {
            id: true,
        },
    });

    if (!scopeAdmin) {
        return {
            error: "策略所属管理员不存在，请刷新后重试。",
        };
    }

    const duplicate = await prisma.aiReviewStrategy.findFirst({
        where: parsed.data.strategyId
            ? {
                  scopeAdminId,
                  code: parsed.data.payload.code,
                  NOT: {
                      id: parsed.data.strategyId,
                  },
              }
            : {
                  scopeAdminId,
                  code: parsed.data.payload.code,
              },
        select: {
            id: true,
        },
    });

    if (duplicate) {
        return {
            error: "策略编码已存在，请更换后再保存。",
        };
    }

    const data = {
        code: parsed.data.payload.code,
        name: parsed.data.payload.name,
        description: parsed.data.payload.description,
        enabled: parsed.data.payload.enabled,
        projectIds: parsed.data.payload.projectIds,
        datasourceIds: parsed.data.payload.datasourceIds,
        scopeAdminId,
        definition: parsed.data.payload.definition,
    };

    if (parsed.data.strategyId) {
        const current = await prisma.aiReviewStrategy.findUnique({
            where: {
                id: parsed.data.strategyId,
            },
            select: {
                id: true,
                scopeAdminId: true,
            },
        });

        if (!current) {
            return {
                error: "要编辑的审核策略不存在。",
            };
        }

        if (
            session!.user.platformRole !== "SUPER_ADMIN" &&
            current.scopeAdminId !== session!.user.id
        ) {
            return {
                error: "你只能编辑自己名下的审核策略。",
            };
        }

        await prisma.aiReviewStrategy.update({
            where: {
                id: current.id,
            },
            data,
        });
    } else {
        await prisma.aiReviewStrategy.create({
            data: {
                ...data,
                createdById: session!.user.id,
            },
        });
    }

    revalidateStrategyPaths();

    return {
        success: `审核策略 ${parsed.data.payload.name} 已保存。`,
    };
}

export async function deleteAiReviewStrategyAction(
    input: z.input<typeof deleteStrategySchema>,
): Promise<AiReviewStrategyActionState> {
    const accessError = await requireStrategyAdminAccess();
    const session = await auth();

    if (accessError) {
        return accessError;
    }

    const parsed = deleteStrategySchema.safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "删除参数不完整。",
        };
    }

    const strategy = await prisma.aiReviewStrategy.findUnique({
        where: {
            id: parsed.data.strategyId,
        },
        select: {
            id: true,
            name: true,
            scopeAdminId: true,
        },
    });

    if (!strategy) {
        return {
            error: "审核策略不存在。",
        };
    }

    if (
        !(await canAccessAdminScope(
            session!.user.id,
            session!.user.platformRole,
            strategy.scopeAdminId,
        ))
    ) {
        return {
            error: "你只能删除自己管理员域下的审核策略。",
        };
    }

    await prisma.aiReviewStrategy.delete({
        where: {
            id: strategy.id,
        },
    });

    revalidateStrategyPaths();

    return {
        success: `审核策略 ${strategy.name} 已删除。`,
    };
}

export async function runAiReviewStrategyAction(
    input: z.input<typeof runStrategySchema>,
): Promise<AiReviewStrategyActionState> {
    const session = await auth();

    if (!session?.user) {
        return {
            error: "请先登录后再执行 AI 审核策略。",
        };
    }

    if (!process.env.DATABASE_URL) {
        return {
            error: "当前未配置 DATABASE_URL，无法执行 AI 审核策略。",
        };
    }

    const parsed = runStrategySchema.safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "策略执行参数不完整。",
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
            metadata: true,
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
            error: "你当前没有该项目的审核权限。",
        };
    }

    const canAccessQuestion = await canUserAccessQuestionByMetadata(
        session.user.id,
        session.user.platformRole,
        question.metadata,
    );

    if (!canAccessQuestion) {
        return {
            error: "你当前不能执行该学科的题目。",
        };
    }

    const strategy = await prisma.aiReviewStrategy.findUnique({
        where: {
            id: parsed.data.strategyId,
        },
        select: {
            scopeAdminId: true,
        },
    });

    if (!strategy) {
        return {
            error: "审核策略不存在。",
        };
    }

    if (
        !(await canAccessAdminScope(
            session.user.id,
            session.user.platformRole,
            strategy.scopeAdminId,
        ))
    ) {
        return {
            error: "你不能执行其他管理员域的审核策略。",
        };
    }

    try {
        logInfo("user.request.run_strategy", {
            userId: session.user.id,
            strategyId: parsed.data.strategyId,
            questionId: parsed.data.questionId,
        });
        const execution = await executeAiReviewStrategy(
            parsed.data.strategyId,
            parsed.data.questionId,
            session.user.id,
            {
                enableBuiltInTools: parsed.data.enableBuiltInTools ?? false,
            },
        );

        const reviewMessage =
            execution.parsedResult.reviewPersistence?.status === "SAVED"
                ? "系统已自动保存审核结论。"
                : execution.parsedResult.reviewPersistence?.status === "FAILED"
                  ? `自动保存审核结论失败：${execution.parsedResult.reviewPersistence.message}`
                  : "本次运行未自动保存审核结论。";

        revalidatePath("/admin/reviews");
        revalidatePath("/admin/review-tasks");
        revalidatePath("/workspace/reviews");
        revalidateStrategyPaths(question.id);

        logInfo("user.request.run_strategy.success", {
            userId: session.user.id,
            strategyId: parsed.data.strategyId,
            questionId: parsed.data.questionId,
            runId: execution.runId,
            status: execution.parsedResult.status,
            reviewPersistenceStatus:
                execution.parsedResult.reviewPersistence?.status ?? null,
        });

        return {
            success: `题目 ${question.title} 的 AI 审核策略已执行完成。${reviewMessage}`,
        };
    } catch (error) {
        revalidateStrategyPaths(question.id);
        logError("user.request.run_strategy.failed", {
            userId: session.user.id,
            strategyId: parsed.data.strategyId,
            questionId: parsed.data.questionId,
            error: error instanceof Error ? error.message : "策略执行失败。",
        });
        return {
            error: error instanceof Error ? error.message : "策略执行失败。",
        };
    }
}

export async function retryAiReviewStrategyRunItemAction(
    input: z.input<typeof retryRunItemSchema>,
): Promise<AiReviewStrategyActionState> {
    const session = await auth();

    if (!session?.user) {
        return {
            error: "请先登录后再重试单次执行项。",
        };
    }

    if (!process.env.DATABASE_URL) {
        return {
            error: "当前未配置 DATABASE_URL，无法重试单次执行项。",
        };
    }

    const parsed = retryRunItemSchema.safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "重试参数不完整。",
        };
    }

    const run = await prisma.aiReviewStrategyRun.findUnique({
        where: {
            id: parsed.data.runId,
        },
        select: {
            id: true,
            questionId: true,
            strategy: {
                select: {
                    scopeAdminId: true,
                },
            },
            question: {
                select: {
                    projectId: true,
                    metadata: true,
                },
            },
        },
    });

    if (!run) {
        return {
            error: "运行记录不存在。",
        };
    }

    const canReview = await canUserReviewProject(
        session.user.id,
        session.user.platformRole,
        run.question.projectId,
    );

    if (!canReview) {
        return {
            error: "你当前没有该项目的审核权限。",
        };
    }

    const canAccessQuestion = await canUserAccessQuestionByMetadata(
        session.user.id,
        session.user.platformRole,
        run.question.metadata,
    );

    if (!canAccessQuestion) {
        return {
            error: "你当前不能重试该学科的题目。",
        };
    }

    if (
        !(await canAccessAdminScope(
            session.user.id,
            session.user.platformRole,
            run.strategy.scopeAdminId,
        ))
    ) {
        return {
            error: "你不能重试其他管理员域的审核策略结果。",
        };
    }

    try {
        const batchRun = await createAiReviewStrategyRetryRunItemBatchRun({
            runId: parsed.data.runId,
            stepId: parsed.data.stepId,
            itemIndex: parsed.data.itemIndex,
            createdById: session.user.id,
        });

        revalidateStrategyPaths(run.questionId);

        return {
            success: "单次执行项已提交后台重试，结果会自动刷新。",
            batchRunId: batchRun.id,
        };
    } catch (error) {
        revalidateStrategyPaths(run.questionId);
        return {
            error: error instanceof Error ? error.message : "重试失败。",
        };
    }
}

export async function createAiReviewStrategyBatchRunAction(
    input: z.input<typeof createBatchRunSchema>,
): Promise<AiReviewStrategyActionState> {
    const session = await auth();

    if (!session?.user) {
        return {
            error: "请先登录后再创建批量任务。",
        };
    }

    if (!process.env.DATABASE_URL) {
        return {
            error: "当前未配置 DATABASE_URL，无法创建批量任务。",
        };
    }

    const parsed = createBatchRunSchema.safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "批量任务参数不完整。",
        };
    }

    const uniqueQuestionIds = [...new Set(parsed.data.questionIds)];
    const questions = await prisma.question.findMany({
        where: {
            id: {
                in: uniqueQuestionIds,
            },
        },
        select: {
            id: true,
            projectId: true,
            externalRecordId: true,
            metadata: true,
        },
    });

    if (questions.length !== uniqueQuestionIds.length) {
        return {
            error: "部分题目不存在或已被删除，请刷新后重试。",
        };
    }

    const actualProjectId = questions[0]?.projectId;

    if (
        !actualProjectId ||
        questions.some((question) => question.projectId !== actualProjectId)
    ) {
        return {
            error: "批量任务暂只支持同一项目下的题目。",
        };
    }

    if (actualProjectId !== parsed.data.projectId) {
        return {
            error: "批量任务项目参数不匹配，请刷新后重试。",
        };
    }

    const canReview = await canUserReviewProject(
        session.user.id,
        session.user.platformRole,
        actualProjectId,
    );

    if (!canReview) {
        return {
            error: "你当前没有该项目的审核权限。",
        };
    }

    const invisibleQuestion = (
        await Promise.all(
            questions.map(async (question) =>
                (await canUserAccessQuestionByMetadata(
                    session.user.id,
                    session.user.platformRole,
                    question.metadata,
                ))
                    ? null
                    : question.id,
            ),
        )
    ).find(Boolean);

    if (invisibleQuestion) {
        return {
            error: "所选题目中包含当前用户无权访问的学科记录。",
        };
    }

    const strategy = await prisma.aiReviewStrategy.findUnique({
        where: {
            id: parsed.data.strategyId,
        },
        select: {
            scopeAdminId: true,
        },
    });

    if (!strategy) {
        return {
            error: "审核策略不存在。",
        };
    }

    if (
        !(await canAccessAdminScope(
            session.user.id,
            session.user.platformRole,
            strategy.scopeAdminId,
        ))
    ) {
        return {
            error: "你不能创建其他管理员域的批量审核任务。",
        };
    }

    const pendingOrRunningItems = await prisma.aiReviewStrategyBatchRunItem.findMany(
        {
            where: {
                questionId: {
                    in: uniqueQuestionIds,
                },
                status: {
                    in: ["PENDING", "RUNNING"],
                },
                batchRun: {
                    projectId: actualProjectId,
                    strategyId: parsed.data.strategyId,
                    status: {
                        in: ["PENDING", "RUNNING", "CANCEL_REQUESTED"],
                    },
                },
            },
            select: {
                questionId: true,
            },
        },
    );
    const pendingQuestionIdSet = new Set(
        pendingOrRunningItems.map((item) => item.questionId),
    );
    const pendingExternalRecordIds = questions
        .filter((question) => pendingQuestionIdSet.has(question.id))
        .map((question) => question.externalRecordId);
    const creatableQuestionIds = uniqueQuestionIds.filter(
        (questionId) => !pendingQuestionIdSet.has(questionId),
    );

    if (!creatableQuestionIds.length) {
        return {
            error: `请勿重复提交：以下外部记录 ID 已在待执行/执行中：${formatExternalRecordIdsForMessage(
                pendingExternalRecordIds,
            )}`,
        };
    }

    try {
        logInfo("user.request.create_batch_run", {
            userId: session.user.id,
            strategyId: parsed.data.strategyId,
            projectId: actualProjectId,
            questionCount: creatableQuestionIds.length,
            concurrency: parsed.data.concurrency,
            skippedDuplicateCount: pendingExternalRecordIds.length,
        });
        const batchRun = await createAiReviewStrategyBatchRun({
            strategyId: parsed.data.strategyId,
            questionIds: creatableQuestionIds,
            concurrency: parsed.data.concurrency,
            createdById: session.user.id,
        });

        revalidatePath("/admin/review-tasks");
        revalidatePath("/workspace/reviews");

        logInfo("user.request.create_batch_run.success", {
            userId: session.user.id,
            batchRunId: batchRun.id,
            strategyId: parsed.data.strategyId,
            projectId: actualProjectId,
        });

        return {
            success: pendingExternalRecordIds.length
                ? `批量任务已创建（新增 ${creatableQuestionIds.length} 题）。以下外部记录 ID 已在待执行/执行中，已自动跳过：${formatExternalRecordIdsForMessage(
                      pendingExternalRecordIds,
                  )}`
                : "批量任务已创建，后台 worker 会继续执行。",
            batchRunId: batchRun.id,
        };
    } catch (error) {
        logError("user.request.create_batch_run.failed", {
            userId: session.user.id,
            strategyId: parsed.data.strategyId,
            projectId: actualProjectId,
            error: error instanceof Error ? error.message : "创建批量任务失败。",
        });
        return {
            error:
                error instanceof Error ? error.message : "创建批量任务失败。",
        };
    }
}

export async function cancelAiReviewStrategyBatchRunAction(
    input: z.input<typeof cancelBatchRunSchema>,
): Promise<AiReviewStrategyActionState> {
    const session = await auth();

    if (!session?.user) {
        return {
            error: "请先登录后再取消批量任务。",
        };
    }

    if (!process.env.DATABASE_URL) {
        return {
            error: "当前未配置 DATABASE_URL，无法取消批量任务。",
        };
    }

    const parsed = cancelBatchRunSchema.safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "取消参数不完整。",
        };
    }

    const batchRun = await prisma.aiReviewStrategyBatchRun.findUnique({
        where: {
            id: parsed.data.batchRunId,
        },
        select: {
            id: true,
            projectId: true,
            strategy: {
                select: {
                    scopeAdminId: true,
                },
            },
        },
    });

    if (!batchRun) {
        return {
            error: "批量任务不存在。",
        };
    }

    const canReview = await canUserReviewProject(
        session.user.id,
        session.user.platformRole,
        batchRun.projectId,
    );

    if (!canReview) {
        return {
            error: "你当前没有该项目的审核权限。",
        };
    }

    if (
        !(await canAccessAdminScope(
            session.user.id,
            session.user.platformRole,
            batchRun.strategy.scopeAdminId,
        ))
    ) {
        return {
            error: "你不能取消其他管理员域的批量审核任务。",
        };
    }

    try {
        logWarn("user.request.cancel_batch_run", {
            userId: session.user.id,
            batchRunId: batchRun.id,
            projectId: batchRun.projectId,
        });
        await cancelAiReviewStrategyBatchRun(batchRun.id);

        logInfo("user.request.cancel_batch_run.success", {
            userId: session.user.id,
            batchRunId: batchRun.id,
        });
        return {
            success: "批量任务已请求取消。",
        };
    } catch (error) {
        logError("user.request.cancel_batch_run.failed", {
            userId: session.user.id,
            batchRunId: batchRun.id,
            error: error instanceof Error ? error.message : "取消批量任务失败。",
        });
        return {
            error:
                error instanceof Error ? error.message : "取消批量任务失败。",
        };
    }
}

export async function deleteAiReviewStrategyBatchRunAction(
    input: z.input<typeof deleteBatchRunSchema>,
): Promise<AiReviewStrategyActionState> {
    const session = await auth();

    if (!session?.user) {
        return {
            error: "请先登录后再删除批量任务。",
        };
    }

    if (!process.env.DATABASE_URL) {
        return {
            error: "当前未配置 DATABASE_URL，无法删除批量任务。",
        };
    }

    const parsed = deleteBatchRunSchema.safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "删除参数不完整。",
        };
    }

    const batchRun = await prisma.aiReviewStrategyBatchRun.findUnique({
        where: {
            id: parsed.data.batchRunId,
        },
        select: {
            id: true,
            projectId: true,
            strategy: {
                select: {
                    scopeAdminId: true,
                },
            },
        },
    });

    if (!batchRun) {
        return {
            error: "批量任务不存在。",
        };
    }

    if (
        !(await canAccessAdminScope(
            session.user.id,
            session.user.platformRole,
            batchRun.strategy.scopeAdminId,
        ))
    ) {
        return {
            error: "你不能删除其他管理员域的批量审核任务。",
        };
    }

    const canReview = await canUserReviewProject(
        session.user.id,
        session.user.platformRole,
        batchRun.projectId,
    );

    if (!canReview) {
        return {
            error: "你当前没有该项目的审核权限。",
        };
    }

    try {
        logWarn("user.request.delete_batch_run", {
            userId: session.user.id,
            batchRunId: batchRun.id,
            projectId: batchRun.projectId,
        });
        await deleteAiReviewStrategyBatchRun(batchRun.id);
        revalidatePath("/admin/review-batches");
        revalidatePath("/workspace/review-batches");

        logInfo("user.request.delete_batch_run.success", {
            userId: session.user.id,
            batchRunId: batchRun.id,
        });

        return {
            success: "批量任务已删除。",
        };
    } catch (error) {
        logError("user.request.delete_batch_run.failed", {
            userId: session.user.id,
            batchRunId: batchRun.id,
            error: error instanceof Error ? error.message : "删除批量任务失败。",
        });
        return {
            error:
                error instanceof Error ? error.message : "删除批量任务失败。",
        };
    }
}
