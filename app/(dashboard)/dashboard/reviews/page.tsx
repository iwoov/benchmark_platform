import { Empty, Tag } from "antd";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
    const records = process.env.DATABASE_URL
        ? await prisma.review.findMany({
              orderBy: {
                  createdAt: "desc",
              },
              include: {
                  project: {
                      select: {
                          name: true,
                          code: true,
                      },
                  },
                  datasource: {
                      select: {
                          name: true,
                      },
                  },
                  reviewer: {
                      select: {
                          name: true,
                          username: true,
                      },
                  },
              },
          })
        : [];

    const decisionLabel = {
        PASS: "通过",
        REJECT: "驳回",
        NEEDS_REVISION: "退回修改",
    } as const;

    const decisionColor = {
        PASS: "success",
        REJECT: "error",
        NEEDS_REVISION: "warning",
    } as const;

    return (
        <section className="content-surface">
            <div className="section-head">
                <div>
                    <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                        审核记录
                    </h2>
                    <p
                        className="muted"
                        style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                    >
                        汇总人工审核记录与处理结论。
                    </p>
                </div>
            </div>

            {records.length ? (
                <div className="table-surface">
                    <div className="datasource-list-head">
                        <div>项目 / 数据源</div>
                        <div>外部记录 ID</div>
                        <div>审核人</div>
                        <div>结论</div>
                        <div>审核意见</div>
                        <div>时间</div>
                        <div>更新时间</div>
                    </div>

                    {records.map((record) => (
                        <div key={record.id} className="datasource-list-row">
                            <div>
                                <div style={{ fontWeight: 700 }}>
                                    {record.project.name} ({record.project.code}
                                    )
                                </div>
                                <div className="muted" style={{ marginTop: 4 }}>
                                    {record.datasource.name}
                                </div>
                            </div>
                            <div className="muted">
                                {record.externalRecordId}
                            </div>
                            <div>
                                {record.reviewer.name}
                                <div className="muted" style={{ marginTop: 4 }}>
                                    {record.reviewer.username ?? "—"}
                                </div>
                            </div>
                            <div>
                                <Tag color={decisionColor[record.decision]}>
                                    {decisionLabel[record.decision]}
                                </Tag>
                            </div>
                            <div
                                className="muted review-record-comment"
                                title={record.comment}
                            >
                                {record.comment}
                            </div>
                            <div className="muted">
                                {record.createdAt.toLocaleString("zh-CN")}
                            </div>
                            <div className="muted">
                                {record.updatedAt.toLocaleString("zh-CN")}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <Empty description="当前还没有审核记录" />
            )}
        </section>
    );
}
