import { z } from "zod";
import { auth } from "@/auth";
import { canUserReviewProject } from "@/lib/reviews/permissions";
import { createDataEvaluationModelRunBatchRunGroup } from "@/lib/ai/review-strategy-batches";
import {
    getDataEvaluationDetail,
    getDataEvaluationRunStates,
} from "@/lib/evaluations/data-evaluations";

const createBatchRunSchema = z.object({
    projectId: z.string().trim().min(1, "缺少项目 ID"),
    questionIds: z
        .array(z.string().trim().min(1, "缺少题目 ID"))
        .min(1, "至少选择 1 道题目")
        .max(100, "单次最多批量运行 100 道题目"),
    columnCodes: z
        .array(z.string().trim().min(1, "缺少模型列编码"))
        .min(1, "至少选择 1 个模型"),
    concurrency: z.number().int("并发数无效").min(1).max(2).default(1),
    skipSuccessful: z.boolean().default(true),
});

export async function POST(request: Request) {
    const session = await auth();

    if (!session?.user) {
        return Response.json(
            {
                error: "请先登录后再创建数据评测批量任务。",
            },
            { status: 401 },
        );
    }

    if (!process.env.DATABASE_URL) {
        return Response.json(
            {
                error: "当前未配置 DATABASE_URL，无法创建数据评测批量任务。",
            },
            { status: 500 },
        );
    }

    const payload = await request.json().catch(() => null);
    const parsed = createBatchRunSchema.safeParse(payload);

    if (!parsed.success) {
        return Response.json(
            {
                error: parsed.error.issues[0]?.message ?? "请求参数不完整。",
            },
            { status: 400 },
        );
    }

    const questionIds = [...new Set(parsed.data.questionIds)];
    const columnCodes = [...new Set(parsed.data.columnCodes)];
    const canReview = await canUserReviewProject(
        session.user.id,
        session.user.platformRole,
        parsed.data.projectId,
    );

    if (!canReview) {
        return Response.json(
            {
                error: "你当前没有该项目的数据评测权限。",
            },
            { status: 403 },
        );
    }

    const summary = {
        createdCount: 0,
        createdItemCount: 0,
        skippedSuccessfulCount: 0,
        skippedUnavailableCount: 0,
        skippedActiveCount: 0,
        skippedInaccessibleCount: 0,
        failedCount: 0,
    };
    const failures: Array<{
        questionId: string;
        columnCode: string;
        message: string;
    }> = [];
    const groups = new Map<
        string,
        Array<{
            questionId: string;
            columnCode: string;
            evaluationModelFilter: {
                answerModelCode: string | null;
                judgeModelCode: string | null;
            };
        }>
    >();

    for (const questionId of questionIds) {
        const data = await getDataEvaluationDetail({
            questionId,
            viewer: {
                userId: session.user.id,
                platformRole: session.user.platformRole,
            },
            includeRawResponse: false,
        });

        if (!data || data.question.project.id !== parsed.data.projectId) {
            summary.skippedInaccessibleCount += columnCodes.length;
            continue;
        }

        const runStates = await getDataEvaluationRunStates({
            questionId: data.question.id,
            modelColumns: data.modelColumns,
        });

        for (const columnCode of columnCodes) {
            const modelColumn = data.modelColumns.find(
                (column) => column.code === columnCode,
            );

            if (!modelColumn) {
                summary.skippedUnavailableCount += 1;
                continue;
            }

            const result = data.results[columnCode] ?? null;

            if (parsed.data.skipSuccessful && result?.status === "SUCCESS") {
                summary.skippedSuccessfulCount += 1;
                continue;
            }

            const runState = runStates[columnCode];

            if (
                runState?.itemStatus === "PENDING" ||
                runState?.itemStatus === "RUNNING"
            ) {
                summary.skippedActiveCount += 1;
                continue;
            }

            const group = groups.get(modelColumn.strategyId) ?? [];
            group.push({
                questionId: data.question.id,
                columnCode,
                evaluationModelFilter: {
                    answerModelCode: modelColumn.answerModelCode,
                    judgeModelCode: modelColumn.judgeModelCode,
                },
            });
            groups.set(modelColumn.strategyId, group);
        }
    }

    for (const [strategyId, items] of groups) {
        try {
            const batchRun = await createDataEvaluationModelRunBatchRunGroup({
                strategyId,
                items,
                concurrency: parsed.data.concurrency,
                createdById: session.user.id,
            });
            summary.createdCount += 1;
            summary.createdItemCount += batchRun.pendingCount;
            summary.skippedUnavailableCount += batchRun.skippedCount;
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "创建数据评测批量任务失败。";

            summary.failedCount += items.length;

            for (const item of items) {
                if (failures.length >= 10) {
                    break;
                }

                failures.push({
                    questionId: item.questionId,
                    columnCode: item.columnCode,
                    message,
                });
            }
        }
    }

    return Response.json(
        {
            success: summary.createdCount
                ? "数据评测批量任务已提交，后台 worker 会按模型配置执行。"
                : "没有创建新的数据评测任务。",
            summary,
            failures,
        },
        { status: summary.createdCount ? 202 : 200 },
    );
}
