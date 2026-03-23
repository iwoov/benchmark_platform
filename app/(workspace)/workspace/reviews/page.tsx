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

const rawFieldColumnWidth = 220;

const rawCellStyle = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
} as const;

type ReviewQuestion = {
    id: string;
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
        syncConfig: unknown;
    };
};

function formatDateTime(value: Date | null | undefined) {
    return value ? value.toLocaleString("zh-CN") : "暂无";
}

function normalizeRawValue(value: unknown): string {
    if (value === null || value === undefined) {
        return "";
    }

    if (typeof value === "string") {
        return value.replace(/\s+/g, " ").trim();
    }

    if (
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "bigint"
    ) {
        return String(value);
    }

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function extractRawRecord(metadata: unknown) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return {} as Record<string, string>;
    }

    const rawRecord = (metadata as Record<string, unknown>).rawRecord;

    if (
        !rawRecord ||
        typeof rawRecord !== "object" ||
        Array.isArray(rawRecord)
    ) {
        return {} as Record<string, string>;
    }

    return Object.fromEntries(
        Object.entries(rawRecord as Record<string, unknown>).map(
            ([key, value]) => [key, normalizeRawValue(value)],
        ),
    );
}

function extractSourceRowNumber(metadata: unknown) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return Number.MAX_SAFE_INTEGER;
    }

    const sourceRowNumber = (metadata as Record<string, unknown>)
        .sourceRowNumber;

    return typeof sourceRowNumber === "number"
        ? sourceRowNumber
        : Number.MAX_SAFE_INTEGER;
}

function extractRawFieldOrder(syncConfig: unknown) {
    if (
        !syncConfig ||
        typeof syncConfig !== "object" ||
        Array.isArray(syncConfig)
    ) {
        return [] as string[];
    }

    const rawFieldOrder = (syncConfig as Record<string, unknown>).rawFieldOrder;

    if (!Array.isArray(rawFieldOrder)) {
        return [] as string[];
    }

    return rawFieldOrder.filter(
        (value): value is string =>
            typeof value === "string" && Boolean(value.trim()),
    );
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
                              syncConfig: true,
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
                pendingQuestions:
                    statusCounts.SUBMITTED + statusCounts.UNDER_REVIEW,
                datasourceCount: new Set(
                    projectQuestions.map((question) => question.datasource.id),
                ).size,
                latestUpdatedAt: projectQuestions[0]?.updatedAt ?? null,
                statusCounts,
            };
        },
    );

    const datasourceTables = Array.from(
        sortedReviewQuestions
            .reduce(
                (tables, question) => {
                    const existingTable = tables.get(question.datasource.id);
                    const row = {
                        id: question.id,
                        rawRecord: extractRawRecord(question.metadata),
                        sourceRowNumber: extractSourceRowNumber(
                            question.metadata,
                        ),
                    };

                    if (existingTable) {
                        existingTable.rows.push(row);
                        return tables;
                    }

                    tables.set(question.datasource.id, {
                        datasourceId: question.datasource.id,
                        datasourceName: question.datasource.name,
                        rawFieldOrder: extractRawFieldOrder(
                            question.datasource.syncConfig,
                        ),
                        projectName: question.project.name,
                        projectCode: question.project.code,
                        rows: [row],
                    });

                    return tables;
                },
                new Map<
                    string,
                    {
                        datasourceId: string;
                        datasourceName: string;
                        rawFieldOrder: string[];
                        projectName: string;
                        projectCode: string;
                        rows: Array<{
                            id: string;
                            rawRecord: Record<string, string>;
                            sourceRowNumber: number;
                        }>;
                    }
                >(),
            )
            .values(),
    ).map((table) => {
        const rows = [...table.rows].sort(
            (left, right) => left.sourceRowNumber - right.sourceRowNumber,
        );
        const fallbackColumns = rows.reduce<string[]>((orderedColumns, row) => {
            for (const key of Object.keys(row.rawRecord)) {
                if (!orderedColumns.includes(key)) {
                    orderedColumns.push(key);
                }
            }

            return orderedColumns;
        }, []);
        const columns = [
            ...table.rawFieldOrder.filter((key) =>
                fallbackColumns.includes(key),
            ),
            ...fallbackColumns.filter(
                (key) => !table.rawFieldOrder.includes(key),
            ),
        ];

        return {
            ...table,
            rows,
            columns,
            gridTemplateColumns: columns
                .map(() => `${rawFieldColumnWidth}px`)
                .join(" "),
        };
    });

    return (
        <>
            <section className="content-surface">
                <div className="section-head" style={{ marginBottom: 16 }}>
                    <div>
                        <h2
                            style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}
                        >
                            审核任务
                        </h2>
                        <p
                            className="muted"
                            style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                        >
                            展示你拥有 REVIEWER
                            角色的项目题目。下方列表已切换为原始 JSON / Excel
                            导入字段视图。
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
                                <Col
                                    xs={24}
                                    lg={12}
                                    key={snapshot.membership.id}
                                >
                                    <div
                                        style={{
                                            height: "100%",
                                            padding: 18,
                                            borderRadius: 18,
                                            background:
                                                "rgba(248, 250, 252, 0.9)",
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
                                                    {
                                                        snapshot.membership
                                                            .project.name
                                                    }
                                                </div>
                                                <div
                                                    className="muted"
                                                    style={{ marginTop: 4 }}
                                                >
                                                    项目编码{" "}
                                                    {
                                                        snapshot.membership
                                                            .project.code
                                                    }
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
                                                gridTemplateColumns:
                                                    "repeat(3, minmax(0, 1fr))",
                                                gap: 12,
                                                marginTop: 16,
                                            }}
                                        >
                                            <div>
                                                <div className="muted">
                                                    题目总数
                                                </div>
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
                                                <div className="muted">
                                                    数据源
                                                </div>
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
                                                <div className="muted">
                                                    最近更新
                                                </div>
                                                <div
                                                    style={{
                                                        marginTop: 6,
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {formatDateTime(
                                                        snapshot.latestUpdatedAt,
                                                    )}
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
                                                Object.keys(
                                                    snapshot.statusCounts,
                                                ) as QuestionStatus[]
                                            ).map((status) => (
                                                <Tag
                                                    key={`${snapshot.membership.id}-${status}`}
                                                    color={
                                                        questionStatusMeta[
                                                            status
                                                        ].color
                                                    }
                                                >
                                                    {
                                                        questionStatusMeta[
                                                            status
                                                        ].label
                                                    }{" "}
                                                    {
                                                        snapshot.statusCounts[
                                                            status
                                                        ]
                                                    }
                                                </Tag>
                                            ))}
                                        </div>
                                    </div>
                                </Col>
                            ))}
                        </Row>

                        <div
                            className="workspace-tip"
                            style={{ marginTop: 16 }}
                        >
                            <Tag
                                color={
                                    pendingQuestionCount > 0
                                        ? "gold"
                                        : "default"
                                }
                            >
                                {pendingQuestionCount > 0
                                    ? `${pendingQuestionCount} 条待审核`
                                    : "当前无待审核状态"}
                            </Tag>
                            <span>
                                {pendingQuestionCount > 0
                                    ? "列表已按审核优先级排序，待审核与审核中的题目会排在最前面。"
                                    : "当前导入题目还没有流转到待审核状态，下面先展示原始导入字段。"}
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
                                原始字段列表
                            </h3>
                            <p
                                className="muted"
                                style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                            >
                                按数据源分别展示原始 JSON / Excel
                                列，字段顺序与对应导入文件保持一致。固定列宽，单行显示，超出内容以省略号截断。
                            </p>
                        </div>
                        <Tag color="blue">
                            {sortedReviewQuestions.length} 条题目
                        </Tag>
                    </div>

                    {!datasourceTables.length ? (
                        <Empty description="当前题目没有可展示的原始导入字段" />
                    ) : (
                        <div style={{ display: "grid", gap: 16 }}>
                            {datasourceTables.map((table) => (
                                <div key={table.datasourceId}>
                                    <div
                                        className="workspace-tip"
                                        style={{
                                            marginBottom: 12,
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                        }}
                                    >
                                        <span>
                                            <Tag color="gold">
                                                {table.projectCode}
                                            </Tag>
                                            {table.projectName} /{" "}
                                            {table.datasourceName}
                                        </span>
                                        <Tag>{table.rows.length} 条</Tag>
                                    </div>
                                    <div
                                        className="table-surface"
                                        style={{
                                            overflowX: "auto",
                                            overflowY: "hidden",
                                        }}
                                    >
                                        <div
                                            style={{
                                                minWidth:
                                                    table.columns.length *
                                                    rawFieldColumnWidth,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "grid",
                                                    gridTemplateColumns:
                                                        table.gridTemplateColumns,
                                                    gap: 16,
                                                    padding: "14px 16px",
                                                    background:
                                                        "rgba(248, 250, 252, 0.9)",
                                                    fontWeight: 700,
                                                    alignItems: "center",
                                                }}
                                            >
                                                {table.columns.map((column) => (
                                                    <div
                                                        key={column}
                                                        style={rawCellStyle}
                                                        title={column}
                                                    >
                                                        {column}
                                                    </div>
                                                ))}
                                            </div>

                                            {table.rows.map((row) => (
                                                <div
                                                    key={row.id}
                                                    style={{
                                                        display: "grid",
                                                        gridTemplateColumns:
                                                            table.gridTemplateColumns,
                                                        gap: 16,
                                                        padding: "16px",
                                                        borderTop:
                                                            "1px solid rgba(217, 224, 234, 0.85)",
                                                        alignItems: "center",
                                                        background:
                                                            "rgba(255, 255, 255, 0.82)",
                                                    }}
                                                >
                                                    {table.columns.map(
                                                        (column) => {
                                                            const value =
                                                                row.rawRecord[
                                                                    column
                                                                ] || "—";

                                                            return (
                                                                <div
                                                                    key={`${row.id}-${column}`}
                                                                    style={
                                                                        rawCellStyle
                                                                    }
                                                                    title={
                                                                        value
                                                                    }
                                                                >
                                                                    {value}
                                                                </div>
                                                            );
                                                        },
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            ) : null}
        </>
    );
}
