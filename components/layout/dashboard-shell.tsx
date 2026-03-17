"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Avatar, Space, Tag } from "antd";
import { Sidebar } from "@/components/layout/sidebar";
import { LogoutButton } from "@/components/layout/logout-button";
import type { Session } from "next-auth";

export function DashboardShell({
  children,
  session,
  variant,
  currentUser,
  workspaceCapabilities,
}: {
  children: ReactNode;
  session: Session;
  variant: "admin" | "workspace";
  currentUser?: {
    username: string;
    name: string;
    email: string | null;
    platformRole: "PLATFORM_ADMIN" | "USER";
  };
  workspaceCapabilities?: {
    canAuthor: boolean;
    canReview: boolean;
  };
}) {
  const pathname = usePathname();
  const title = variant === "admin" ? "管理员后台" : "专家工作台";
  const kicker = variant === "admin" ? "Admin Surface" : "Expert Workspace";
  const displayUser = currentUser ?? {
    username: session.user.username,
    name: session.user.name ?? "",
    email: session.user.email ?? null,
    platformRole: session.user.platformRole,
  };

  return (
    <div className="dashboard-layout">
      <Sidebar
        pathname={pathname}
        variant={variant}
        workspaceCapabilities={workspaceCapabilities}
      />
      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="dashboard-title-block">
            <div className="dashboard-kicker">{kicker}</div>
            <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.04 }}>
              {title}
            </h1>
          </div>

          <Space size={16} className="dashboard-userbar">
            <Space size={12} className="dashboard-user-meta">
              <Avatar
                style={{
                  background: "#1456d9",
                  border: "1px solid rgba(20, 86, 217, 0.18)",
                }}
              >
                {displayUser.name?.slice(0, 1).toUpperCase()}
              </Avatar>
              <div>
                <div style={{ fontWeight: 700 }}>{displayUser.name}</div>
                <Space size={8}>
                  <Tag>{displayUser.username}</Tag>
                  {displayUser.email ? (
                    <span className="muted">{displayUser.email}</span>
                  ) : null}
                  <Tag color="blue">{displayUser.platformRole}</Tag>
                </Space>
              </div>
            </Space>
            <LogoutButton />
          </Space>
        </header>

        <main className="dashboard-content">{children}</main>
      </div>
    </div>
  );
}
