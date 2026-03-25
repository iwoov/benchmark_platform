import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { QuestionReviewDetail } from "@/components/reviews/question-review-detail";
import {
    getAiReviewStrategyRunsForQuestion,
    getApplicableAiReviewStrategies,
} from "@/lib/ai/review-strategies";
import { getHomePathByRole } from "@/lib/auth/navigation";
import { isAdminRole } from "@/lib/auth/roles";
import {
    getReviewQuestionDetail,
    getReviewQuestionNavigation,
} from "@/lib/reviews/question-list-data";

export const dynamic = "force-dynamic";

export default async function ReviewTaskDetailPage({
    params,
}: {
    params: Promise<{ questionId: string }>;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    if (!isAdminRole(session.user.platformRole)) {
        redirect(getHomePathByRole(session.user.platformRole));
    }

    const { questionId } = await params;
    const question = await getReviewQuestionDetail(questionId);
    const navigation = await getReviewQuestionNavigation(questionId);

    if (!question) {
        notFound();
    }

    const [reviewStrategies, strategyRuns] = await Promise.all([
        getApplicableAiReviewStrategies(question),
        getAiReviewStrategyRunsForQuestion(question.id),
    ]);

    return (
        <QuestionReviewDetail
            question={question}
            canReview
            listPath="/admin/review-tasks"
            navigation={navigation}
            reviewStrategies={reviewStrategies}
            strategyRuns={strategyRuns}
        />
    );
}
