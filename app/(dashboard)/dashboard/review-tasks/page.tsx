import { prisma } from "@/lib/db/prisma";
import { ReviewQuestionList } from "@/components/workspace/review-question-list";
import { getReviewQuestionListPageData } from "@/lib/reviews/question-list-data";
import { getReviewQuestionListAiStrategies } from "@/lib/ai/review-strategies";

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
            canReview
            scopeLabel="全部项目"
            listPath="/admin/review-tasks"
            projects={projects}
            questions={questionPage.items}
            selectedProjectId={selectedProjectId}
            currentPage={questionPage.page}
            pageSize={questionPage.pageSize}
            totalQuestions={questionPage.total}
            reviewStrategies={reviewStrategies}
        />
    );
}
