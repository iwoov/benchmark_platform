"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import {
    canUserAccessQuestionByMetadata,
    canUserReviewProject,
} from "@/lib/reviews/permissions";
import { REVIEW_COMMENT_MAX_LENGTH } from "@/lib/reviews/review-constraints";

const submitReviewSchema = z.object({
    questionId: z.string().min(1, "缺少题目 ID"),
    decision: z.enum(["PASS", "REJECT"]),
    comment: z
        .string()
        .trim()
        .min(2, "审核意见至少 2 个字符")
        .max(
            REVIEW_COMMENT_MAX_LENGTH,
            `审核意见不能超过 ${REVIEW_COMMENT_MAX_LENGTH} 个字符`,
        ),
});

export type SubmitReviewResult = {
    error?: string;
    success?: string;
};

export async function submitReviewAction(
    input: z.input<typeof submitReviewSchema>,
): Promise<SubmitReviewResult> {
    const session = await auth();

    if (!session?.user) {
        return {
            error: "请先登录后再执行审核。",
        };
    }

    const parsed = submitReviewSchema.safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "审核参数不完整。",
        };
    }

    const reviewer = await prisma.user.findUnique({
        where: {
            id: session.user.id,
        },
        select: {
            id: true,
            status: true,
        },
    });

    if (!reviewer || reviewer.status !== "ACTIVE") {
        return {
            error: "当前登录用户不存在或已停用，请重新登录后再提交审核。",
        };
    }

    const question = await prisma.question.findUnique({
        where: {
            id: parsed.data.questionId,
        },
        select: {
            id: true,
            projectId: true,
            datasourceId: true,
            externalRecordId: true,
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
            error: "你当前不能审核该学科的题目。",
        };
    }

    const nextStatus =
        parsed.data.decision === "PASS" ? "APPROVED" : "REJECTED";

    try {
        await prisma.$transaction(async (tx) => {
            await tx.review.create({
                data: {
                    projectId: question.projectId,
                    datasourceId: question.datasourceId,
                    externalRecordId: question.externalRecordId,
                    reviewerId: reviewer.id,
                    decision: parsed.data.decision,
                    comment: parsed.data.comment,
                },
            });

            await tx.question.update({
                where: {
                    id: question.id,
                },
                data: {
                    status: nextStatus,
                },
            });
        });
    } catch (error) {
        return {
            error:
                error instanceof Error
                    ? `保存审核记录失败：${error.message}`
                    : "保存审核记录失败，请刷新后重试。",
        };
    }

    revalidatePath("/admin/reviews");
    revalidatePath("/admin/review-tasks");
    revalidatePath(`/admin/review-tasks/${question.id}`);
    revalidatePath("/admin/data-cleaning");
    revalidatePath(`/admin/data-cleaning/${question.id}`);
    revalidatePath("/workspace/reviews");
    revalidatePath(`/workspace/reviews/${question.id}`);
    revalidatePath("/workspace/data-cleaning");
    revalidatePath(`/workspace/data-cleaning/${question.id}`);

    return {
        success: `题目 ${question.title} 已提交审核结论。`,
    };
}
