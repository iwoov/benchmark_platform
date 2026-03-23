import { QuestionStatus } from "@prisma/client";
import { Empty, Tag } from "antd";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { getWorkspaceContext } from "@/lib/workspace/context";

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

  const reviewListGridTemplateColumns = reviewListColumns
    .map((column) => `${column.width}px`)
    .join(" ");
  const reviewListWidth = reviewListColumns.reduce(
    (total, column) => total + column.width,
    0,
  );

  return (
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
          <p className="muted" style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
            按审核优先级统一展示题目。横向滚动会限制在列表区域内部，不会带动整个页面横向滚动。
          </p>
        </div>
        <Tag color="blue">{sortedReviewQuestions.length} 条题目</Tag>
      </div>

      {!workspaceContext?.canReview ? (
        <Empty description="你当前没有 REVIEWER 项目角色，暂时无法进入审核任务。" />
      ) : !sortedReviewQuestions.length ? (
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
              const sourceRowNumber = extractSourceRowNumber(question.metadata);

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
                      sourceRowNumber === null ? "—" : String(sourceRowNumber)
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
  );
}
