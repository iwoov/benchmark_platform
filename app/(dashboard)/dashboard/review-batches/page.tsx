import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AiReviewBatchRunConsole } from "@/components/reviews/ai-review-batch-run-console";
import { getAiReviewStrategyBatchRunsForProject } from "@/lib/ai/review-strategy-batches";

export const dynamic = "force-dynamic";

function readFirstSearchParam(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(value: string | string[] | undefined, fallback: number) {
    const rawValue = readFirstSearchParam(value);
    const parsed = Number(rawValue);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function ReviewBatchesPage({
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
    const requestedProjectId = readFirstSearchParam(
        resolvedSearchParams.projectId,
    );
    const requestedPage = parsePositiveInt(resolvedSearchParams.page, 1);
    const requestedPageSize = parsePositiveInt(
        resolvedSearchParams.pageSize,
        20,
    );
    const selectedProjectId = projectIds.includes(requestedProjectId ?? "")
        ? (requestedProjectId as string)
        : (projectIds[0] ?? "");
    const initialRunPage = selectedProjectId
        ? await getAiReviewStrategyBatchRunsForProject(
              selectedProjectId,
              session?.user
                  ? {
                        userId: session.user.id,
                        platformRole: session.user.platformRole,
                    }
                  : undefined,
              {
                  page: requestedPage,
                  pageSize: requestedPageSize,
              },
          )
        : {
              runs: [],
              page: 1,
              pageSize: 20,
              total: 0,
          };

    return (
        <AiReviewBatchRunConsole
            projects={projects}
            selectedProjectId={selectedProjectId}
            initialRuns={initialRunPage.runs}
            currentPage={initialRunPage.page}
            pageSize={initialRunPage.pageSize}
            totalRuns={initialRunPage.total}
            listPath="/admin/review-batches"
        />
    );
}
