import { prisma } from "@/lib/db/prisma";
import { AiReviewBatchRunConsole } from "@/components/reviews/ai-review-batch-run-console";
import { getAiReviewStrategyBatchRunsForProject } from "@/lib/ai/review-strategy-batches";

export const dynamic = "force-dynamic";

export default async function ReviewBatchesPage({
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
    const initialRuns = selectedProjectId
        ? await getAiReviewStrategyBatchRunsForProject(selectedProjectId)
        : [];

    return (
        <AiReviewBatchRunConsole
            projects={projects}
            selectedProjectId={selectedProjectId}
            initialRuns={initialRuns}
            listPath="/admin/review-batches"
        />
    );
}
