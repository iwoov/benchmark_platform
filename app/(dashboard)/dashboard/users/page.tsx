import { redirect } from "next/navigation";
import { Space, Tag } from "antd";
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
                        平台账号统一由管理员维护。超级管理员负责管理员角色与 AI
                        配置，平台管理员负责普通账号维护和项目协作分配。
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

            <Space size={12} style={{ marginTop: 18 }}>
                <Tag color="blue">说明</Tag>
                <span className="muted">
                    超级管理员可维护管理员角色，平台管理员只维护普通账号。项目功能角色请到项目管理页中的“成员管理”分配。
                </span>
            </Space>
        </section>
    );
}
