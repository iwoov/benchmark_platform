"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import {
    canUserAccessQuestionByMetadata,
    canUserReviewProject,
} from "@/lib/reviews/permissions";

const submitReviewSchema = z.object({
    questionId: z.string().min(1, "缺少题目 ID"),
    decision: z.enum(["PASS", "REJECT"]),
    comment: z
        .string()
        .trim()
        .min(2, "审核意见至少 2 个字符")
        .max(1000, "审核意见不能超过 1000 个字符"),
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

    await prisma.$transaction(async (tx) => {
        await tx.review.create({
            data: {
                projectId: question.projectId,
                datasourceId: question.datasourceId,
                externalRecordId: question.externalRecordId,
                reviewerId: session.user.id,
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

    revalidatePath("/admin/reviews");
    revalidatePath("/admin/review-tasks");
    revalidatePath(`/admin/review-tasks/${question.id}`);
    revalidatePath("/workspace/reviews");
    revalidatePath(`/workspace/reviews/${question.id}`);

    return {
        success: `题目 ${question.title} 已提交审核结论。`,
    };
}
