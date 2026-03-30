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
    searchParams,
}: {
    params: Promise<{ questionId: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

    const resolvedSearchParams = (await searchParams) ?? {};
    const listSearch = new URLSearchParams();

    for (const key of ["projectId", "page", "pageSize"]) {
        const value = resolvedSearchParams[key];
        const normalized = Array.isArray(value) ? value[0] : value;

        if (normalized) {
            listSearch.set(key, normalized);
        }
    }

    const [reviewStrategies, strategyRuns] = await Promise.all([
        getApplicableAiReviewStrategies(question),
        getAiReviewStrategyRunsForQuestion(question.id),
    ]);

    return (
        <QuestionReviewDetail
            question={question}
            canReview
            listPath={
                listSearch.size
                    ? `/admin/review-tasks?${listSearch.toString()}`
                    : "/admin/review-tasks"
            }
            navigation={navigation}
            reviewStrategies={reviewStrategies}
            strategyRuns={strategyRuns}
        />
    );
}
