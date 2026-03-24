import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AiSettingsConsole } from "@/components/dashboard/ai-settings-console";
import { getHomePathByRole } from "@/lib/auth/navigation";
import { isSuperAdminRole } from "@/lib/auth/roles";
import { getAiSettingsData } from "@/lib/ai/settings";

export const dynamic = "force-dynamic";

export default async function AdminAiSettingsPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    if (!isSuperAdminRole(session.user.platformRole)) {
        redirect(getHomePathByRole(session.user.platformRole));
    }

    const data = await getAiSettingsData();

    return (
        <AiSettingsConsole
            databaseEnabled={data.databaseEnabled}
            providers={data.providers}
            endpointOptions={data.endpointOptions}
            models={data.models}
        />
    );
}
