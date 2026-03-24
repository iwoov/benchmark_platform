import { Progress, Tag } from "antd";
import { Activity, DatabaseZap, FolderOpenDot, Users } from "lucide-react";

const stats = [
    {
        label: "活跃项目",
        value: "3",
        hint: "当前已建项目",
        icon: FolderOpenDot,
        color: "#2563eb",
    },
    {
        label: "平台账号",
        value: "12",
        hint: "含管理员与专家",
        icon: Users,
        color: "#0f766e",
    },
    {
        label: "数据源",
        value: "5",
        hint: "已接入钉钉表格",
        icon: DatabaseZap,
        color: "#b45309",
    },
    {
        label: "待接入模块",
        value: "AI",
        hint: "审核能力待完善",
        icon: Activity,
        color: "#475467",
    },
];

const progressItems = [
    { label: "项目初始化", percent: 100, color: "#2563eb" },
    { label: "鉴权基础能力", percent: 85, color: "#0f766e" },
    { label: "钉钉与 AI 集成", percent: 20, color: "#b45309" },
];

const nextItems = [
    "配置 PostgreSQL 并执行首个 Prisma migration",
    "补齐项目管理与成员管理 CRUD",
    "接入钉钉 OAuth 与数据源绑定",
    "完成审核记录与 AI 调用页面",
];

export default function DashboardPage() {
    return (
        <>
            <section className="content-surface overview-hero">
                <div className="overview-hero-copy">
                    <div className="dashboard-kicker">Admin Overview</div>
                    <h2>一期基础框架已经成型，接下来重点补业务闭环。</h2>
                    <p>
                        当前版本已经完成 Next.js 应用结构、Prisma
                        数据模型、Auth.js
                        登录和后台基础导航。界面层这次重构收敛为中性配色和更明确的层级，后续扩展
                        CRUD、 数据接入和审核流程时会更稳定。
                    </p>
                </div>

                <div className="overview-side-card">
                    <div>
                        <div className="overview-side-card-label">
                            Current Phase
                        </div>
                        <div className="overview-side-card-value">Phase 1</div>
                    </div>
                    <div className="muted" style={{ lineHeight: 1.7 }}>
                        当前已将管理员能力收敛到平台侧，AI
                        配置只由超级管理员维护，项目协作角色只保留出题与审核两条链路。
                    </div>
                </div>
            </section>

            <section className="overview-stat-grid">
                {stats.map((item) => {
                    const Icon = item.icon;

                    return (
                        <div
                            key={item.label}
                            className="content-surface overview-stat-card"
                        >
                            <div
                                className="overview-stat-icon"
                                style={{ color: item.color }}
                            >
                                <Icon size={20} />
                            </div>
                            <div className="stat-value">{item.value}</div>
                            <div>
                                <div className="overview-stat-title">
                                    {item.label}
                                </div>
                                <div className="muted" style={{ marginTop: 6 }}>
                                    {item.hint}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </section>

            <section className="overview-panel-grid">
                <div className="content-surface">
                    <div className="section-head" style={{ marginBottom: 18 }}>
                        <div>
                            <h2
                                style={{
                                    margin: 0,
                                    fontSize: 24,
                                    lineHeight: 1.1,
                                }}
                            >
                                一期实施进度
                            </h2>
                            <p
                                className="muted"
                                style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                            >
                                将平台能力拆成三个阶段，先保证基础设施稳定，再补外围集成。
                            </p>
                        </div>
                    </div>

                    <div style={{ display: "grid", gap: 18 }}>
                        {progressItems.map((item) => (
                            <div key={item.label}>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        marginBottom: 10,
                                    }}
                                >
                                    <span>{item.label}</span>
                                    <strong>{item.percent}%</strong>
                                </div>
                                <Progress
                                    percent={item.percent}
                                    showInfo={false}
                                    strokeColor={item.color}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="content-surface">
                    <div className="section-head" style={{ marginBottom: 12 }}>
                        <div>
                            <h2
                                style={{
                                    margin: 0,
                                    fontSize: 24,
                                    lineHeight: 1.1,
                                }}
                            >
                                后续优先事项
                            </h2>
                            <p
                                className="muted"
                                style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                            >
                                保持顺序推进，避免并行改动过多造成后台结构反复。
                            </p>
                        </div>
                    </div>

                    <div className="overview-list">
                        {nextItems.map((item, index) => (
                            <div key={item} className="overview-list-item">
                                <div className="overview-list-index">
                                    {index + 1}
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    {item}
                                </div>
                                <Tag color="blue">Next</Tag>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </>
    );
}
