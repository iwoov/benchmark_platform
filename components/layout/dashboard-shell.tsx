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
  const kicker = variant === "admin" ? "Admin Surface" : "Expert Workspace";
  const showTopbar = variant !== "admin";
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
        {showTopbar ? (
          <header className="dashboard-topbar">
            <div className="dashboard-title-block">
              <div className="dashboard-kicker">{kicker}</div>
              <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.04 }}>
                {title}
              </h1>
            </div>
          </header>
        ) : null}

        <main className="dashboard-content">{children}</main>
      </div>
    </div>
  );
}
