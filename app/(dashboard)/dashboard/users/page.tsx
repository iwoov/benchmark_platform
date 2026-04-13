import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateUserForm } from "@/components/dashboard/create-user-form";
import { UserManagementTable } from "@/components/dashboard/user-management-table";
import { getHomePathByRole } from "@/lib/auth/navigation";
import { prisma } from "@/lib/db/prisma";
import { isAdminRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    if (!isAdminRole(session.user.platformRole)) {
        redirect(getHomePathByRole(session.user.platformRole));
    }

    const users = process.env.DATABASE_URL
        ? await prisma.user.findMany({
              orderBy: {
                  createdAt: "desc",
              },
              select: {
                  id: true,
                  username: true,
                  name: true,
                  email: true,
                  platformRole: true,
                  status: true,
                  createdAt: true,
                  memberships: {
                      select: {
                          role: true,
                      },
                  },
              },
          })
        : [];

    return (
        <section className="content-surface users-table-surface">
            <div className="section-head">
                <div>
                    <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                        用户管理
                    </h2>
                    <p
                        className="muted"
                        style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                    >
                        维护平台账号、角色边界与启停状态。
                    </p>
                </div>
                <CreateUserForm
                    currentPlatformRole={session.user.platformRole}
                />
            </div>

            <UserManagementTable
                currentPlatformRole={session.user.platformRole}
                users={users.map((user) => ({
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    email: user.email,
                    platformRole: user.platformRole,
                    status: user.status,
                    createdAt: user.createdAt.toLocaleString("zh-CN"),
                    projectRoleSummary: [
                        ...new Set(
                            user.memberships.map(
                                (membership) => membership.role,
                            ),
                        ),
                    ],
                    projectCount: user.memberships.length,
                }))}
            />
        </section>
    );
}
