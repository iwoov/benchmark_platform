"use client";

import Link from "next/link";
import {
  FolderKanban,
  LayoutDashboard,
  PlugZap,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const adminSections = [
  {
    title: "工作台",
    items: [{ href: "/admin", label: "概览", icon: LayoutDashboard }],
  },
  {
    title: "组织与权限",
    items: [
      { href: "/admin/users", label: "用户管理", icon: UsersRound },
      { href: "/admin/access", label: "权限控制", icon: ShieldCheck },
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
    title: "审核工作台",
    items: [{ href: "/admin/reviews", label: "审核记录", icon: ScrollText }],
  },
  {
    title: "个人",
    items: [
      { href: "/admin/settings", label: "账户设置", icon: SlidersHorizontal },
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
      { href: "/workspace/projects", label: "我的项目", icon: FolderKanban },
      { href: "/workspace/submissions", label: "出题任务", icon: PlugZap },
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
  workspaceCapabilities,
}: {
  pathname: string;
  variant: "admin" | "workspace";
  workspaceCapabilities?: {
    canAuthor: boolean;
    canReview: boolean;
  };
}) {
  const visibleSections =
    variant === "admin"
      ? adminSections
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
  const title = variant === "admin" ? "Admin Console" : "Expert Workspace";
  const copy =
    variant === "admin"
      ? "平台级配置、组织与数据源管理"
      : "出题、审核与项目协作工作台";

  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-shell">
        <div className="sidebar-header">
          <div className="sidebar-eyebrow">Benchmark Platform</div>
          <div className="sidebar-title">{title}</div>
          <div className="muted sidebar-copy">{copy}</div>
        </div>

        <nav className="sidebar-nav-groups">
          {visibleSections.map((section) => (
            <div key={section.title}>
              <div className="sidebar-group-title">{section.title}</div>

              <div style={{ display: "grid", gap: 6 }}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    (item.href !== rootPath && pathname.startsWith(item.href));

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn("sidebar-link", isActive && "active")}
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
    </aside>
  );
}
