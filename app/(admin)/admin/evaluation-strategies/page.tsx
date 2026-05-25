import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EvaluationStrategyTool } from "@/components/evaluations/evaluation-strategy-tool";
import { getHomePathByRole } from "@/lib/auth/navigation";
import { isAdminRole } from "@/lib/auth/roles";
import { getAiReviewStrategyConsoleData } from "@/lib/ai/review-strategies";

export const dynamic = "force-dynamic";

export default async function AdminEvaluationStrategiesPage({
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

    const resolvedSearchParams = (await searchParams) ?? {};
    const scopeAdminId = Array.isArray(resolvedSearchParams.scopeAdminId)
        ? resolvedSearchParams.scopeAdminId[0]
        : resolvedSearchParams.scopeAdminId;
    const data = await getAiReviewStrategyConsoleData({
        userId: session.user.id,
        platformRole: session.user.platformRole,
        scopeAdminId: scopeAdminId ?? undefined,
    });
    const evaluationStrategies = data.strategies.filter((strategy) =>
        strategy.definition.steps.some(
            (step) =>
                step.kind === "AI_TOOL" &&
                step.toolType === "DIFFICULTY_EVALUATION",
        ),
    );

    return (
        <EvaluationStrategyTool
            databaseEnabled={data.databaseEnabled}
            modelOptions={data.modelOptions}
            projects={data.projects}
            strategies={evaluationStrategies}
            activeScopeAdminId={data.activeScopeAdminId}
        />
    );
}
