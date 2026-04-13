import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { QuestionReviewDetail } from "@/components/reviews/question-review-detail";
import {
    getAiReviewStrategyRunsForQuestion,
    getApplicableAiReviewStrategies,
} from "@/lib/ai/review-strategies";
import { getResolvedUserProjectReviewFieldPreference } from "@/lib/reviews/field-preferences";
import {
    getReviewQuestionDetail,
    getReviewQuestionNavigation,
} from "@/lib/reviews/question-list-data";
import { parseReviewQuestionFilterConditions } from "@/lib/reviews/question-list-filters";
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
    if (!question) {
        notFound();
    }

    const resolvedSearchParams = (await searchParams) ?? {};
    const navigation = await getReviewQuestionNavigation({
        questionId,
        projectId: Array.isArray(resolvedSearchParams.projectId)
            ? resolvedSearchParams.projectId[0]
            : resolvedSearchParams.projectId,
        conditions: parseReviewQuestionFilterConditions(
            Array.isArray(resolvedSearchParams.filters)
                ? resolvedSearchParams.filters[0]
                : resolvedSearchParams.filters,
        ),
    });

    const canReview = await canUserReviewProject(
        session.user.id,
        session.user.platformRole,
        question.project.id,
    );

    if (!canReview) {
        redirect("/workspace/reviews");
    }

    const listSearch = new URLSearchParams();

    for (const key of [
        "projectId",
        "datasourceId",
        "page",
        "pageSize",
        "filters",
    ]) {
        const value = resolvedSearchParams[key];
        const normalized = Array.isArray(value) ? value[0] : value;

        if (normalized) {
            listSearch.set(key, normalized);
        }
    }

    const [reviewStrategies, strategyRuns, fieldPreference] = await Promise.all([
        getApplicableAiReviewStrategies(question),
        getAiReviewStrategyRunsForQuestion(question.id),
        getResolvedUserProjectReviewFieldPreference(
            session.user.id,
            question.project.id,
        ),
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
            fieldPreference={fieldPreference}
            reviewStrategies={reviewStrategies}
            strategyRuns={strategyRuns}
        />
    );
}
