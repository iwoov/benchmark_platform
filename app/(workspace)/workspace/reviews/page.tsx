import { auth } from "@/auth";
import { ReviewQuestionList } from "@/components/workspace/review-question-list";
import { prisma } from "@/lib/db/prisma";
import { getReviewQuestionListData } from "@/lib/reviews/question-list-data";
import { getWorkspaceContext } from "@/lib/workspace/context";

export default async function WorkspaceReviewsPage() {
    const session = await auth();
    const workspaceContext = session?.user
        ? await getWorkspaceContext(session.user.id)
        : null;

    const reviewerProjectIds =
        workspaceContext?.reviewerProjects.map(
            (membership) => membership.project.id,
        ) ?? [];

    const questionRows = reviewerProjectIds.length
        ? await getReviewQuestionListData(reviewerProjectIds)
        : [];

    return (
        <ReviewQuestionList
            canReview={Boolean(workspaceContext?.canReview)}
            scopeLabel="我的审核项目"
            projects={(workspaceContext?.reviewerProjects ?? []).map(
                (membership) => ({
                    id: membership.project.id,
                    name: membership.project.name,
                    code: membership.project.code,
                }),
            )}
            questions={questionRows}
        />
    );
}
