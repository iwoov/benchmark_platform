import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { ReviewQuestionList } from "@/components/workspace/review-question-list";
import {
    getReviewQuestionListFilterMeta,
    getReviewQuestionListPageData,
} from "@/lib/reviews/question-list-data";
import { getReviewQuestionListAiStrategies } from "@/lib/ai/review-strategies";
import { getResolvedUserProjectReviewFieldPreference } from "@/lib/reviews/field-preferences";
import { parseReviewQuestionFilterConditions } from "@/lib/reviews/question-list-filters";
import { getUserSubjectPreferences } from "@/app/actions/account-settings";

export const dynamic = "force-dynamic";

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

export default async function ReviewTasksPage({
    searchParams,
}: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await auth();
    const projects = process.env.DATABASE_URL
        ? await prisma.project.findMany({
              where: {
                  status: "ACTIVE",
              },
              orderBy: {
                  createdAt: "desc",
              },
              select: {
                  id: true,
                  name: true,
                  code: true,
              },
          })
        : [];
    const projectIds = projects.map((project) => project.id);
    const resolvedSearchParams = (await searchParams) ?? {};
    const requestedProjectId = Array.isArray(resolvedSearchParams.projectId)
        ? resolvedSearchParams.projectId[0]
        : resolvedSearchParams.projectId;
    const selectedProjectId = projectIds.includes(requestedProjectId ?? "")
        ? (requestedProjectId as string)
        : (projectIds[0] ?? "");
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

    const subjectPreferences = session?.user?.id
        ? await getUserSubjectPreferences(session.user.id)
        : [];
    const hasUrlFilters = filters.length > 0;

    const [questionPage, reviewStrategies, filterMeta, fieldPreference] =
        selectedProjectId
            ? await Promise.all([
                  getReviewQuestionListPageData({
                      projectId: selectedProjectId,
                      page: requestedPage,
                      pageSize: requestedPageSize,
                      conditions: filters,
                      subjectTitles:
                          !hasUrlFilters && subjectPreferences.length
                              ? subjectPreferences
                              : undefined,
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
            canReview
            scopeLabel="全部项目"
            listPath="/admin/review-tasks"
            projects={projects}
            questions={questionPage.items}
            selectedProjectId={selectedProjectId}
            currentPage={questionPage.page}
            pageSize={questionPage.pageSize}
            totalQuestions={questionPage.total}
            activeConditions={filters}
            datasourceOptions={filterMeta.datasourceOptions}
            rawFieldOptions={filterMeta.rawFieldOptions}
            fieldPreference={fieldPreference}
            reviewStrategies={reviewStrategies}
            activeSubjectPreferences={
                !hasUrlFilters && subjectPreferences.length
                    ? subjectPreferences
                    : undefined
            }
        />
    );
}
