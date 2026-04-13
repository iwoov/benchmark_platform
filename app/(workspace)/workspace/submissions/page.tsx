import { Empty, Tag } from "antd";
import { auth } from "@/auth";
import { getWorkspaceContext } from "@/lib/workspace/context";

export default async function WorkspaceSubmissionsPage() {
  const session = await auth();
  const workspaceContext = session?.user
    ? await getWorkspaceContext(session.user.id)
    : null;

  return (
    <section className="content-surface">
      <div className="section-head" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>出题任务</h2>
          <p className="muted" style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
            面向 AUTHOR 的题目录入与修改入口。
          </p>
        </div>
        <Tag color="blue">AUTHOR</Tag>
      </div>

      {!workspaceContext?.canAuthor ? (
        <Empty description="你当前没有 AUTHOR 项目角色，暂时无法进入出题任务。" />
      ) : workspaceContext.authorProjects.length ? (
        <div style={{ display: "grid", gap: 12 }}>
          {workspaceContext.authorProjects.map((membership) => (
            <div key={membership.id} className="workspace-tip">
              <Tag color="blue">{membership.project.code}</Tag>
              <span>项目「{membership.project.name}」已开启出题权限。</span>
            </div>
          ))}
        </div>
      ) : (
        <Empty description="当前没有出题任务" />
      )}
    </section>
  );
}
