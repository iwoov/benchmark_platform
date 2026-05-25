import { z } from "zod";
import { auth } from "@/auth";
import { canAccessAdminScope } from "@/lib/auth/admin-scope";
import { prisma } from "@/lib/db/prisma";
import { logError, logInfo, logWarn } from "@/lib/logging/app-logger";
import { canUserReviewProject } from "@/lib/reviews/permissions";
import {
    getAiReviewStrategyBatchRunsForProject,
    restartStaleAiReviewStrategyBatchRun,
} from "@/lib/ai/review-strategy-batches";

const querySchema = z.object({
    projectId: z.string().trim().min(1, "缺少项目 ID"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).default(20),
});

const restartSchema = z.object({
    action: z.literal("restart"),
    batchRunId: z.string().trim().min(1, "缺少批量任务 ID"),
});

export async function GET(request: Request) {
    const session = await auth();

    if (!session?.user) {
        return Response.json(
            {
                error: "请先登录后再获取批量任务状态。",
            },
            { status: 401 },
        );
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
        projectId: url.searchParams.get("projectId"),
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    if (!parsed.success) {
        return Response.json(
            {
                error: parsed.error.issues[0]?.message ?? "请求参数不完整。",
            },
            { status: 400 },
        );
    }

    const canReview = await canUserReviewProject(
        session.user.id,
        session.user.platformRole,
        parsed.data.projectId,
    );

    if (!canReview) {
        return Response.json(
            {
                error: "你当前没有该项目的审核权限。",
            },
            { status: 403 },
        );
    }

    const runPage = await getAiReviewStrategyBatchRunsForProject(
        parsed.data.projectId,
        {
            userId: session.user.id,
            platformRole: session.user.platformRole,
        },
        {
            page: parsed.data.page,
            pageSize: parsed.data.pageSize,
        },
    );

    return Response.json({
        runs: runPage.runs,
        page: runPage.page,
        pageSize: runPage.pageSize,
        total: runPage.total,
    });
}

export async function POST(request: Request) {
    const session = await auth();

    if (!session?.user) {
        return Response.json(
            {
                error: "请先登录后再重启批量任务。",
            },
            { status: 401 },
        );
    }

    if (!process.env.DATABASE_URL) {
        return Response.json(
            {
                error: "当前未配置 DATABASE_URL，无法重启批量任务。",
            },
            { status: 500 },
        );
    }

    const body = await request.json().catch(() => null);
    const parsed = restartSchema.safeParse(body);

    if (!parsed.success) {
        return Response.json(
            {
                error: parsed.error.issues[0]?.message ?? "请求参数不完整。",
            },
            { status: 400 },
        );
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
        return Response.json(
            {
                error: "批量任务不存在。",
            },
            { status: 404 },
        );
    }

    const canReview = await canUserReviewProject(
        session.user.id,
        session.user.platformRole,
        batchRun.projectId,
    );

    if (!canReview) {
        return Response.json(
            {
                error: "你当前没有该项目的审核权限。",
            },
            { status: 403 },
        );
    }

    if (
        !(await canAccessAdminScope(
            session.user.id,
            session.user.platformRole,
            batchRun.strategy.scopeAdminId,
        ))
    ) {
        return Response.json(
            {
                error: "你不能重启其他管理员域的批量审核任务。",
            },
            { status: 403 },
        );
    }

    try {
        logWarn("user.request.restart_stale_batch_run", {
            userId: session.user.id,
            batchRunId: batchRun.id,
            projectId: batchRun.projectId,
        });

        await restartStaleAiReviewStrategyBatchRun(batchRun.id);

        logInfo("user.request.restart_stale_batch_run.success", {
            userId: session.user.id,
            batchRunId: batchRun.id,
        });

        return Response.json({
            success: "卡死批量任务已重启，worker 会重新领取待执行题目。",
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "重启批量任务失败。";

        logError("user.request.restart_stale_batch_run.failed", {
            userId: session.user.id,
            batchRunId: batchRun.id,
            error: message,
        });

        return Response.json(
            {
                error: message,
            },
            { status: 409 },
        );
    }
}
