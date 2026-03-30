import { auth } from "@/auth";
import { ReviewQuestionList } from "@/components/workspace/review-question-list";
import { getReviewQuestionListPageData } from "@/lib/reviews/question-list-data";
import { getReviewQuestionListAiStrategies } from "@/lib/ai/review-strategies";
import { getWorkspaceContext } from "@/lib/workspace/context";

function parsePositiveInt(
    value: string | string[] | undefined,
    fallback: number,
) {
    const normalized = Array.isArray(value) ? value[0] : value;
    const parsed = Number(normalized);

    if (!Number.isInteger(parsed) || parsed <= 0) {
        return fallback;
    }

    return parsed;
}

export default async function WorkspaceReviewsPage({
    searchParams,
}: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await auth();
    const workspaceContext = session?.user
        ? await getWorkspaceContext(session.user.id)
        : null;

    const reviewerProjectIds =
        workspaceContext?.reviewerProjects.map(
            (membership) => membership.project.id,
        ) ?? [];
    const resolvedSearchParams = (await searchParams) ?? {};
    const requestedProjectId = Array.isArray(resolvedSearchParams.projectId)
        ? resolvedSearchParams.projectId[0]
        : resolvedSearchParams.projectId;
    const selectedProjectId = reviewerProjectIds.includes(
        requestedProjectId ?? "",
    )
        ? (requestedProjectId as string)
        : (reviewerProjectIds[0] ?? "");
    const requestedPage = parsePositiveInt(resolvedSearchParams.page, 1);
    const requestedPageSize = parsePositiveInt(
        resolvedSearchParams.pageSize,
        50,
    );

    const [questionPage, reviewStrategies] = selectedProjectId
        ? await Promise.all([
              getReviewQuestionListPageData({
                  projectId: selectedProjectId,
                  page: requestedPage,
                  pageSize: requestedPageSize,
              }),
              getReviewQuestionListAiStrategies([selectedProjectId]),
          ])
        : [
              {
                  items: [],
                  total: 0,
                  page: 1,
                  pageSize: 50,
              },
              [],
          ];

    return (
        <ReviewQuestionList
            canReview={Boolean(workspaceContext?.canReview)}
            scopeLabel="我的审核项目"
            listPath="/workspace/reviews"
            projects={(workspaceContext?.reviewerProjects ?? []).map(
                (membership) => ({
                    id: membership.project.id,
                    name: membership.project.name,
                    code: membership.project.code,
                }),
            )}
            questions={questionPage.items}
            selectedProjectId={selectedProjectId}
            currentPage={questionPage.page}
            pageSize={questionPage.pageSize}
            totalQuestions={questionPage.total}
            reviewStrategies={reviewStrategies}
        />
    );
}
