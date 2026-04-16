import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getHomePathByRole } from "@/lib/auth/navigation";
import { isSuperAdminRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function AdminAiSettingsPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    if (!isSuperAdminRole(session.user.platformRole)) {
        redirect(getHomePathByRole(session.user.platformRole));
    }

    redirect("/dashboard/ai/models");
}
