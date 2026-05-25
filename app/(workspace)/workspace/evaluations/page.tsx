import { auth } from "@/auth";
import { DataEvaluationList } from "@/components/evaluations/data-evaluation-list";
import { getDataEvaluationQuestionList } from "@/lib/evaluations/data-evaluations";
import { getWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

function parsePositiveInt(
    value: string | string[] | undefined,
    fallback: number,
) {
    const normalized = Array.isArray(value) ? value[0] : value;
    const parsed = Number(normalized);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function WorkspaceEvaluationsPage({
    searchParams,
}: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await auth();
    const workspaceContext = session?.user
        ? await getWorkspaceContext(session.user.id)
        : null;
    const projects =
        workspaceContext?.reviewerProjects.map((membership) => ({
            id: membership.project.id,
            name: membership.project.name,
            code: membership.project.code,
        })) ?? [];
    const resolvedSearchParams = (await searchParams) ?? {};
    const requestedProjectId = Array.isArray(resolvedSearchParams.projectId)
        ? resolvedSearchParams.projectId[0]
        : resolvedSearchParams.projectId;
    const selectedProjectId = projects.some(
        (project) => project.id === requestedProjectId,
    )
        ? (requestedProjectId as string)
        : (projects[0]?.id ?? "");

    const data = selectedProjectId
        ? await getDataEvaluationQuestionList({
              projectId: selectedProjectId,
              page: parsePositiveInt(resolvedSearchParams.page, 1),
              pageSize: parsePositiveInt(resolvedSearchParams.pageSize, 50),
              viewer: {
                  userId: session?.user?.id ?? "",
                  platformRole: session?.user?.platformRole ?? "USER",
              },
          })
        : {
              items: [],
              total: 0,
              page: 1,
              pageSize: 50,
              modelColumns: [],
          };

    return (
        <DataEvaluationList
            projects={projects}
            selectedProjectId={selectedProjectId}
            rows={data.items}
            modelColumns={data.modelColumns}
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            basePath="/workspace/evaluations"
        />
    );
}
