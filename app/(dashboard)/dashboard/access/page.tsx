import { Card, Space, Tag } from "antd";
import {
  getPlatformRoleColor,
  getPlatformRoleLabel,
  getProjectRoleColor,
  getProjectRoleLabel,
} from "@/lib/auth/role-display";

const accessItems = [
  {
    label: "平台级角色",
    content: (
      <Space wrap>
        <Tag color={getPlatformRoleColor("PLATFORM_ADMIN")}>
          {getPlatformRoleLabel("PLATFORM_ADMIN")}
        </Tag>
        <Tag color={getPlatformRoleColor("USER")}>
          {getPlatformRoleLabel("USER")}
        </Tag>
      </Space>
    ),
  },
  {
    label: "项目级角色",
    content: (
      <Space wrap>
        <Tag color={getProjectRoleColor("PROJECT_MANAGER")}>
          {getProjectRoleLabel("PROJECT_MANAGER")}
        </Tag>
        <Tag color={getProjectRoleColor("AUTHOR")}>
          {getProjectRoleLabel("AUTHOR")}
        </Tag>
        <Tag color={getProjectRoleColor("REVIEWER")}>
          {getProjectRoleLabel("REVIEWER")}
        </Tag>
      </Space>
    ),
  },
  {
    label: "职责边界",
    content:
      "平台管理员负责平台账号、全部项目和项目负责人角色；项目负责人负责自己项目中的出题/审核成员；出题用户和审核用户只处理项目协作任务。",
  },
  {
    label: "当前状态",
    content:
      "已完成平台管理员、项目负责人和普通项目成员的页面分流，并在项目成员变更上补充了服务端权限校验。",
  },
];

export default function AccessPage() {
  return (
    <Card className="panel">
      <h2 style={{ marginTop: 0, fontSize: 28, lineHeight: 1.1 }}>权限控制</h2>
      <p className="muted" style={{ lineHeight: 1.7 }}>
        当前模型采用平台级角色 + 项目级角色的双层设计。
      </p>

      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 8,
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
              borderTop: index === 0 ? "none" : "1px solid var(--line)",
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
