import { Empty } from "antd";
import {
    FolderKanban,
    PencilLine,
    ScanSearch,
    ShieldCheck,
} from "lucide-react";
import { auth } from "@/auth";
import { getWorkspaceContext } from "@/lib/workspace/context";

export default async function WorkspaceHomePage() {
    const session = await auth();
    const workspaceContext = session?.user
        ? await getWorkspaceContext(session.user.id)
        : null;

    const quickStats = [
        {
            label: "项目",
            value: String(workspaceContext?.projectCount ?? 0),
            note: "已加入",
            icon: FolderKanban,
        },
        {
            label: "出题",
            value: String(workspaceContext?.authorProjectCount ?? 0),
            note: "AUTHOR",
            icon: PencilLine,
        },
        {
            label: "审核",
            value: String(workspaceContext?.reviewerProjectCount ?? 0),
            note: "REVIEWER",
            icon: ScanSearch,
        },
    ];
    const scopeBadges = [
        {
            icon: FolderKanban,
            label: `${workspaceContext?.projectCount ?? 0} 个项目`,
        },
        {
            icon: PencilLine,
            label: `${workspaceContext?.authorProjectCount ?? 0} 个出题项目`,
        },
        {
            icon: ScanSearch,
            label: `${workspaceContext?.reviewerProjectCount ?? 0} 个审核项目`,
        },
    ];
    const roleSummary = [
        workspaceContext?.canAuthor ? "AUTHOR" : null,
        workspaceContext?.canReview ? "REVIEWER" : null,
    ]
        .filter(Boolean)
        .join(" / ");

    return (
        <>
            <section className="content-surface overview-hero">
                <div className="overview-hero-copy">
                    <div className="dashboard-kicker">Workspace</div>
                    <h2>聚焦项目、出题与审核。</h2>
                    <p>去掉平台侧噪音，只保留当前角色真正会用到的入口。</p>
                    <div className="overview-tag-row">
                        {scopeBadges.map((item) => {
                            const Icon = item.icon;

                            return (
                                <div key={item.label} className="overview-mini-chip">
                                    <Icon size={15} />
                                    <span>{item.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="overview-side-card">
                    <div className="overview-side-card-row">
                        <div>
                            <div className="overview-side-card-label">
                                当前用户
                            </div>
                            <div className="overview-side-card-value compact">
                                {session?.user.name || session?.user.username}
                            </div>
                        </div>
                        <div className="overview-side-card-note">
                            @{session?.user.username}
                        </div>
                    </div>
                    <div className="overview-side-card-row">
                        <div>
                            <div className="overview-side-card-label">
                                可访问项目
                            </div>
                            <div className="overview-side-card-value">
                                {workspaceContext?.projectCount ?? 0}
                            </div>
                        </div>
                        <div className="overview-side-card-note">
                            按项目成员关系控制范围
                        </div>
                    </div>
                    <div className="overview-side-card-row">
                        <div>
                            <div className="overview-side-card-label">
                                能力角色
                            </div>
                            <div className="overview-side-card-value compact">
                                {roleSummary || "未分配"}
                            </div>
                        </div>
                        <div className="overview-side-card-note">
                            角色能力即时生效
                        </div>
                    </div>
                </div>
            </section>

            <section className="overview-stat-grid">
                {quickStats.map((item) => {
                    const Icon = item.icon;

                    return (
                        <div key={item.label} className="overview-stat-item">
                            <div className="overview-stat-item-icon">
                                <Icon size={18} />
                            </div>
                            <div>
                                <div className="overview-stat-title">
                                    {item.label}
                                </div>
                                <div className="stat-value">{item.value}</div>
                                <div className="overview-stat-title">
                                    {item.note}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </section>

            <section className="content-surface">
                <div className="section-head" style={{ marginBottom: 16 }}>
                    <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                        当前职责
                    </h2>
                </div>

                {workspaceContext?.projectCount ? (
                    <div className="overview-role-list">
                        {workspaceContext.canAuthor ? (
                            <div className="overview-role-item">
                                <div className="overview-role-icon">
                                    <PencilLine size={18} />
                                </div>
                                <div>
                                    <div className="overview-role-title">
                                        AUTHOR
                                    </div>
                                    <div className="overview-role-note">
                                        提交、补充与修改题目。
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        {workspaceContext.canReview ? (
                            <div className="overview-role-item">
                                <div className="overview-role-icon">
                                    <ScanSearch size={18} />
                                </div>
                                <div>
                                    <div className="overview-role-title">
                                        REVIEWER
                                    </div>
                                    <div className="overview-role-note">
                                        查看题目、给出意见并触发 AI 审核。
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        <div className="overview-role-item">
                            <div className="overview-role-icon">
                                <ShieldCheck size={18} />
                            </div>
                            <div>
                                <div className="overview-role-title">
                                    管理边界
                                </div>
                                <div className="overview-role-note">
                                    平台配置与数据接入仍由管理员负责。
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <Empty description="当前还没有分配项目角色" />
                )}
            </section>
        </>
    );
}
