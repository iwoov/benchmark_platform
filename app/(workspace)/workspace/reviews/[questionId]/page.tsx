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
    searchParams,
}: {
    params: Promise<{ questionId: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
                    ? `/workspace/reviews?${listSearch.toString()}`
                    : "/workspace/reviews"
            }
            navigation={navigation}
            reviewStrategies={reviewStrategies}
            strategyRuns={strategyRuns}
        />
    );
}
