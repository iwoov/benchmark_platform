import { Empty, Tag } from "antd";
import { auth } from "@/auth";
import { getWorkspaceContext } from "@/lib/workspace/context";

export default async function WorkspaceReviewsPage() {
  const session = await auth();
  const workspaceContext = session?.user
    ? await getWorkspaceContext(session.user.id)
    : null;

  return (
    <section className="content-surface">
      <div className="section-head" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>审核任务</h2>
          <p className="muted" style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
            面向项目内的审核专家，后续会在这里展示待审核题目、AI
            审核结果和人工意见入口。
          </p>
        </div>
        <Tag color="gold">REVIEWER</Tag>
      </div>

      {!workspaceContext?.canReview ? (
        <Empty description="你当前没有 REVIEWER 项目角色，暂时无法进入审核任务。" />
      ) : workspaceContext.reviewerProjects.length ? (
        <div style={{ display: "grid", gap: 12 }}>
          {workspaceContext.reviewerProjects.map((membership) => (
            <div key={membership.id} className="workspace-tip">
              <Tag color="gold">{membership.project.code}</Tag>
              <span>
                你在项目「{membership.project.name}
                」中拥有审核权限。后续这里会展示待审核题目、AI
                审核结果和人工意见入口。
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Empty description="当前没有审核任务" />
      )}
    </section>
  );
}
