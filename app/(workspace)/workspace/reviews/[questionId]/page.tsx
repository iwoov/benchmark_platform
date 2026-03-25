import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { QuestionReviewDetail } from "@/components/reviews/question-review-detail";
import {
    getAiReviewStrategyRunsForQuestion,
    getApplicableAiReviewStrategies,
} from "@/lib/ai/review-strategies";
import {
    getReviewQuestionDetail,
    getReviewQuestionNavigation,
} from "@/lib/reviews/question-list-data";
import { canUserReviewProject } from "@/lib/reviews/permissions";

export const dynamic = "force-dynamic";

export default async function WorkspaceReviewDetailPage({
    params,
}: {
    params: Promise<{ questionId: string }>;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    const { questionId } = await params;
    const question = await getReviewQuestionDetail(questionId);
    const navigation = await getReviewQuestionNavigation(questionId);

    if (!question) {
        notFound();
    }

    const canReview = await canUserReviewProject(
        session.user.id,
        session.user.platformRole,
        question.project.id,
    );

    if (!canReview) {
        redirect("/workspace/reviews");
    }

    const [reviewStrategies, strategyRuns] = await Promise.all([
        getApplicableAiReviewStrategies(question),
        getAiReviewStrategyRunsForQuestion(question.id),
    ]);

    return (
        <QuestionReviewDetail
            question={question}
            canReview
            listPath="/workspace/reviews"
            navigation={navigation}
            reviewStrategies={reviewStrategies}
            strategyRuns={strategyRuns}
        />
    );
}
