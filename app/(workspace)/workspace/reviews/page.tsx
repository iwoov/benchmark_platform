import { auth } from "@/auth";
import { ReviewQuestionList } from "@/components/workspace/review-question-list";
import {
    getReviewQuestionListFilterMeta,
    getReviewQuestionListPageData,
} from "@/lib/reviews/question-list-data";
import { getReviewQuestionListAiStrategies } from "@/lib/ai/review-strategies";
import { getResolvedUserProjectReviewFieldPreference } from "@/lib/reviews/field-preferences";
import { getWorkspaceContext } from "@/lib/workspace/context";
import { parseReviewQuestionFilterConditions } from "@/lib/reviews/question-list-filters";

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
    mode = "quality",
    listPath = "/workspace/reviews",
}: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
    mode?: "quality" | "cleaning";
    listPath?: string;
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
    const filters = parseReviewQuestionFilterConditions(
        Array.isArray(resolvedSearchParams.filters)
            ? resolvedSearchParams.filters[0]
            : resolvedSearchParams.filters,
    );
    const effectiveFilters =
        mode === "cleaning"
            ? filters.filter(
                  (condition) => condition.fieldKey !== "manualReviewStatus",
              )
            : filters;

    const [questionPage, reviewStrategies, filterMeta, fieldPreference] =
        selectedProjectId
            ? await Promise.all([
                  getReviewQuestionListPageData({
                      projectId: selectedProjectId,
                      page: requestedPage,
                      pageSize: requestedPageSize,
                      conditions: effectiveFilters,
                      viewer: {
                          userId: session?.user?.id ?? "",
                          platformRole: session?.user?.platformRole ?? "USER",
                      },
                      requiredManualReviewStatus:
                          mode === "cleaning" ? "PASS" : undefined,
                  }),
                  getReviewQuestionListAiStrategies([selectedProjectId], {
                      userId: session?.user?.id ?? "",
                      platformRole: session?.user?.platformRole ?? "USER",
                  }),
                  getReviewQuestionListFilterMeta(selectedProjectId),
                  getResolvedUserProjectReviewFieldPreference(
                      session?.user?.id ?? "",
                      selectedProjectId,
                  ),
              ])
            : [
                  {
                      items: [],
                      total: 0,
                      page: 1,
                      pageSize: 50,
                  },
                  [],
                  {
                      datasourceOptions: [],
                      rawFieldOptions: [],
                  },
                  {
                      hasSavedPreference: false,
                      fieldCatalog: [],
                      fieldOrder: [],
                      listVisibleFieldKeys: [],
                      detailVisibleFieldKeys: [],
                  },
              ];

    return (
        <ReviewQuestionList
            canReview={Boolean(workspaceContext?.canReview)}
            scopeLabel="我的审核项目"
            listPath={listPath}
            mode={mode}
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
            activeConditions={effectiveFilters}
            datasourceOptions={filterMeta.datasourceOptions}
            rawFieldOptions={filterMeta.rawFieldOptions}
            fieldPreference={fieldPreference}
            reviewStrategies={reviewStrategies}
        />
    );
}
