import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { canUserReviewProject } from "@/lib/reviews/permissions";
import { getAiReviewStrategyRunsForQuestion } from "@/lib/ai/review-strategies";
import { getAiReviewStrategyRetryStatesForQuestion } from "@/lib/ai/review-strategy-batches";

const querySchema = z.object({
    questionId: z.string().trim().min(1, "缺少题目 ID"),
});

export async function GET(request: Request) {
    const session = await auth();

    if (!session?.user) {
        return Response.json(
            {
                error: "请先登录后再获取运行状态。",
            },
            { status: 401 },
        );
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
        questionId: url.searchParams.get("questionId"),
    });

    if (!parsed.success) {
        return Response.json(
            {
                error: parsed.error.issues[0]?.message ?? "请求参数不完整。",
            },
            { status: 400 },
        );
    }

    const question = await prisma.question.findUnique({
        where: {
            id: parsed.data.questionId,
        },
        select: {
            id: true,
            projectId: true,
        },
    });

    if (!question) {
        return Response.json(
            {
                error: "题目不存在或已被删除。",
            },
            { status: 404 },
        );
    }

    const canReview = await canUserReviewProject(
        session.user.id,
        session.user.platformRole,
        question.projectId,
    );

    if (!canReview) {
        return Response.json(
            {
                error: "你当前没有该项目的审核权限。",
            },
            { status: 403 },
        );
    }

    const [runs, retryStates] = await Promise.all([
        getAiReviewStrategyRunsForQuestion(question.id, {
            userId: session.user.id,
            platformRole: session.user.platformRole,
        }),
        getAiReviewStrategyRetryStatesForQuestion(question.id, {
            userId: session.user.id,
            platformRole: session.user.platformRole,
        }),
    ]);

    return Response.json({
        runs,
        retryStates,
    });
}
