import { auth } from "@/auth";
import { ReviewQuestionList } from "@/components/workspace/review-question-list";
import { getReviewQuestionListData } from "@/lib/reviews/question-list-data";
import { getReviewQuestionListAiStrategies } from "@/lib/ai/review-strategies";
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

    const [questionRows, reviewStrategies] = reviewerProjectIds.length
        ? await Promise.all([
              getReviewQuestionListData(reviewerProjectIds),
              getReviewQuestionListAiStrategies(reviewerProjectIds),
          ])
        : [[], []];

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
            reviewStrategies={reviewStrategies}
        />
    );
}
