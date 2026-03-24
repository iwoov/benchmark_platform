import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getCurrentUserRecord } from "@/lib/auth/current-user";
import { isAdminRole } from "@/lib/auth/roles";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    if (!isAdminRole(session.user.platformRole)) {
        redirect("/workspace");
    }

    const currentUser = await getCurrentUserRecord(session.user.id);

    return (
        <DashboardShell
            session={session}
            variant="admin"
            currentUser={
                currentUser?.username
                    ? {
                          username: currentUser.username,
                          name: currentUser.name,
                          email: currentUser.email,
                          platformRole: currentUser.platformRole,
                          projectRoles: [
                              ...new Set(
                                  currentUser.memberships.map(
                                      (membership) => membership.role,
                                  ),
                              ),
                          ],
                      }
                    : undefined
            }
        >
            {children}
        </DashboardShell>
    );
}
