import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { QuestionReviewDetail } from "@/components/reviews/question-review-detail";
import {
    getAiReviewStrategyRunsForQuestion,
    getApplicableAiReviewStrategies,
} from "@/lib/ai/review-strategies";
import { getAiReviewStrategyRetryStatesForQuestion } from "@/lib/ai/review-strategy-batches";
import { getEnabledAiChatConfigs } from "@/lib/ai/chat-config";
import { getHomePathByRole } from "@/lib/auth/navigation";
import { isAdminRole } from "@/lib/auth/roles";
import { getResolvedUserProjectReviewFieldPreference } from "@/lib/reviews/field-preferences";
import {
    getReviewQuestionDetail,
    getReviewQuestionNavigation,
} from "@/lib/reviews/question-list-data";
import { parseReviewQuestionFilterConditions } from "@/lib/reviews/question-list-filters";

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

    const [
        reviewStrategies,
        strategyRuns,
        retryStates,
        fieldPreference,
        chatConfigs,
    ] =
        await Promise.all([
            getApplicableAiReviewStrategies(question),
            getAiReviewStrategyRunsForQuestion(question.id),
            getAiReviewStrategyRetryStatesForQuestion(question.id),
            getResolvedUserProjectReviewFieldPreference(
                session.user.id,
                question.project.id,
            ),
            getEnabledAiChatConfigs(),
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
            fieldPreference={fieldPreference}
            reviewStrategies={reviewStrategies}
            strategyRuns={strategyRuns}
            retryStates={retryStates}
            chatConfigs={chatConfigs}
        />
    );
}
