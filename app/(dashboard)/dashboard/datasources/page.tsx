import { Card, Space, Tag } from "antd";

const datasourcePlans = [
  "绑定钉钉表格 appId / tableId / viewId",
  "配置字段映射 JSON",
  "展示最近同步状态与错误信息",
];

export default function DataSourcesPage() {
  return (
    <Card className="panel" style={{ borderRadius: 24 }}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>数据源</h2>
          <p className="muted" style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
            后续在这里管理项目与钉钉表格的绑定关系、字段映射和同步配置。
          </p>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {datasourcePlans.map((item) => (
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
              <Tag color="processing">Plan</Tag>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </Space>
    </Card>
  );
}
