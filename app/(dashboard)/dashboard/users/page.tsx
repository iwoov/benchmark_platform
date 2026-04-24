import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateUserForm } from "@/components/dashboard/create-user-form";
import { UserManagementTable } from "@/components/dashboard/user-management-table";
import {
    getSuperAdminOptions,
    getUserOwnerAdminOptions,
} from "@/lib/auth/admin-scope";
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

    const [users, adminOptions, superAdminOptions, subjects] = process.env.DATABASE_URL
        ? await Promise.all([
              prisma.user.findMany({
                  where:
                      session.user.platformRole === "SUPER_ADMIN"
                          ? undefined
                          : {
                                OR: [
                                    {
                                        id: session.user.id,
                                    },
                                    {
                                        ownerAdminId: session.user.id,
                                    },
                                ],
                            },
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
                      ownerAdminId: true,
                      ownerAdmin: {
                          select: {
                              id: true,
                              name: true,
                              username: true,
                          },
                      },
                      memberships: {
                          select: {
                              role: true,
                          },
                      },
                      subjectAssignments: {
                          select: {
                              subject: {
                                  select: {
                                      id: true,
                                      name: true,
                                  },
                              },
                          },
                      },
                  },
              }),
              getUserOwnerAdminOptions(),
              getSuperAdminOptions(),
              prisma.subject.findMany({
                  orderBy: {
                      name: "asc",
                  },
                  select: {
                      id: true,
                      name: true,
                  },
              }),
          ])
        : [[], [], [], []];

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
                    adminOptions={adminOptions}
                    subjects={subjects}
                />
            </div>

            <UserManagementTable
                currentPlatformRole={session.user.platformRole}
                currentUserId={session.user.id}
                adminOptions={adminOptions}
                superAdminOptions={superAdminOptions}
                subjects={subjects}
                users={users.map((user) => ({
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    email: user.email,
                    platformRole: user.platformRole,
                    status: user.status,
                    ownerAdminId: user.ownerAdminId,
                    ownerAdminName: user.ownerAdmin?.name ?? null,
                    createdAt: user.createdAt.toLocaleString("zh-CN"),
                    projectRoleSummary: [
                        ...new Set(
                            user.memberships.map(
                                (membership) => membership.role,
                            ),
                        ),
                    ],
                    projectCount: user.memberships.length,
                    subjectTags: user.subjectAssignments.map(
                        (assignment) => assignment.subject,
                    ),
                }))}
            />
        </section>
    );
}
