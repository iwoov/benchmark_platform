import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DataEvaluationList } from "@/components/evaluations/data-evaluation-list";
import { getHomePathByRole } from "@/lib/auth/navigation";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import {
    getDataEvaluationQuestionList,
    type DataEvaluationModelColumn,
    type DataEvaluationQuestionRow,
} from "@/lib/evaluations/data-evaluations";

export const dynamic = "force-dynamic";

function parsePositiveInt(
    value: string | string[] | undefined,
    fallback: number,
) {
    const normalized = Array.isArray(value) ? value[0] : value;
    const parsed = Number(normalized);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function AdminEvaluationsPage({
    searchParams,
}: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    if (!isAdminRole(session.user.platformRole)) {
        redirect(getHomePathByRole(session.user.platformRole));
    }

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
                  userId: session.user.id,
                  platformRole: session.user.platformRole,
              },
          })
        : {
              items: [] as DataEvaluationQuestionRow[],
              total: 0,
              page: 1,
              pageSize: 50,
              modelColumns: [] as DataEvaluationModelColumn[],
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
            basePath="/admin/evaluations"
        />
    );
}
