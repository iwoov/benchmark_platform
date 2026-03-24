import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getCurrentUserRecord } from "@/lib/auth/current-user";
import { isAdminRole } from "@/lib/auth/roles";
import { getWorkspaceContext } from "@/lib/workspace/context";

export default async function WorkspaceLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    if (isAdminRole(session.user.platformRole)) {
        redirect("/admin");
    }

    const currentUser = await getCurrentUserRecord(session.user.id);
    const workspaceContext = await getWorkspaceContext(session.user.id);

    return (
        <DashboardShell
            session={session}
            variant="workspace"
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
            workspaceCapabilities={{
                canAuthor: workspaceContext.canAuthor,
                canReview: workspaceContext.canReview,
            }}
        >
            {children}
        </DashboardShell>
    );
}
