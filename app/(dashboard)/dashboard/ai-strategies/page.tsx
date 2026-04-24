import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AiReviewStrategyConsole } from "@/components/dashboard/ai-review-strategy-console";
import { getHomePathByRole } from "@/lib/auth/navigation";
import { isAdminRole } from "@/lib/auth/roles";
import { getAiReviewStrategyConsoleData } from "@/lib/ai/review-strategies";
import { getAiChatConfigs } from "@/lib/ai/chat-config";

export const dynamic = "force-dynamic";

export default async function AiReviewStrategiesPage({
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

    const [data, chatConfigs] = await Promise.all([
        getAiReviewStrategyConsoleData({
            userId: session.user.id,
            platformRole: session.user.platformRole,
            scopeAdminId: scopeAdminId ?? undefined,
        }),
        getAiChatConfigs(),
    ]);

    return (
        <AiReviewStrategyConsole
            databaseEnabled={data.databaseEnabled}
            currentPlatformRole={session.user.platformRole}
            modelOptions={data.modelOptions}
            projects={data.projects}
            datasources={data.datasources}
            strategies={data.strategies}
            chatConfigs={chatConfigs}
            adminScopeOptions={data.adminScopeOptions}
            activeScopeAdminId={data.activeScopeAdminId}
        />
    );
}
