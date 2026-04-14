"use client";

import Link from "next/link";
import { Avatar, Space, Tag } from "antd";
import {
    BrainCircuit,
    Bot,
    ClipboardCheck,
    Cpu,
    FileSearch,
    FolderKanban,
    LayoutDashboard,
    Layers3,
    ShieldCheck,
    PlugZap,
    ScrollText,
    SlidersHorizontal,
    UsersRound,
} from "lucide-react";
import { LogoutButton } from "@/components/layout/logout-button";
import { PersistedReviewListLink } from "@/components/reviews/persisted-review-list-link";
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
            { href: "/admin/ai", label: "AI 设置", icon: Cpu },
            {
                href: "/admin/ai-strategies",
                label: "AI 审核策略",
                icon: BrainCircuit,
            },
            {
                href: "/admin/review-tasks",
                label: "审核任务",
                icon: ClipboardCheck,
            },
            {
                href: "/admin/review-batches",
                label: "批量任务",
                icon: Layers3,
            },
            { href: "/admin/reviews", label: "审核记录", icon: FileSearch },
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
            {
                href: "/workspace/review-batches",
                label: "批量任务",
                icon: Bot,
            },
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

                      if (item.href === "/workspace/review-batches") {
                          return workspaceCapabilities?.canReview;
                      }

                      return true;
                  }),
              }));
    const rootPath = variant === "admin" ? "/admin" : "/workspace";
    const title =
        variant === "admin" ? "EvalCheck Admin" : "EvalCheck Workspace";
    const BrandIcon = variant === "admin" ? ShieldCheck : LayoutDashboard;

    return (
        <aside className="dashboard-sidebar">
            <div className="sidebar-shell">
                <div>
                    <div className="sidebar-header">
                        <div className="sidebar-brand">
                            <span className="sidebar-brand-mark">
                                <BrandIcon size={16} />
                            </span>
                            <span className="sidebar-eyebrow">EvalCheck</span>
                        </div>
                        <div className="sidebar-title">{title}</div>
                    </div>

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
                                        const linkProps = {
                                            href: item.href,
                                            className: cn(
                                                "sidebar-link",
                                                isActive && "active",
                                            ),
                                        };
                                        const content = (
                                            <>
                                                <span className="sidebar-link-icon">
                                                    <Icon size={16} />
                                                </span>
                                                <span>{item.label}</span>
                                            </>
                                        );

                                        if (
                                            item.href === "/admin/review-tasks" ||
                                            item.href === "/workspace/reviews"
                                        ) {
                                            return (
                                                <PersistedReviewListLink
                                                    key={item.href}
                                                    {...linkProps}
                                                    listPath={item.href}
                                                >
                                                    {content}
                                                </PersistedReviewListLink>
                                            );
                                        }

                                        return (
                                            <Link key={item.href} {...linkProps}>
                                                {content}
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
