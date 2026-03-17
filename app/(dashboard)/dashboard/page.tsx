import { Card, Col, Progress, Row, Space, Tag } from "antd";
import { Activity, DatabaseZap, FolderOpenDot, Users } from "lucide-react";

const stats = [
  {
    label: "活跃项目",
    value: "3",
    hint: "当前已建项目",
    icon: FolderOpenDot,
    color: "#1456d9",
  },
  {
    label: "平台用户",
    value: "12",
    hint: "含管理员与专家",
    icon: Users,
    color: "#0f9f6e",
  },
  {
    label: "数据源",
    value: "5",
    hint: "钉钉表格绑定",
    icon: DatabaseZap,
    color: "#d97706",
  },
  {
    label: "待接入模块",
    value: "AI",
    hint: "审核能力待实现",
    icon: Activity,
    color: "#7c3aed",
  },
];

const nextItems = [
  "配置 PostgreSQL 并执行首个 Prisma migration",
  "落项目管理与成员管理 CRUD",
  "接入钉钉 OAuth 与数据源绑定",
  "补审核记录与 AI 调用页面",
];

export default function DashboardPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card className="panel" style={{ borderRadius: 28 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 30, lineHeight: 1.1 }}>
          一期基础框架已就位
        </h2>
        <p
          className="muted"
          style={{ marginBottom: 0, maxWidth: 720, lineHeight: 1.75 }}
        >
          当前版本已完成 Next.js 应用结构、Prisma 数据模型、Auth.js
          账号密码登录和后台基础导航。下一步可以接项目 CRUD、钉钉 OAuth
          和数据源同步。
        </p>
      </Card>

      <Row gutter={[16, 16]}>
        {stats.map((item) => {
          const Icon = item.icon;

          return (
            <Col xs={24} md={12} xl={6} key={item.label}>
              <Card className="panel" style={{ borderRadius: 24 }}>
                <Space direction="vertical" size={16} style={{ width: "100%" }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 16,
                      display: "grid",
                      placeItems: "center",
                      background: `${item.color}18`,
                      color: item.color,
                    }}
                  >
                    <Icon size={22} />
                  </div>
                  <div className="stat-value">{item.value}</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>{item.label}</div>
                    <div className="muted">{item.hint}</div>
                  </div>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card
            className="panel"
            title="一期实施进度"
            style={{ borderRadius: 24 }}
          >
            <Space direction="vertical" size={18} style={{ width: "100%" }}>
              <div>
                <Space
                  style={{ width: "100%", justifyContent: "space-between" }}
                >
                  <span>项目初始化</span>
                  <strong>100%</strong>
                </Space>
                <Progress
                  percent={100}
                  showInfo={false}
                  strokeColor="#1456d9"
                />
              </div>
              <div>
                <Space
                  style={{ width: "100%", justifyContent: "space-between" }}
                >
                  <span>鉴权基础能力</span>
                  <strong>85%</strong>
                </Space>
                <Progress percent={85} showInfo={false} strokeColor="#0f9f6e" />
              </div>
              <div>
                <Space
                  style={{ width: "100%", justifyContent: "space-between" }}
                >
                  <span>钉钉与 AI 集成</span>
                  <strong>20%</strong>
                </Space>
                <Progress percent={20} showInfo={false} strokeColor="#d97706" />
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card
            className="panel"
            title="后续优先事项"
            style={{ borderRadius: 24 }}
          >
            <div style={{ display: "grid", gap: 12 }}>
              {nextItems.map((item) => (
                <div
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 0",
                    borderBottom: "1px solid rgba(217, 224, 234, 0.8)",
                  }}
                >
                  <Tag color="blue">Next</Tag>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
