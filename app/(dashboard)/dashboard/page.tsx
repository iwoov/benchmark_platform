import {
    Activity,
    Bot,
    DatabaseZap,
    FolderOpenDot,
    ShieldCheck,
    Users,
} from "lucide-react";

const stats = [
    {
        label: "活跃项目",
        value: "3",
        hint: "在线",
        icon: FolderOpenDot,
        color: "#2563eb",
    },
    {
        label: "平台账号",
        value: "12",
        hint: "启用",
        icon: Users,
        color: "#0f766e",
    },
    {
        label: "数据源",
        value: "5",
        hint: "已接入",
        icon: DatabaseZap,
        color: "#b45309",
    },
    {
        label: "待接入模块",
        value: "AI",
        hint: "编排中",
        icon: Activity,
        color: "#475467",
    },
];
const lanes = [
    {
        icon: ShieldCheck,
        label: "权限边界",
    },
    {
        icon: DatabaseZap,
        label: "数据接入",
    },
    {
        icon: Bot,
        label: "审核策略",
    },
];
const focusItems = [
    {
        title: "用户与角色",
        note: "统一处理平台账号、启停状态与权限边界。",
        icon: Users,
    },
    {
        title: "项目与数据源",
        note: "项目成员分配、数据导入和同步状态放在同一层级。",
        icon: DatabaseZap,
    },
    {
        title: "AI 审核",
        note: "模型、策略和批量任务独立编排，避免混在业务页里。",
        icon: Bot,
    },
];

export default function DashboardPage() {
    return (
        <>
            <section className="content-surface overview-hero">
                <div className="overview-hero-copy">
                    <div className="dashboard-kicker">Platform</div>
                    <h2>把后台收紧成一条清晰的管理工作线。</h2>
                    <p>减少卡片堆叠和说明噪音，首页只保留关键状态与核心入口。</p>
                    <div className="overview-tag-row">
                        {lanes.map((item) => {
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
                                控制面
                            </div>
                            <div className="overview-side-card-value compact">
                                Admin
                            </div>
                        </div>
                        <div className="overview-side-card-note">
                            平台侧统一入口
                        </div>
                    </div>
                    <div className="overview-side-card-row">
                        <div>
                            <div className="overview-side-card-label">
                                当前重点
                            </div>
                            <div className="overview-side-card-value">
                                3
                            </div>
                        </div>
                        <div className="overview-side-card-note">
                            权限、数据源、AI 审核
                        </div>
                    </div>
                    <div className="overview-side-card-row">
                        <div>
                            <div className="overview-side-card-label">
                                风格目标
                            </div>
                            <div className="overview-side-card-value compact">
                                Dense / Clean
                            </div>
                        </div>
                        <div className="overview-side-card-note">
                            线性分隔替代重盒子
                        </div>
                    </div>
                </div>
            </section>

            <section className="overview-stat-grid">
                {stats.map((item) => {
                    const Icon = item.icon;

                    return (
                        <div key={item.label} className="overview-stat-item">
                            <div
                                className="overview-stat-item-icon"
                                style={{ color: item.color }}
                            >
                                <Icon size={18} />
                            </div>
                            <div>
                                <div className="overview-stat-title">
                                    {item.label}
                                </div>
                                <div className="stat-value">{item.value}</div>
                                <div className="overview-stat-title">
                                    {item.hint}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </section>

            <section className="content-surface">
                <div className="section-head" style={{ marginBottom: 16 }}>
                    <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                        当前重点
                    </h2>
                </div>

                <div className="overview-role-list">
                    {focusItems.map((item) => {
                        const Icon = item.icon;

                        return (
                            <div key={item.title} className="overview-role-item">
                                <div className="overview-role-icon">
                                    <Icon size={18} />
                                </div>
                                <div>
                                    <div className="overview-role-title">
                                        {item.title}
                                    </div>
                                    <div className="overview-role-note">
                                        {item.note}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </>
    );
}
