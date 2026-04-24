import { auth } from "@/auth";
import { AiReviewBatchRunConsole } from "@/components/reviews/ai-review-batch-run-console";
import { getAiReviewStrategyBatchRunsForProject } from "@/lib/ai/review-strategy-batches";
import { getWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

export default async function WorkspaceReviewBatchesPage({
    searchParams,
}: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await auth();
    const workspaceContext = session?.user
        ? await getWorkspaceContext(session.user.id)
        : null;
    const projects = (workspaceContext?.reviewerProjects ?? []).map(
        (membership) => ({
            id: membership.project.id,
            name: membership.project.name,
            code: membership.project.code,
        }),
    );
    const projectIds = projects.map((project) => project.id);
    const resolvedSearchParams = (await searchParams) ?? {};
    const requestedProjectId = Array.isArray(resolvedSearchParams.projectId)
        ? resolvedSearchParams.projectId[0]
        : resolvedSearchParams.projectId;
    const selectedProjectId = projectIds.includes(requestedProjectId ?? "")
        ? (requestedProjectId as string)
        : (projectIds[0] ?? "");
    const initialRuns = selectedProjectId
        ? await getAiReviewStrategyBatchRunsForProject(
              selectedProjectId,
              session?.user
                  ? {
                        userId: session.user.id,
                        platformRole: session.user.platformRole,
                    }
                  : undefined,
          )
        : [];

    return (
        <AiReviewBatchRunConsole
            projects={projects}
            selectedProjectId={selectedProjectId}
            initialRuns={initialRuns}
            listPath="/workspace/review-batches"
        />
    );
}
