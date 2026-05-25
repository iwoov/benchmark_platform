import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { DataEvaluationDetail } from "@/components/evaluations/data-evaluation-detail";
import { getDataEvaluationDetail } from "@/lib/evaluations/data-evaluations";
import { canUserReviewProject } from "@/lib/reviews/permissions";

export const dynamic = "force-dynamic";

export default async function WorkspaceEvaluationDetailPage({
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

    const canReview = await canUserReviewProject(
        session.user.id,
        session.user.platformRole,
        data.question.project.id,
    );

    if (!canReview) {
        redirect("/workspace/evaluations");
    }

    const resolvedSearchParams = (await searchParams) ?? {};
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
            listPath={
                listSearch.size
                    ? `/workspace/evaluations?${listSearch.toString()}`
                    : "/workspace/evaluations"
            }
        />
    );
}
