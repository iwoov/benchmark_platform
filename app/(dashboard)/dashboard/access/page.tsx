import { Card, Space, Tag } from "antd";

const accessItems = [
  {
    label: "平台级角色",
    content: (
      <Space wrap>
        <Tag color="blue">PLATFORM_ADMIN</Tag>
        <Tag>USER</Tag>
      </Space>
    ),
  },
  {
    label: "项目级角色",
    content: (
      <Space wrap>
        <Tag color="geekblue">PROJECT_MANAGER</Tag>
        <Tag color="green">AUTHOR</Tag>
        <Tag color="gold">REVIEWER</Tag>
      </Space>
    ),
  },
  {
    label: "当前状态",
    content: "已完成登录态识别，后续补充基于项目成员关系的细粒度鉴权。",
  },
];

export default function AccessPage() {
  return (
    <Card className="panel" style={{ borderRadius: 24 }}>
      <h2 style={{ marginTop: 0, fontSize: 28, lineHeight: 1.1 }}>权限控制</h2>
      <p className="muted" style={{ lineHeight: 1.7 }}>
        当前模型采用平台级角色 + 项目级角色的双层设计。
      </p>

      <div
        style={{
          border: "1px solid rgba(217, 224, 234, 0.9)",
          borderRadius: 18,
          overflow: "hidden",
        }}
      >
        {accessItems.map((item, index) => (
          <div
            key={item.label}
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              gap: 16,
              padding: "16px 18px",
              borderTop: index === 0 ? "none" : "1px solid rgba(217, 224, 234, 0.9)",
            }}
          >
            <div style={{ fontWeight: 700 }}>{item.label}</div>
            <div>{item.content}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
