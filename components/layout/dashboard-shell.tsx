"use client";

import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { PlatformRoleValue, ProjectRoleValue } from "@/lib/auth/roles";
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
        platformRole: PlatformRoleValue;
        projectRoles?: ProjectRoleValue[];
    };
    workspaceCapabilities?: {
        canAuthor: boolean;
        canReview: boolean;
    };
}) {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);

    const displayUser = currentUser ?? {
        username: session.user.username,
        name: session.user.name ?? "",
        email: session.user.email ?? null,
        platformRole: session.user.platformRole,
    };

    const closeMobile = () => setMobileOpen(false);

    return (
        <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[260px_1fr]">
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-30 bg-foreground/50 backdrop-blur-sm lg:hidden"
                    onClick={closeMobile}
                    aria-hidden
                />
            )}

            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-out",
                    "lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
                    mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
                )}
            >
                <div className="flex h-full flex-col">
                    <div className="flex items-center justify-end p-2 lg:hidden">
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="关闭菜单"
                            onClick={closeMobile}
                        >
                            <X size={16} />
                        </Button>
                    </div>
                    <Sidebar
                        pathname={pathname}
                        variant={variant}
                        currentUser={displayUser}
                        workspaceCapabilities={workspaceCapabilities}
                        onNavigate={closeMobile}
                    />
                </div>
            </aside>

            <div className="flex min-h-screen min-w-0 flex-col">
                <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md md:px-6">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="打开菜单"
                        onClick={() => setMobileOpen(true)}
                        className="lg:hidden"
                    >
                        <Menu size={16} />
                    </Button>

                    <nav aria-label="面包屑" className="hidden items-center gap-2 text-sm md:flex">
                        <span className="text-muted-foreground">
                            {variant === "admin" ? "EvalCheck 管理" : "EvalCheck 工作台"}
                        </span>
                    </nav>

                    <div className="ml-auto flex items-center gap-1">
                        <ThemeToggle />
                    </div>
                </header>

                <main className="flex-1 px-4 py-5 text-sm md:px-6 md:py-7 lg:px-8">
                    <div className="w-full min-w-0 animate-fade-in">{children}</div>
                </main>
            </div>
        </div>
    );
}
