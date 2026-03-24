"use client";

import Link from "next/link";
import { Avatar, Space, Tag } from "antd";
import {
    Bot,
    FolderKanban,
    LayoutDashboard,
    PlugZap,
    ScrollText,
    SlidersHorizontal,
    UsersRound,
} from "lucide-react";
import { LogoutButton } from "@/components/layout/logout-button";
import {
    getPlatformRoleColor,
    getPlatformRoleLabel,
    getProjectRoleColor,
    getProjectRoleLabel,
} from "@/lib/auth/role-display";
import type { PlatformRoleValue, ProjectRoleValue } from "@/lib/auth/roles";
import { isSuperAdminRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils/cn";

const adminSections = [
    {
        title: "工作台",
        items: [{ href: "/admin", label: "概览", icon: LayoutDashboard }],
    },
    {
        title: "组织与权限",
        items: [{ href: "/admin/users", label: "用户管理", icon: UsersRound }],
    },
    {
        title: "项目与数据源",
        items: [
            { href: "/admin/projects", label: "项目管理", icon: FolderKanban },
            { href: "/admin/datasources", label: "数据源", icon: PlugZap },
        ],
    },
    {
        title: "审核工作台",
        items: [
            { href: "/admin/ai", label: "AI 设置", icon: Bot },
            { href: "/admin/reviews", label: "审核记录", icon: ScrollText },
        ],
    },
    {
        title: "个人",
        items: [
            {
                href: "/admin/settings",
                label: "账户设置",
                icon: SlidersHorizontal,
            },
        ],
    },
];

const workspaceSections = [
    {
        title: "工作台",
        items: [{ href: "/workspace", label: "概览", icon: LayoutDashboard }],
    },
    {
        title: "项目协作",
        items: [
            {
                href: "/workspace/projects",
                label: "我的项目",
                icon: FolderKanban,
            },
            {
                href: "/workspace/submissions",
                label: "出题任务",
                icon: PlugZap,
            },
            { href: "/workspace/reviews", label: "审核任务", icon: ScrollText },
        ],
    },
    {
        title: "个人",
        items: [
            {
                href: "/workspace/settings",
                label: "账户设置",
                icon: SlidersHorizontal,
            },
        ],
    },
];

export function Sidebar({
    pathname,
    variant,
    currentUser,
    workspaceCapabilities,
}: {
    pathname: string;
    variant: "admin" | "workspace";
    currentUser?: {
        username: string;
        name: string;
        email: string | null;
        platformRole: PlatformRoleValue;
        projectRoles?: ProjectRoleValue[];
    };
    workspaceCapabilities?: {
        canAuthor: boolean;
        canReview: boolean;
    };
}) {
    const visibleSections =
        variant === "admin"
            ? adminSections.map((section) => ({
                  ...section,
                  items: section.items.filter((item) =>
                      item.href === "/admin/ai"
                          ? isSuperAdminRole(currentUser?.platformRole)
                          : true,
                  ),
              }))
            : workspaceSections.map((section) => ({
                  ...section,
                  items: section.items.filter((item) => {
                      if (item.href === "/workspace/submissions") {
                          return workspaceCapabilities?.canAuthor;
                      }

                      if (item.href === "/workspace/reviews") {
                          return workspaceCapabilities?.canReview;
                      }

                      return true;
                  }),
              }));
    const rootPath = variant === "admin" ? "/admin" : "/workspace";
    const title = variant === "admin" ? "Platform Admin" : "Expert Workspace";
    const copy =
        variant === "admin"
            ? "平台配置、权限和数据接入统一在这里管理。"
            : "项目协作、出题与审核在同一工作流内完成。";
    const showSidebarHeader = true;

    return (
        <aside className="dashboard-sidebar">
            <div className="sidebar-shell">
                <div>
                    {showSidebarHeader ? (
                        <div className="sidebar-header">
                            <div className="sidebar-eyebrow">
                                Benchmark Platform
                            </div>
                            <div className="sidebar-title">{title}</div>
                            <div className="muted sidebar-copy">{copy}</div>
                        </div>
                    ) : null}

                    <nav className="sidebar-nav-groups">
                        {visibleSections.map((section) => (
                            <div key={section.title}>
                                <div className="sidebar-group-title">
                                    {section.title}
                                </div>

                                <div style={{ display: "grid", gap: 6 }}>
                                    {section.items.map((item) => {
                                        const Icon = item.icon;
                                        const isActive =
                                            pathname === item.href ||
                                            (item.href !== rootPath &&
                                                pathname.startsWith(item.href));

                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                className={cn(
                                                    "sidebar-link",
                                                    isActive && "active",
                                                )}
                                            >
                                                <Icon size={17} />
                                                <span>{item.label}</span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>
                </div>

                <div className="sidebar-footer">
                    {variant === "workspace" && currentUser ? (
                        <div className="sidebar-user-card">
                            <div className="sidebar-user-topline">
                                <Avatar className="sidebar-user-avatar">
                                    {currentUser.name
                                        ?.slice(0, 1)
                                        .toUpperCase()}
                                </Avatar>
                                <div className="sidebar-user-main">
                                    <div className="sidebar-user-name">
                                        {currentUser.name}
                                    </div>
                                    <div className="sidebar-user-id">
                                        @{currentUser.username}
                                    </div>
                                </div>
                            </div>

                            {currentUser.email ? (
                                <div className="sidebar-user-email">
                                    {currentUser.email}
                                </div>
                            ) : null}

                            <Space size={[8, 8]} wrap>
                                <Tag
                                    color={getPlatformRoleColor(
                                        currentUser.platformRole,
                                    )}
                                >
                                    {getPlatformRoleLabel(
                                        currentUser.platformRole,
                                    )}
                                </Tag>
                                {currentUser.projectRoles?.map((role) => (
                                    <Tag
                                        key={role}
                                        color={getProjectRoleColor(role)}
                                    >
                                        {getProjectRoleLabel(role)}
                                    </Tag>
                                ))}
                            </Space>

                            <div className="sidebar-logout">
                                <LogoutButton />
                            </div>
                        </div>
                    ) : (
                        <div className="sidebar-admin-actions">
                            {currentUser ? (
                                <div style={{ marginBottom: 12 }}>
                                    <div className="sidebar-user-name">
                                        {currentUser.name}
                                    </div>
                                    <div className="sidebar-user-id">
                                        @{currentUser.username}
                                    </div>
                                </div>
                            ) : null}
                            <div className="sidebar-logout">
                                <LogoutButton />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}
