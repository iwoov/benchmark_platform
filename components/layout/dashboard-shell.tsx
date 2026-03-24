"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import type { ProjectRoleValue } from "@/lib/auth/role-display";
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
    projectRoles?: ProjectRoleValue[];
  };
  workspaceCapabilities?: {
    canManageProjects: boolean;
    canAuthor: boolean;
    canReview: boolean;
  };
}) {
  const pathname = usePathname();
  const title = variant === "admin" ? "管理员后台" : "专家工作台";
  const kicker = variant === "admin" ? "Platform Operations" : "Project Collaboration";
  const description =
    variant === "admin"
      ? "聚焦组织、权限、数据源和 AI 配置，减少装饰，突出操作层级。"
      : "围绕项目、出题和审核展开，保留必要信息，压缩无效视觉干扰。";
  const badge = variant === "admin" ? "Admin scope" : "Workspace scope";
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
        currentUser={displayUser}
        workspaceCapabilities={workspaceCapabilities}
      />
      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="dashboard-title-block">
            <div className="dashboard-kicker">{kicker}</div>
            <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.04 }}>
              {title}
            </h1>
            <div className="dashboard-topbar-note">{description}</div>
          </div>
          <div className="dashboard-topbar-badge">
            {displayUser.name || displayUser.username} · {badge}
          </div>
        </header>

        <main className="dashboard-content">{children}</main>
      </div>
    </div>
  );
}
