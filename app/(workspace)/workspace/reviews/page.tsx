import { QuestionStatus } from "@prisma/client";
import { Col, Empty, Row, Tag } from "antd";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { getWorkspaceContext } from "@/lib/workspace/context";

const pendingQuestionStatuses = new Set<QuestionStatus>([
  "SUBMITTED",
  "UNDER_REVIEW",
]);

const questionStatusMeta = {
  DRAFT: { label: "草稿", color: "default" },
  SUBMITTED: { label: "待审核", color: "processing" },
  UNDER_REVIEW: { label: "审核中", color: "gold" },
  APPROVED: { label: "已通过", color: "success" },
  REJECTED: { label: "已驳回", color: "error" },
} satisfies Record<QuestionStatus, { label: string; color: string }>;

const questionStatusRank = {
  UNDER_REVIEW: 0,
  SUBMITTED: 1,
  REJECTED: 2,
  DRAFT: 3,
  APPROVED: 4,
} satisfies Record<QuestionStatus, number>;

const reviewListCellStyle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const reviewListColumns = [
  { key: "project", label: "项目", width: 180 },
  { key: "datasource", label: "数据源", width: 180 },
  { key: "title", label: "题目标题", width: 220 },
  { key: "content", label: "题目内容", width: 360 },
  { key: "answer", label: "参考答案", width: 300 },
  { key: "status", label: "状态", width: 120 },
  { key: "updatedAt", label: "最近更新", width: 180 },
  { key: "sourceRowNumber", label: "来源行", width: 110 },
] as const;

type ReviewQuestion = {
  id: string;
  title: string;
  content: string;
  answer: string | null;
  status: QuestionStatus;
  updatedAt: Date;
  metadata: unknown;
  project: {
    id: string;
    name: string;
    code: string;
  };
  datasource: {
    id: string;
    name: string;
  };
};

function formatDateTime(value: Date | null | undefined) {
  return value ? value.toLocaleString("zh-CN") : "暂无";
}

function extractSourceRowNumber(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const sourceRowNumber = (metadata as Record<string, unknown>).sourceRowNumber;

  return typeof sourceRowNumber === "number" ? sourceRowNumber : null;
}

export default async function WorkspaceReviewsPage() {
  const session = await auth();
  const workspaceContext = session?.user
    ? await getWorkspaceContext(session.user.id)
    : null;

  const reviewerProjectIds =
    workspaceContext?.reviewerProjects.map(
      (membership) => membership.project.id,
    ) ?? [];

  const questionRows: ReviewQuestion[] =
    reviewerProjectIds.length && process.env.DATABASE_URL
      ? await prisma.question.findMany({
          where: {
            projectId: {
              in: reviewerProjectIds,
            },
          },
          select: {
            id: true,
            title: true,
            content: true,
            answer: true,
            status: true,
            updatedAt: true,
            metadata: true,
            project: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            datasource: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      : [];

  const sortedReviewQuestions = [...questionRows].sort((left, right) => {
    const rankDelta =
      questionStatusRank[left.status] - questionStatusRank[right.status];

    if (rankDelta !== 0) {
      return rankDelta;
    }

    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });

  const pendingQuestionCount = sortedReviewQuestions.filter((question) =>
    pendingQuestionStatuses.has(question.status),
  ).length;

  const projectSnapshots = (workspaceContext?.reviewerProjects ?? []).map(
    (membership) => {
      const projectQuestions = sortedReviewQuestions.filter(
        (question) => question.project.id === membership.project.id,
      );
      const statusCounts = {
        DRAFT: 0,
        SUBMITTED: 0,
        UNDER_REVIEW: 0,
        APPROVED: 0,
        REJECTED: 0,
      } satisfies Record<QuestionStatus, number>;

      for (const question of projectQuestions) {
        statusCounts[question.status] += 1;
      }

      return {
        membership,
        totalQuestions: projectQuestions.length,
        pendingQuestions: statusCounts.SUBMITTED + statusCounts.UNDER_REVIEW,
        datasourceCount: new Set(
          projectQuestions.map((question) => question.datasource.id),
        ).size,
        latestUpdatedAt: projectQuestions[0]?.updatedAt ?? null,
        statusCounts,
      };
    },
  );

  const reviewListGridTemplateColumns = reviewListColumns
    .map((column) => `${column.width}px`)
    .join(" ");
  const reviewListWidth = reviewListColumns.reduce(
    (total, column) => total + column.width,
    0,
  );

  return (
    <>
      <section className="content-surface">
        <div className="section-head" style={{ marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
              审核任务
            </h2>
            <p
              className="muted"
              style={{ margin: "10px 0 0", lineHeight: 1.7 }}
            >
              展示你拥有 REVIEWER
              角色的项目题目。下方列表会按项目、数据源、题目内容和审核状态统一展示。
            </p>
          </div>
          <Tag color="gold">REVIEWER</Tag>
        </div>

        {!workspaceContext?.canReview ? (
          <Empty description="你当前没有 REVIEWER 项目角色，暂时无法进入审核任务。" />
        ) : projectSnapshots.length ? (
          <>
            <Row gutter={[16, 16]}>
              {projectSnapshots.map((snapshot) => (
                <Col xs={24} lg={12} key={snapshot.membership.id}>
                  <div
                    style={{
                      height: "100%",
                      padding: 18,
                      borderRadius: 18,
                      background: "rgba(248, 250, 252, 0.9)",
                      border: "1px solid rgba(216, 221, 210, 0.9)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 18,
                          }}
                        >
                          {snapshot.membership.project.name}
                        </div>
                        <div className="muted" style={{ marginTop: 4 }}>
                          项目编码 {snapshot.membership.project.code}
                        </div>
                      </div>
                      <Tag color="gold">
                        {snapshot.pendingQuestions > 0
                          ? `${snapshot.pendingQuestions} 条待审核`
                          : "暂无待审核"}
                      </Tag>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: 12,
                        marginTop: 16,
                      }}
                    >
                      <div>
                        <div className="muted">题目总数</div>
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 22,
                            fontWeight: 700,
                          }}
                        >
                          {snapshot.totalQuestions}
                        </div>
                      </div>
                      <div>
                        <div className="muted">数据源</div>
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 22,
                            fontWeight: 700,
                          }}
                        >
                          {snapshot.datasourceCount}
                        </div>
                      </div>
                      <div>
                        <div className="muted">最近更新</div>
                        <div
                          style={{
                            marginTop: 6,
                            fontWeight: 600,
                          }}
                        >
                          {formatDateTime(snapshot.latestUpdatedAt)}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        marginTop: 16,
                      }}
                    >
                      {(
                        Object.keys(snapshot.statusCounts) as QuestionStatus[]
                      ).map((status) => (
                        <Tag
                          key={`${snapshot.membership.id}-${status}`}
                          color={questionStatusMeta[status].color}
                        >
                          {questionStatusMeta[status].label}{" "}
                          {snapshot.statusCounts[status]}
                        </Tag>
                      ))}
                    </div>
                  </div>
                </Col>
              ))}
            </Row>

            <div className="workspace-tip" style={{ marginTop: 16 }}>
              <Tag color={pendingQuestionCount > 0 ? "gold" : "default"}>
                {pendingQuestionCount > 0
                  ? `${pendingQuestionCount} 条待审核`
                  : "当前无待审核状态"}
              </Tag>
              <span>
                {pendingQuestionCount > 0
                  ? "列表已按审核优先级排序，待审核与审核中的题目会排在最前面。"
                  : "当前导入题目还没有流转到待审核状态，下面先展示题目列表。"}
              </span>
            </div>
          </>
        ) : (
          <Empty description="当前没有审核任务" />
        )}
      </section>

      {workspaceContext?.canReview && projectSnapshots.length ? (
        <section className="content-surface">
          <div className="section-head" style={{ marginBottom: 16 }}>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 22,
                  lineHeight: 1.1,
                }}
              >
                题目列表
              </h3>
              <p
                className="muted"
                style={{ margin: "10px 0 0", lineHeight: 1.7 }}
              >
                按审核优先级统一展示题目。横向滚动会限制在列表区域内部，不会带动整个页面横向滚动。
              </p>
            </div>
            <Tag color="blue">{sortedReviewQuestions.length} 条题目</Tag>
          </div>

          {!sortedReviewQuestions.length ? (
            <Empty description="当前没有可展示的题目" />
          ) : (
            <div
              className="review-list-scroll"
              style={{ overflowX: "auto", overflowY: "hidden" }}
            >
              <div
                className="table-surface"
                style={{
                  minWidth: reviewListWidth,
                  width: "max-content",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: reviewListGridTemplateColumns,
                    gap: 16,
                    padding: "14px 16px",
                    background: "rgba(248, 250, 252, 0.9)",
                    fontWeight: 700,
                    alignItems: "center",
                  }}
                >
                  {reviewListColumns.map((column) => (
                    <div
                      key={column.key}
                      style={reviewListCellStyle}
                      title={column.label}
                    >
                      {column.label}
                    </div>
                  ))}
                </div>

                {sortedReviewQuestions.map((question) => {
                  const sourceRowNumber = extractSourceRowNumber(
                    question.metadata,
                  );

                  return (
                    <div
                      key={question.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: reviewListGridTemplateColumns,
                        gap: 16,
                        padding: "16px",
                        borderTop: "1px solid rgba(217, 224, 234, 0.85)",
                        alignItems: "center",
                        background: "rgba(255, 255, 255, 0.82)",
                      }}
                    >
                      <div
                        style={reviewListCellStyle}
                        title={`${question.project.name} (${question.project.code})`}
                      >
                        <Tag color="gold">{question.project.code}</Tag>{" "}
                        {question.project.name}
                      </div>
                      <div
                        style={reviewListCellStyle}
                        title={question.datasource.name}
                      >
                        {question.datasource.name}
                      </div>
                      <div style={reviewListCellStyle} title={question.title}>
                        {question.title}
                      </div>
                      <div style={reviewListCellStyle} title={question.content}>
                        {question.content}
                      </div>
                      <div
                        style={reviewListCellStyle}
                        title={question.answer ?? "—"}
                      >
                        {question.answer ?? "—"}
                      </div>
                      <div>
                        <Tag color={questionStatusMeta[question.status].color}>
                          {questionStatusMeta[question.status].label}
                        </Tag>
                      </div>
                      <div
                        style={reviewListCellStyle}
                        title={formatDateTime(question.updatedAt)}
                      >
                        {formatDateTime(question.updatedAt)}
                      </div>
                      <div
                        style={reviewListCellStyle}
                        title={
                          sourceRowNumber === null
                            ? "—"
                            : String(sourceRowNumber)
                        }
                      >
                        {sourceRowNumber ?? "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
