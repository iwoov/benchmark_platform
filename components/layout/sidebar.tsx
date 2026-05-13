"use client";

import Image from "next/image";
import Link from "next/link";
import {
    BrainCircuit,
    Bot,
    ClipboardCheck,
    Cpu,
    FileSearch,
    FolderKanban,
    LayoutDashboard,
    Layers3,
    PlugZap,
    ScrollText,
    SlidersHorizontal,
    Sparkles,
    UsersRound,
    type LucideIcon,
} from "lucide-react";
import { LogoutButton } from "@/components/layout/logout-button";
import { PersistedReviewListLink } from "@/components/reviews/persisted-review-list-link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
    getPlatformRoleLabel,
    getPlatformRoleVariant,
    getProjectRoleLabel,
    getProjectRoleVariant,
} from "@/lib/auth/role-display";
import type { PlatformRoleValue, ProjectRoleValue } from "@/lib/auth/roles";
import { isSuperAdminRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils/cn";

type NavItem = {
    href: string;
    label: string;
    icon: LucideIcon;
};

type NavSection = {
    title: string;
    items: NavItem[];
};

const adminSections: NavSection[] = [
    {
        title: "工作台",
        items: [{ href: "/admin", label: "概览", icon: LayoutDashboard }],
    },
    {
        title: "组织与权限",
        items: [
            { href: "/admin/users", label: "用户管理", icon: UsersRound },
            { href: "/admin/subjects", label: "学科管理", icon: ScrollText },
        ],
    },
    {
        title: "项目与数据源",
        items: [
            { href: "/admin/projects", label: "项目管理", icon: FolderKanban },
            { href: "/admin/datasources", label: "数据源", icon: PlugZap },
        ],
    },
    {
        title: "AI 配置",
        items: [
            { href: "/admin/ai/models", label: "模型路由", icon: Cpu },
            { href: "/admin/ai/routes", label: "供应商", icon: PlugZap },
            { href: "/admin/ai-strategies", label: "AI 策略", icon: BrainCircuit },
        ],
    },
    {
        title: "数据工作台",
        items: [
            { href: "/admin/review-tasks", label: "数据质检", icon: ClipboardCheck },
            { href: "/admin/data-cleaning", label: "数据清洗", icon: Sparkles },
            { href: "/admin/review-batches", label: "批量任务", icon: Layers3 },
            { href: "/admin/reviews", label: "审核记录", icon: FileSearch },
        ],
    },
    {
        title: "个人",
        items: [{ href: "/admin/settings", label: "账户设置", icon: SlidersHorizontal }],
    },
];

const workspaceSections: NavSection[] = [
    {
        title: "工作台",
        items: [{ href: "/workspace", label: "概览", icon: LayoutDashboard }],
    },
    {
        title: "项目协作",
        items: [
            { href: "/workspace/projects", label: "我的项目", icon: FolderKanban },
            { href: "/workspace/submissions", label: "出题任务", icon: PlugZap },
            { href: "/workspace/reviews", label: "数据质检", icon: ScrollText },
            { href: "/workspace/data-cleaning", label: "数据清洗", icon: Sparkles },
            { href: "/workspace/review-batches", label: "批量任务", icon: Bot },
        ],
    },
    {
        title: "个人",
        items: [{ href: "/workspace/settings", label: "账户设置", icon: SlidersHorizontal }],
    },
];

const PERSISTED_REVIEW_PATHS = new Set([
    "/admin/review-tasks",
    "/admin/data-cleaning",
    "/workspace/reviews",
    "/workspace/data-cleaning",
]);

export function Sidebar({
    pathname,
    variant,
    currentUser,
    workspaceCapabilities,
    onNavigate,
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
    onNavigate?: () => void;
}) {
    const visibleSections =
        variant === "admin"
            ? adminSections.map((section) => ({
                  ...section,
                  items: section.items.filter((item) =>
                      item.href === "/admin/ai/models" ||
                      item.href === "/admin/ai/routes" ||
                      item.href === "/admin/subjects"
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
                      if (
                          item.href === "/workspace/reviews" ||
                          item.href === "/workspace/data-cleaning" ||
                          item.href === "/workspace/review-batches"
                      ) {
                          return workspaceCapabilities?.canReview;
                      }
                      return true;
                  }),
              }));

    const rootPath = variant === "admin" ? "/admin" : "/workspace";
    const title = variant === "admin" ? "EvalCheck Admin" : "EvalCheck Workspace";

    return (
        <div className="flex h-full flex-col gap-5 p-4">
            <div className="flex items-center gap-3 px-1">
                <span className="grid h-10 w-10 place-items-center rounded-lg border border-sidebar-border bg-white shadow-md">
                    <Image src="/icon.svg" alt="" width={28} height={28} priority aria-hidden />
                </span>
                <div className="leading-tight">
                    <strong className="block text-sm font-semibold tracking-tight text-sidebar-foreground">
                        {title}
                    </strong>
                    <small className="text-xs text-sidebar-muted">EvalCheck</small>
                </div>
            </div>

            <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
                {visibleSections.map((section) => (
                    <div key={section.title} className="space-y-1">
                        <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
                            {section.title}
                        </div>
                        <div className="flex flex-col gap-0.5">
                            {section.items.map((item) => {
                                const Icon = item.icon;
                                const isActive =
                                    pathname === item.href ||
                                    (item.href !== rootPath && pathname.startsWith(item.href));

                                const className = cn(
                                    "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                                    "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                    isActive &&
                                        "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs",
                                );

                                const content = (
                                    <>
                                        <span
                                            className={cn(
                                                "absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-active transition-opacity",
                                                isActive ? "opacity-100" : "opacity-0",
                                            )}
                                            aria-hidden
                                        />
                                        <Icon
                                            size={16}
                                            className={cn(
                                                "shrink-0 transition-colors",
                                                isActive
                                                    ? "text-sidebar-active"
                                                    : "text-sidebar-muted group-hover:text-sidebar-accent-foreground",
                                            )}
                                            aria-hidden
                                        />
                                        <span className="flex-1 truncate">{item.label}</span>
                                    </>
                                );

                                if (PERSISTED_REVIEW_PATHS.has(item.href)) {
                                    return (
                                        <PersistedReviewListLink
                                            key={item.href}
                                            href={item.href}
                                            listPath={item.href}
                                            className={className}
                                            onClick={onNavigate}
                                        >
                                            {content}
                                        </PersistedReviewListLink>
                                    );
                                }

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={className}
                                        onClick={onNavigate}
                                    >
                                        {content}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {currentUser && (
                <div className="mt-auto space-y-3">
                    <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
                        <div className="flex items-center gap-3">
                            <Avatar size={36} fallback={currentUser.name} />
                            <div className="min-w-0 flex-1 leading-tight">
                                <p className="truncate text-sm font-medium text-sidebar-foreground">
                                    {currentUser.name}
                                </p>
                                <p className="truncate text-xs text-sidebar-muted">
                                    @{currentUser.username}
                                </p>
                            </div>
                        </div>

                        {currentUser.email && (
                            <p className="mt-2 truncate text-xs text-sidebar-muted">
                                {currentUser.email}
                            </p>
                        )}

                        <div className="mt-3 flex flex-wrap gap-1.5">
                            <Badge variant={getPlatformRoleVariant(currentUser.platformRole)} size="sm">
                                {getPlatformRoleLabel(currentUser.platformRole)}
                            </Badge>
                            {currentUser.projectRoles?.map((role) => (
                                <Badge key={role} variant={getProjectRoleVariant(role)} size="sm">
                                    {getProjectRoleLabel(role)}
                                </Badge>
                            ))}
                        </div>

                        <div className="mt-3">
                            <LogoutButton />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
