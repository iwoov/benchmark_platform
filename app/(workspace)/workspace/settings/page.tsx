import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountSettingsForms } from "@/components/dashboard/account-settings-forms";
import { getCurrentUserRecord } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.platformRole === "PLATFORM_ADMIN") {
    redirect("/admin/settings");
  }

  const user = await getCurrentUserRecord(session.user.id);

  if (!user?.username) {
    redirect("/workspace");
  }

  return (
    <AccountSettingsForms
      user={{
        username: user.username,
        name: user.name,
        email: user.email,
        platformRole: user.platformRole,
        projectRoles: [...new Set(user.memberships.map((membership) => membership.role))],
      }}
    />
  );
}
