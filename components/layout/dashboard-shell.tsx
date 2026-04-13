"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
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
                <main className="dashboard-content">{children}</main>
            </div>
        </div>
    );
}
