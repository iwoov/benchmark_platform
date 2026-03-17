import { redirect } from "next/navigation";
import { Space, Tag } from "antd";
import { auth } from "@/auth";
import { CreateUserForm } from "@/components/dashboard/create-user-form";
import { UserManagementTable } from "@/components/dashboard/user-management-table";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await auth();

  if (session?.user.platformRole !== "PLATFORM_ADMIN") {
    redirect("/admin");
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
          <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>用户管理</h2>
          <p className="muted" style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
            平台账号统一由管理员维护。当前不开放自行注册，项目级权限会在项目成员管理中继续细分。
          </p>
        </div>
        <CreateUserForm />
      </div>

      <UserManagementTable
        users={users.map((user) => ({
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          platformRole: user.platformRole,
          status: user.status,
          createdAt: user.createdAt.toLocaleString("zh-CN"),
          projectRoleSummary: [
            ...new Set(user.memberships.map((membership) => membership.role)),
          ],
          projectCount: user.memberships.length,
        }))}
      />

      <Space size={12} style={{ marginTop: 18 }}>
        <Tag color="blue">说明</Tag>
        <span className="muted">
          平台角色在这里维护。项目功能角色请到项目管理页中的“成员管理”分配，普通用户左侧导航会根据这些项目角色动态显示。
        </span>
      </Space>
    </section>
  );
}
