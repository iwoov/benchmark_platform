import { Empty, Tag } from "antd";
import { auth } from "@/auth";
import {
  getProjectRoleColor,
  getProjectRoleLabel,
} from "@/lib/auth/role-display";
import { getWorkspaceContext } from "@/lib/workspace/context";

export default async function WorkspaceProjectsPage() {
  const session = await auth();
  const workspaceContext = session?.user
    ? await getWorkspaceContext(session.user.id)
    : null;

  return (
    <section className="content-surface">
      <h2 style={{ marginTop: 0, fontSize: 24, lineHeight: 1.1 }}>我的项目</h2>
      <p className="muted" style={{ margin: "10px 0 18px", lineHeight: 1.7 }}>
        这里展示当前用户已经被分配的项目，以及你在每个项目中的角色。
      </p>

      {workspaceContext?.memberships.length ? (
        <div className="table-surface">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 0.9fr 0.9fr 1fr",
              gap: 16,
              padding: "14px 16px",
              background: "rgba(248, 250, 252, 0.9)",
              fontWeight: 700,
            }}
          >
            <div>项目名称</div>
            <div>项目标识</div>
            <div>项目角色</div>
            <div>加入时间</div>
          </div>

          {workspaceContext.memberships.map((membership) => (
            <div
              key={membership.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 0.9fr 0.9fr 1fr",
                gap: 16,
                padding: "16px",
                borderTop: "1px solid rgba(217, 224, 234, 0.85)",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{membership.project.name}</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  {membership.project.description || "暂无项目描述"}
                </div>
              </div>
              <div>{membership.project.code}</div>
              <div>
                <Tag color={getProjectRoleColor(membership.role)}>
                  {getProjectRoleLabel(membership.role)}
                </Tag>
              </div>
              <div className="muted">
                {membership.joinedAt.toLocaleString("zh-CN")}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty description="当前还没有分配项目" />
      )}
    </section>
  );
}
