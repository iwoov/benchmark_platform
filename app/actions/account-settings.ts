"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import type { PlatformRoleValue } from "@/lib/auth/roles";
import { isAdminRole } from "@/lib/auth/roles";

const profileSchema = z.object({
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
});

const passwordSchema = z
    .object({
        currentPassword: z.string().min(1, "请输入当前密码"),
        newPassword: z
            .string()
            .min(8, "新密码至少 8 位")
            .max(64, "新密码不能超过 64 位"),
        confirmPassword: z.string().min(8, "请再次输入新密码"),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: "两次输入的新密码不一致",
        path: ["confirmPassword"],
    });

export type AccountFormState = {
    error?: string;
    success?: string;
};

function revalidateAccountPaths(platformRole: PlatformRoleValue) {
    if (isAdminRole(platformRole)) {
        revalidatePath("/admin");
        revalidatePath("/admin/settings");
        revalidatePath("/admin/users");
        revalidatePath("/admin/projects");
        return;
    }

    revalidatePath("/workspace");
    revalidatePath("/workspace/settings");
    revalidatePath("/workspace/projects");
    revalidatePath("/workspace/submissions");
    revalidatePath("/workspace/reviews");
}

export async function updateOwnProfileAction(
    _prevState: AccountFormState,
    formData: FormData,
): Promise<AccountFormState> {
    const session = await auth();

    if (!session?.user) {
        return {
            error: "登录状态已失效，请重新登录。",
        };
    }

    const parsed = profileSchema.safeParse({
        username: formData.get("username"),
        name: formData.get("name"),
        email: formData.get("email") || undefined,
    });

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "表单校验失败。",
        };
    }

    const username = parsed.data.username.toLowerCase();
    const email = parsed.data.email;

    const existingByUsername = await prisma.user.findFirst({
        where: {
            username,
            NOT: {
                id: session.user.id,
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
                    id: session.user.id,
                },
            },
        });

        if (existingByEmail) {
            return {
                error: "该邮箱已存在，请更换。",
            };
        }
    }

    await prisma.user.update({
        where: {
            id: session.user.id,
        },
        data: {
            username,
            name: parsed.data.name,
            email,
        },
    });

    revalidateAccountPaths(session.user.platformRole);

    return {
        success: "账户资料已更新。",
    };
}

export async function updateOwnPasswordAction(
    _prevState: AccountFormState,
    formData: FormData,
): Promise<AccountFormState> {
    const session = await auth();

    if (!session?.user) {
        return {
            error: "登录状态已失效，请重新登录。",
        };
    }

    const parsed = passwordSchema.safeParse({
        currentPassword: formData.get("currentPassword"),
        newPassword: formData.get("newPassword"),
        confirmPassword: formData.get("confirmPassword"),
    });

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "表单校验失败。",
        };
    }

    const user = await prisma.user.findUnique({
        where: {
            id: session.user.id,
        },
        select: {
            passwordHash: true,
        },
    });

    if (!user) {
        return {
            error: "用户不存在。",
        };
    }

    const isValid = await bcrypt.compare(
        parsed.data.currentPassword,
        user.passwordHash,
    );

    if (!isValid) {
        return {
            error: "当前密码错误。",
        };
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);

    await prisma.user.update({
        where: {
            id: session.user.id,
        },
        data: {
            passwordHash,
        },
    });

    revalidateAccountPaths(session.user.platformRole);

    return {
        success: "密码已更新，下次登录请使用新密码。",
    };
}
