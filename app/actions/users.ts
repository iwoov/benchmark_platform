"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import {
    isAdminRole,
    isSuperAdminRole,
    type PlatformRoleValue,
} from "@/lib/auth/roles";

const createUserSchema = z.object({
    username: z
        .string()
        .trim()
        .min(3, "用户名至少 3 个字符")
        .max(32, "用户名不能超过 32 个字符")
        .regex(
            /^[a-zA-Z0-9._-]+$/,
            "用户名仅支持字母、数字、点、下划线和短横线",
        ),
    name: z
        .string()
        .trim()
        .min(2, "姓名至少 2 个字符")
        .max(50, "姓名不能超过 50 个字符"),
    email: z
        .string()
        .trim()
        .optional()
        .transform((value) => (value ? value.toLowerCase() : undefined))
        .refine(
            (value) => !value || z.email().safeParse(value).success,
            "邮箱格式不正确",
        ),
    password: z.string().min(8, "密码至少 8 位").max(64, "密码不能超过 64 位"),
    platformRole: z.enum(["SUPER_ADMIN", "PLATFORM_ADMIN", "USER"]),
    status: z.enum(["ACTIVE", "INACTIVE"]),
    ownerAdminId: z
        .string()
        .trim()
        .optional()
        .transform((value) => value || undefined),
});

const updateUserSchema = z.object({
    userId: z.string().min(1, "缺少用户 ID"),
    username: z
        .string()
        .trim()
        .min(3, "用户名至少 3 个字符")
        .max(32, "用户名不能超过 32 个字符")
        .regex(
            /^[a-zA-Z0-9._-]+$/,
            "用户名仅支持字母、数字、点、下划线和短横线",
        ),
    name: z
        .string()
        .trim()
        .min(2, "姓名至少 2 个字符")
        .max(50, "姓名不能超过 50 个字符"),
    email: z
        .string()
        .trim()
        .optional()
        .transform((value) => (value ? value.toLowerCase() : undefined))
        .refine(
            (value) => !value || z.email().safeParse(value).success,
            "邮箱格式不正确",
        ),
    password: z
        .string()
        .trim()
        .optional()
        .refine((value) => !value || value.length >= 8, "新密码至少 8 位"),
    platformRole: z.enum(["SUPER_ADMIN", "PLATFORM_ADMIN", "USER"]),
    status: z.enum(["ACTIVE", "INACTIVE"]),
    ownerAdminId: z
        .string()
        .trim()
        .optional()
        .transform((value) => value || undefined),
});

export type CreateUserFormState = {
    error?: string;
    success?: string;
};

function canManageAdminRoles(platformRole: PlatformRoleValue) {
    return isSuperAdminRole(platformRole);
}

export async function createUserAction(
    _prevState: CreateUserFormState,
    formData: FormData,
): Promise<CreateUserFormState> {
    const session = await auth();

    if (!isAdminRole(session?.user.platformRole)) {
        return {
            error: "只有超级管理员或平台管理员可以创建用户。",
        };
    }

    const parsed = createUserSchema.safeParse({
        username: formData.get("username"),
        name: formData.get("name"),
        email: formData.get("email") || undefined,
        password: formData.get("password"),
        platformRole: formData.get("platformRole"),
        status: formData.get("status"),
        ownerAdminId: formData.get("ownerAdminId") || undefined,
    });

    if (!parsed.success) {
        return {
            error:
                parsed.error.issues[0]?.message ??
                "表单校验失败，请检查输入内容。",
        };
    }

    const username = parsed.data.username.toLowerCase();
    const email = parsed.data.email;
    const currentPlatformRole = session.user.platformRole;

    if (
        !canManageAdminRoles(currentPlatformRole) &&
        parsed.data.platformRole !== "USER"
    ) {
        return {
            error: "只有超级管理员可以创建管理员账号。",
        };
    }

    let ownerAdminId: string | null = null;

    if (parsed.data.platformRole === "PLATFORM_ADMIN") {
        if (currentPlatformRole !== "SUPER_ADMIN") {
            return {
                error: "只有超级管理员可以创建平台管理员。",
            };
        }

        ownerAdminId = session.user.id;
    } else if (parsed.data.platformRole === "USER") {
        if (currentPlatformRole === "PLATFORM_ADMIN") {
            ownerAdminId = session.user.id;
        } else {
            if (!parsed.data.ownerAdminId) {
                return {
                    error: "请为普通用户选择所属管理员。",
                };
            }

            const ownerAdmin = await prisma.user.findFirst({
                where: {
                    id: parsed.data.ownerAdminId,
                    platformRole: "PLATFORM_ADMIN",
                },
                select: {
                    id: true,
                },
            });

            if (!ownerAdmin) {
                return {
                    error: "所属管理员不存在，请刷新后重试。",
                };
            }

            ownerAdminId = ownerAdmin.id;
        }
    }

    const existingByUsername = await prisma.user.findUnique({
        where: { username },
    });

    if (existingByUsername) {
        return {
            error: "该用户名已存在，请更换。",
        };
    }

    if (email) {
        const existingByEmail = await prisma.user.findUnique({
            where: { email },
        });

        if (existingByEmail) {
            return {
                error: "该邮箱已存在，请更换。",
            };
        }
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    await prisma.user.create({
        data: {
            username,
            name: parsed.data.name,
            email,
            passwordHash,
            platformRole: parsed.data.platformRole,
            status: parsed.data.status,
            ownerAdminId,
        },
    });

    revalidatePath("/admin/users");

    return {
        success: `用户 ${username} 已创建。`,
    };
}

export async function updateUserAction(
    _prevState: CreateUserFormState,
    formData: FormData,
): Promise<CreateUserFormState> {
    const session = await auth();

    if (!isAdminRole(session?.user.platformRole)) {
        return {
            error: "只有超级管理员或平台管理员可以编辑用户。",
        };
    }

    const parsed = updateUserSchema.safeParse({
        userId: formData.get("userId"),
        username: formData.get("username"),
        name: formData.get("name"),
        email: formData.get("email") || undefined,
        password: formData.get("password") || undefined,
        platformRole: formData.get("platformRole"),
        status: formData.get("status"),
        ownerAdminId: formData.get("ownerAdminId") || undefined,
    });

    if (!parsed.success) {
        return {
            error:
                parsed.error.issues[0]?.message ??
                "表单校验失败，请检查输入内容。",
        };
    }

    const username = parsed.data.username.toLowerCase();
    const email = parsed.data.email;

    const user = await prisma.user.findUnique({
        where: { id: parsed.data.userId },
        select: {
            id: true,
            passwordHash: true,
            platformRole: true,
            status: true,
            ownerAdminId: true,
        },
    });

    if (!user) {
        return {
            error: "用户不存在。",
        };
    }

    const currentPlatformRole = session.user.platformRole;

    if (!canManageAdminRoles(currentPlatformRole)) {
        if (user.platformRole === "USER") {
            if (user.ownerAdminId !== session.user.id) {
                return {
                    error: "你只能编辑自己名下的普通用户。",
                };
            }
        } else if (user.id !== session.user.id) {
            return {
                error: "只有超级管理员可以编辑其他管理员账号。",
            };
        }
    }

    if (
        !canManageAdminRoles(currentPlatformRole) &&
        user.platformRole !== "USER" &&
        user.id !== session.user.id
    ) {
        return {
            error: "只有超级管理员可以编辑管理员账号。",
        };
    }

    if (
        !canManageAdminRoles(currentPlatformRole) &&
        parsed.data.platformRole !== "USER" &&
        user.id !== session.user.id
    ) {
        return {
            error: "只有超级管理员可以调整管理员角色。",
        };
    }

    if (
        !canManageAdminRoles(currentPlatformRole) &&
        parsed.data.platformRole !== user.platformRole
    ) {
        return {
            error: "你不能修改当前账号的平台角色。",
        };
    }

    if (
        user.platformRole === "SUPER_ADMIN" &&
        (parsed.data.platformRole !== "SUPER_ADMIN" ||
            parsed.data.status !== "ACTIVE")
    ) {
        const superAdminCount = await prisma.user.count({
            where: {
                platformRole: "SUPER_ADMIN",
                status: "ACTIVE",
            },
        });

        if (user.status === "ACTIVE" && superAdminCount <= 1) {
            return {
                error: "系统至少保留一个启用中的超级管理员。",
            };
        }
    }

    const existingByUsername = await prisma.user.findFirst({
        where: {
            username,
            NOT: {
                id: parsed.data.userId,
            },
        },
    });

    if (existingByUsername) {
        return {
            error: "该用户名已存在，请更换。",
        };
    }

    if (email) {
        const existingByEmail = await prisma.user.findFirst({
            where: {
                email,
                NOT: {
                    id: parsed.data.userId,
                },
            },
        });

        if (existingByEmail) {
            return {
                error: "该邮箱已存在，请更换。",
            };
        }
    }

    const passwordHash = parsed.data.password
        ? await bcrypt.hash(parsed.data.password, 10)
        : user.passwordHash;

    let ownerAdminId: string | null = null;

    if (parsed.data.platformRole === "PLATFORM_ADMIN") {
        ownerAdminId = user.ownerAdminId ?? session.user.id;
    } else if (parsed.data.platformRole === "USER") {
        if (currentPlatformRole === "PLATFORM_ADMIN") {
            ownerAdminId = session.user.id;
        } else {
            if (!parsed.data.ownerAdminId) {
                return {
                    error: "请为普通用户选择所属管理员。",
                };
            }

            const ownerAdmin = await prisma.user.findFirst({
                where: {
                    id: parsed.data.ownerAdminId,
                    platformRole: "PLATFORM_ADMIN",
                },
                select: {
                    id: true,
                },
            });

            if (!ownerAdmin) {
                return {
                    error: "所属管理员不存在，请刷新后重试。",
                };
            }

            ownerAdminId = ownerAdmin.id;
        }
    }

    await prisma.user.update({
        where: {
            id: parsed.data.userId,
        },
        data: {
            username,
            name: parsed.data.name,
            email,
            passwordHash,
            platformRole: parsed.data.platformRole,
            status: parsed.data.status,
            ownerAdminId,
        },
    });

    revalidatePath("/admin/users");
    revalidatePath("/admin/projects");
    revalidatePath("/workspace");
    revalidatePath("/workspace/projects");
    revalidatePath("/workspace/submissions");
    revalidatePath("/workspace/reviews");

    return {
        success: `用户 ${username} 已更新。`,
    };
}
