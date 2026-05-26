import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { DataEvaluationDetail } from "@/components/evaluations/data-evaluation-detail";
import { getHomePathByRole } from "@/lib/auth/navigation";
import { isAdminRole } from "@/lib/auth/roles";
import {
    getDataEvaluationDetail,
    getDataEvaluationQuestionNavigation,
    getDataEvaluationRunStates,
} from "@/lib/evaluations/data-evaluations";

export const dynamic = "force-dynamic";

export default async function AdminEvaluationDetailPage({
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
    const data = await getDataEvaluationDetail({
        questionId,
        viewer: {
            userId: session.user.id,
            platformRole: session.user.platformRole,
        },
    });

    if (!data) {
        notFound();
    }

    const resolvedSearchParams = (await searchParams) ?? {};
    const projectId = Array.isArray(resolvedSearchParams.projectId)
        ? resolvedSearchParams.projectId[0]
        : resolvedSearchParams.projectId;
    const [navigation, runStates] = await Promise.all([
        getDataEvaluationQuestionNavigation({
            questionId,
            projectId,
            viewer: {
                userId: session.user.id,
                platformRole: session.user.platformRole,
            },
        }),
        getDataEvaluationRunStates({
            questionId: data.question.id,
            modelColumns: data.modelColumns,
        }),
    ]);
    const listSearch = new URLSearchParams();
    for (const key of ["projectId", "page", "pageSize"]) {
        const value = resolvedSearchParams[key];
        const normalized = Array.isArray(value) ? value[0] : value;

        if (normalized) {
            listSearch.set(key, normalized);
        }
    }

    return (
        <DataEvaluationDetail
            question={data.question}
            modelColumns={data.modelColumns}
            results={data.results}
            initialRunStates={runStates}
            listPath={
                listSearch.size
                    ? `/admin/evaluations?${listSearch.toString()}`
                    : "/admin/evaluations"
            }
            navigation={navigation}
        />
    );
}
