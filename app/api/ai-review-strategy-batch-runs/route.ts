import { z } from "zod";
import { auth } from "@/auth";
import { canUserReviewProject } from "@/lib/reviews/permissions";
import { getAiReviewStrategyBatchRunsForProject } from "@/lib/ai/review-strategy-batches";

const querySchema = z.object({
    projectId: z.string().trim().min(1, "缺少项目 ID"),
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

    const runs = await getAiReviewStrategyBatchRunsForProject(
        parsed.data.projectId,
        {
            userId: session.user.id,
            platformRole: session.user.platformRole,
        },
    );

    return Response.json({
        runs,
    });
}
