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

export default function DashboardPage() {
    return (
        <>
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

        </>
    );
}
