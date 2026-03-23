import { Col, Empty, Row, Tag } from "antd";
import { auth } from "@/auth";
import { getWorkspaceContext } from "@/lib/workspace/context";

export default async function WorkspaceHomePage() {
  const session = await auth();
  const workspaceContext = session?.user
    ? await getWorkspaceContext(session.user.id)
    : null;

  const quickStats = [
    {
      label: "我的项目",
      value: String(workspaceContext?.projectCount ?? 0),
      note: "基于项目成员关系展示",
    },
    {
      label: "负责项目",
      value: String(workspaceContext?.managerProjectCount ?? 0),
      note: "拥有 PROJECT_MANAGER 角色的项目",
    },
    {
      label: "可出题项目",
      value: String(workspaceContext?.authorProjectCount ?? 0),
      note: "拥有 AUTHOR 角色的项目",
    },
    {
      label: "可审核项目",
      value: String(workspaceContext?.reviewerProjectCount ?? 0),
      note: "拥有 REVIEWER 角色的项目",
    },
  ];

  return (
    <>
      <section className="content-surface">
        <div className="dashboard-kicker">Workspace Overview</div>
        <h2 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>
          {session?.user.name}，当前进入专家工作台
        </h2>
        <p
          className="muted"
          style={{ margin: "12px 0 0", lineHeight: 1.7, maxWidth: 720 }}
        >
          非平台管理员统一从这里处理项目协作任务。平台会根据你在不同项目中的角色，动态决定左侧菜单和可访问的功能入口。
        </p>
      </section>

      <Row gutter={[16, 16]}>
        {quickStats.map((item) => (
          <Col xs={24} md={12} xl={6} key={item.label}>
            <div className="content-surface" style={{ height: "100%" }}>
              <div className="stat-value">{item.value}</div>
              <div style={{ marginTop: 8, fontWeight: 700 }}>{item.label}</div>
              <div className="muted" style={{ marginTop: 6 }}>
                {item.note}
              </div>
            </div>
          </Col>
        ))}
      </Row>

      <section className="content-surface">
        <div className="section-head" style={{ marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
              工作方式
            </h2>
            <p
              className="muted"
              style={{ margin: "10px 0 0", lineHeight: 1.7 }}
            >
              平台级区分平台管理员和平台用户，项目级再拆分项目负责人、出题用户和审核用户。
            </p>
          </div>
        </div>

        {workspaceContext?.projectCount ? (
          <div style={{ display: "grid", gap: 12 }}>
            {workspaceContext.canManageProjects ? (
              <div className="workspace-tip">
                <Tag color="geekblue">PROJECT_MANAGER</Tag>
                <span>
                  可管理自己负责项目的成员分配，并可在项目管理页中导入 JSON /
                  Excel 数据源。
                </span>
              </div>
            ) : null}
            {workspaceContext.canAuthor ? (
              <div className="workspace-tip">
                <Tag color="blue">AUTHOR</Tag>
                <span>可在项目内提交题目、修改题目、查看审核反馈。</span>
              </div>
            ) : null}
            {workspaceContext.canReview ? (
              <div className="workspace-tip">
                <Tag color="gold">REVIEWER</Tag>
                <span>可在项目内查看题目、给出人工意见、触发 AI 审核。</span>
              </div>
            ) : null}
          </div>
        ) : (
          <Empty description="当前还没有分配项目角色" />
        )}
      </section>
    </>
  );
}
