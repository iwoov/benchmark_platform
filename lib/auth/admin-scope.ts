import { prisma } from "@/lib/db/prisma";
import type { PlatformRoleValue } from "@/lib/auth/roles";

export type AdminScopeOption = {
    id: string;
    name: string;
    username: string | null;
};

export async function resolveUserAdminScopeId(
    userId: string,
    platformRole: PlatformRoleValue,
) {
    if (!process.env.DATABASE_URL) {
        return null;
    }

    if (platformRole === "SUPER_ADMIN") {
        return null;
    }

    if (platformRole === "PLATFORM_ADMIN") {
        return userId;
    }

    const user = await prisma.user.findUnique({
        where: {
            id: userId,
        },
        select: {
            ownerAdminId: true,
        },
    });

    return user?.ownerAdminId ?? null;
}

export async function canAccessAdminScope(
    userId: string,
    platformRole: PlatformRoleValue,
    scopeAdminId: string,
) {
    if (platformRole === "SUPER_ADMIN") {
        return true;
    }

    const resolvedScopeAdminId = await resolveUserAdminScopeId(
        userId,
        platformRole,
    );

    return resolvedScopeAdminId === scopeAdminId;
}

export async function getPlatformAdminScopeOptions() {
    if (!process.env.DATABASE_URL) {
        return [] as AdminScopeOption[];
    }

    const admins = await prisma.user.findMany({
        where: {
            platformRole: {
                in: ["SUPER_ADMIN", "PLATFORM_ADMIN"],
            },
            status: "ACTIVE",
        },
        orderBy: [{ name: "asc" }, { username: "asc" }],
        select: {
            id: true,
            name: true,
            username: true,
        },
    });

    return admins satisfies AdminScopeOption[];
}

export async function getUserOwnerAdminOptions() {
    if (!process.env.DATABASE_URL) {
        return [] as AdminScopeOption[];
    }

    const admins = await prisma.user.findMany({
        where: {
            platformRole: "PLATFORM_ADMIN",
            status: "ACTIVE",
        },
        orderBy: [{ name: "asc" }, { username: "asc" }],
        select: {
            id: true,
            name: true,
            username: true,
        },
    });

    return admins satisfies AdminScopeOption[];
}

export async function getSuperAdminOptions() {
    if (!process.env.DATABASE_URL) {
        return [] as AdminScopeOption[];
    }

    const admins = await prisma.user.findMany({
        where: {
            platformRole: "SUPER_ADMIN",
            status: "ACTIVE",
        },
        orderBy: [{ name: "asc" }, { username: "asc" }],
        select: {
            id: true,
            name: true,
            username: true,
        },
    });

    return admins satisfies AdminScopeOption[];
}
