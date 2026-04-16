import type { ComponentType } from "react";
import Link from "next/link";
import { Tag } from "antd";
import { auth } from "@/auth";
import { PersistedReviewListLink } from "@/components/reviews/persisted-review-list-link";
import {
    getAdminOverview,
    type RecentBatchIssue,
    type RecentSyncIssue,
    type RiskProject,
} from "@/lib/dashboard/overview";
import { isSuperAdminRole } from "@/lib/auth/roles";
import {
    Bot,
    BrainCircuit,
    Cpu,
    DatabaseZap,
    FolderKanban,
    Layers3,
    PlugZap,
    RefreshCw,
    ScanSearch,
    Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

function formatDateTime(value: string) {
    return new Date(value).toLocaleString("zh-CN");
}

function EmptyState({ text }: { text: string }) {
    return <div className="overview-empty-state">{text}</div>;
}

function QuickLinks({
    links,
}: {
    links: Array<{ href: string; label: string; icon: ComponentType<{ size?: number }> }>;
}) {
    return (
        <div className="overview-link-grid">
            {links.map((link) => {
                const Icon = link.icon;
                const content = (
                    <>
                        <Icon size={16} />
                        <span>{link.label}</span>
                    </>
                );

                if (link.href === "/admin/review-tasks") {
                    return (
                        <PersistedReviewListLink
                            key={link.href}
                            href={link.href}
                            listPath={link.href}
                            className="overview-link-chip"
                        >
                            {content}
                        </PersistedReviewListLink>
                    );
                }

                return (
                    <Link key={link.href} href={link.href} className="overview-link-chip">
                        {content}
                    </Link>
                );
            })}
        </div>
    );
}

function RecentBatchList({ items }: { items: RecentBatchIssue[] }) {
    if (!items.length) {
        return <EmptyState text="近 7 天没有失败或取消的批量任务。" />;
    }

    return (
        <div className="overview-detail-list">
            {items.map((item) => (
                <Link key={item.id} href={item.href} className="overview-detail-item">
                    <div className="overview-detail-main">
                        <div className="overview-item-title">
                            {item.projectName} · {item.strategyName}
                        </div>
                        <div className="overview-item-meta">
                            {item.projectCode} · {formatDateTime(item.createdAt)}
                        </div>
                        {item.errorMessage ? (
                            <div className="overview-item-subline">
                                {item.errorMessage}
                            </div>
                        ) : null}
                    </div>
                    <div className="overview-detail-tags">
                        <Tag color={item.status === "FAILED" ? "error" : "warning"}>
                            {item.status === "FAILED"
                                ? "失败"
                                : item.status === "CANCELLED"
                                  ? "已取消"
                                  : "取消中"}
                        </Tag>
                    </div>
                </Link>
            ))}
        </div>
    );
}

function RecentSyncList({ items }: { items: RecentSyncIssue[] }) {
    if (!items.length) {
        return <EmptyState text="近 7 天没有同步失败记录。" />;
    }

    return (
        <div className="overview-detail-list">
            {items.map((item) => (
                <Link key={item.id} href={item.href} className="overview-detail-item">
                    <div className="overview-detail-main">
                        <div className="overview-item-title">
                            {item.projectName} · {item.datasourceName}
                        </div>
                        <div className="overview-item-meta">
                            {item.projectCode} · {item.action} ·{" "}
                            {formatDateTime(item.createdAt)}
                        </div>
                        {item.errorMessage ? (
                            <div className="overview-item-subline">
                                {item.errorMessage}
                            </div>
                        ) : null}
                    </div>
                    <div className="overview-detail-tags">
                        <Tag color="error">失败</Tag>
                    </div>
                </Link>
            ))}
        </div>
    );
}

function RiskProjectList({ items }: { items: RiskProject[] }) {
    if (!items.length) {
        return <EmptyState text="当前没有明显积压或异常项目。" />;
    }

    return (
        <div className="overview-detail-list">
            {items.map((item) => (
                <Link key={item.projectId} href={item.href} className="overview-detail-item">
                    <div className="overview-detail-main">
                        <div className="overview-item-title">{item.projectName}</div>
                        <div className="overview-item-meta">{item.projectCode}</div>
                    </div>
                    <div className="overview-inline-metrics">
                        <span>待审核 {item.pendingQuestionCount}</span>
                        <span>同步失败 {item.failedSyncCount7d}</span>
                        <span>批量失败 {item.failedBatchCount7d}</span>
                    </div>
                </Link>
            ))}
        </div>
    );
}

export default async function DashboardPage() {
    const session = await auth();
    const role = isSuperAdminRole(session?.user.platformRole)
        ? "SUPER_ADMIN"
        : "PLATFORM_ADMIN";
    const overview = await getAdminOverview(role);

    if (overview.role === "SUPER_ADMIN") {
        return (
            <>
                <section className="overview-metric-rail">
                    <div className="overview-metric-tile">
                        <div className="overview-metric-icon">
                            <Users size={18} />
                        </div>
                        <div>
                            <div className="overview-metric-label">活跃用户</div>
                            <div className="stat-value">{overview.scale.activeUsers}</div>
                            <div className="overview-metric-note">平台全局</div>
                        </div>
                    </div>
                    <div className="overview-metric-tile">
                        <div className="overview-metric-icon">
                            <FolderKanban size={18} />
                        </div>
                        <div>
                            <div className="overview-metric-label">活跃项目</div>
                            <div className="stat-value">
                                {overview.scale.activeProjects}
                            </div>
                            <div className="overview-metric-note">
                                近 7 天新增 {overview.scale.newProjects7d}
                            </div>
                        </div>
                    </div>
                    <div className="overview-metric-tile">
                        <div className="overview-metric-icon">
                            <DatabaseZap size={18} />
                        </div>
                        <div>
                            <div className="overview-metric-label">活跃数据源</div>
                            <div className="stat-value">
                                {overview.scale.activeDatasources}
                            </div>
                            <div className="overview-metric-note">
                                近 7 天新增 {overview.scale.newDatasources7d}
                            </div>
                        </div>
                    </div>
                    <div className="overview-metric-tile">
                        <div className="overview-metric-icon">
                            <BrainCircuit size={18} />
                        </div>
                        <div>
                            <div className="overview-metric-label">已启用策略</div>
                            <div className="stat-value">
                                {overview.aiResources.enabledStrategyCount}
                            </div>
                            <div className="overview-metric-note">AI 能力编排</div>
                        </div>
                    </div>
                </section>

                <section className="overview-metric-rail">
                    <div className="overview-metric-tile">
                        <div className="overview-metric-icon">
                            <Cpu size={18} />
                        </div>
                        <div>
                            <div className="overview-metric-label">Provider</div>
                            <div className="stat-value">
                                {overview.aiResources.providerCount}
                            </div>
                            <div className="overview-metric-note">已配置</div>
                        </div>
                    </div>
                    <div className="overview-metric-tile">
                        <div className="overview-metric-icon">
                            <Bot size={18} />
                        </div>
                        <div>
                            <div className="overview-metric-label">Endpoint</div>
                            <div className="stat-value">
                                {overview.aiResources.endpointCount}
                            </div>
                            <div className="overview-metric-note">可调用接入点</div>
                        </div>
                    </div>
                    <div className="overview-metric-tile">
                        <div className="overview-metric-icon">
                            <BrainCircuit size={18} />
                        </div>
                        <div>
                            <div className="overview-metric-label">Model</div>
                            <div className="stat-value">
                                {overview.aiResources.modelCount}
                            </div>
                            <div className="overview-metric-note">模型目录</div>
                        </div>
                    </div>
                    <div className="overview-metric-tile">
                        <div className="overview-metric-icon">
                            <RefreshCw size={18} />
                        </div>
                        <div>
                            <div className="overview-metric-label">近 7 天运行失败率</div>
                            <div className="stat-value">
                                {overview.aiRuns.failureRate7d}%
                            </div>
                            <div className="overview-metric-note">
                                总运行 {overview.aiRuns.total7d}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="overview-two-column">
                    <div className="content-surface">
                        <div className="section-head">
                            <div>
                                <h2
                                    style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}
                                >
                                    AI 运行概览
                                </h2>
                                <div className="muted" style={{ marginTop: 8 }}>
                                    先看失败率，再看正在运行和最近异常。
                                </div>
                            </div>
                        </div>

                        <div className="overview-status-grid">
                            <div className="overview-status-item">
                                <span className="overview-status-label">成功</span>
                                <strong>{overview.aiRuns.success7d}</strong>
                            </div>
                            <div className="overview-status-item">
                                <span className="overview-status-label">失败</span>
                                <strong>{overview.aiRuns.failed7d}</strong>
                            </div>
                            <div className="overview-status-item">
                                <span className="overview-status-label">运行中批量</span>
                                <strong>{overview.runningBatchCount}</strong>
                            </div>
                            <div className="overview-status-item">
                                <span className="overview-status-label">同步失败</span>
                                <strong>{overview.failedSyncCount7d}</strong>
                            </div>
                        </div>
                    </div>

                    <section className="content-surface">
                        <div className="section-head">
                            <div>
                                <h2
                                    style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}
                                >
                                    快捷入口
                                </h2>
                            </div>
                        </div>
                        <QuickLinks
                            links={[
                                {
                                    href: "/admin/ai/models",
                                    label: "模型路由",
                                    icon: Cpu,
                                },
                                {
                                    href: "/admin/ai/routes",
                                    label: "供应商",
                                    icon: PlugZap,
                                },
                                {
                                    href: "/admin/ai-strategies",
                                    label: "审核策略",
                                    icon: BrainCircuit,
                                },
                                {
                                    href: "/admin/review-batches",
                                    label: "批量任务",
                                    icon: Layers3,
                                },
                            ]}
                        />
                    </section>
                </section>

                <section className="overview-two-column">
                    <div className="content-surface">
                        <div className="section-head">
                            <div>
                                <h2
                                    style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}
                                >
                                    最近失败批量任务
                                </h2>
                            </div>
                        </div>
                        <RecentBatchList items={overview.recentFailedBatches} />
                    </div>

                    <section className="content-surface">
                        <div className="section-head">
                            <div>
                                <h2
                                    style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}
                                >
                                    最近同步异常
                                </h2>
                            </div>
                        </div>
                        <RecentSyncList items={overview.recentFailedSyncs} />
                    </section>
                </section>
            </>
        );
    }

    return (
        <>
            <section className="overview-metric-rail">
                <div className="overview-metric-tile">
                    <div className="overview-metric-icon">
                        <FolderKanban size={18} />
                    </div>
                    <div>
                        <div className="overview-metric-label">活跃项目</div>
                        <div className="stat-value">{overview.scale.activeProjects}</div>
                        <div className="overview-metric-note">运营范围</div>
                    </div>
                </div>
                <div className="overview-metric-tile">
                    <div className="overview-metric-icon">
                        <Users size={18} />
                    </div>
                    <div>
                        <div className="overview-metric-label">活跃专家</div>
                        <div className="stat-value">{overview.scale.activeExperts}</div>
                        <div className="overview-metric-note">普通账号</div>
                    </div>
                </div>
                <div className="overview-metric-tile">
                    <div className="overview-metric-icon">
                        <DatabaseZap size={18} />
                    </div>
                    <div>
                        <div className="overview-metric-label">活跃数据源</div>
                        <div className="stat-value">
                            {overview.scale.activeDatasources}
                        </div>
                        <div className="overview-metric-note">已接入</div>
                    </div>
                </div>
                <div className="overview-metric-tile">
                    <div className="overview-metric-icon">
                        <RefreshCw size={18} />
                    </div>
                    <div>
                        <div className="overview-metric-label">近 7 天导入</div>
                        <div className="stat-value">
                            {overview.scale.importedDatasources7d}
                        </div>
                        <div className="overview-metric-note">数据源新增</div>
                    </div>
                </div>
            </section>

            <section className="overview-two-column">
                <div className="content-surface">
                    <div className="section-head">
                        <div>
                            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                                题目流转
                            </h2>
                            <div className="muted" style={{ marginTop: 8 }}>
                                首页只看真正影响运营动作的题目状态分布。
                            </div>
                        </div>
                    </div>

                    <div className="overview-status-grid">
                        <div className="overview-status-item">
                            <span className="overview-status-label">草稿</span>
                            <strong>{overview.questionStatuses.DRAFT}</strong>
                        </div>
                        <div className="overview-status-item">
                            <span className="overview-status-label">已提交</span>
                            <strong>{overview.questionStatuses.SUBMITTED}</strong>
                        </div>
                        <div className="overview-status-item">
                            <span className="overview-status-label">审核中</span>
                            <strong>
                                {overview.questionStatuses.UNDER_REVIEW}
                            </strong>
                        </div>
                        <div className="overview-status-item">
                            <span className="overview-status-label">通过</span>
                            <strong>{overview.questionStatuses.APPROVED}</strong>
                        </div>
                        <div className="overview-status-item">
                            <span className="overview-status-label">驳回</span>
                            <strong>{overview.questionStatuses.REJECTED}</strong>
                        </div>
                    </div>
                </div>

                <section className="content-surface">
                    <div className="section-head">
                        <div>
                            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                                当前焦点
                            </h2>
                        </div>
                    </div>

                    <div className="overview-detail-list">
                        <div className="overview-detail-item static">
                            <div className="overview-detail-main">
                                <div className="overview-item-title">待审核题目</div>
                                <div className="overview-item-meta">
                                    当前积压量
                                </div>
                            </div>
                            <div className="overview-inline-metrics">
                                <span>{overview.pendingQuestionCount}</span>
                            </div>
                        </div>
                        <div className="overview-detail-item static">
                            <div className="overview-detail-main">
                                <div className="overview-item-title">近 7 天人工审核</div>
                                <div className="overview-item-meta">
                                    已完成审核
                                </div>
                            </div>
                            <div className="overview-inline-metrics">
                                <span>{overview.completedReviews7d}</span>
                            </div>
                        </div>
                        <div className="overview-detail-item static">
                            <div className="overview-detail-main">
                                <div className="overview-item-title">近 7 天退回修改</div>
                                <div className="overview-item-meta">
                                    需要作者继续处理
                                </div>
                            </div>
                            <div className="overview-inline-metrics">
                                <span>{overview.needsRevisionReviews7d}</span>
                            </div>
                        </div>
                        <div className="overview-detail-item static">
                            <div className="overview-detail-main">
                                <div className="overview-item-title">同步成功 / 失败</div>
                                <div className="overview-item-meta">近 7 天</div>
                            </div>
                            <div className="overview-inline-metrics">
                                <span>{overview.syncSummary7d.successCount}</span>
                                <span>{overview.syncSummary7d.failedCount}</span>
                            </div>
                        </div>
                    </div>

                    <div className="overview-side-actions">
                        <QuickLinks
                            links={[
                                {
                                    href: "/admin/projects",
                                    label: "项目管理",
                                    icon: FolderKanban,
                                },
                                {
                                    href: "/admin/datasources",
                                    label: "数据源",
                                    icon: DatabaseZap,
                                },
                                {
                                    href: "/admin/review-tasks",
                                    label: "审核任务",
                                    icon: ScanSearch,
                                },
                            ]}
                        />
                    </div>
                </section>
            </section>

            <section className="overview-two-column">
                <div className="content-surface">
                    <div className="section-head">
                        <div>
                            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                                风险项目
                            </h2>
                            <div className="muted" style={{ marginTop: 8 }}>
                                按积压、同步失败和批量失败综合排序。
                            </div>
                        </div>
                    </div>
                    <RiskProjectList items={overview.riskProjects} />
                </div>

                <section className="content-surface">
                    <div className="section-head">
                        <div>
                            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                                最近同步异常
                            </h2>
                        </div>
                    </div>
                    <RecentSyncList items={overview.recentFailedSyncs} />
                </section>
            </section>
        </>
    );
}
