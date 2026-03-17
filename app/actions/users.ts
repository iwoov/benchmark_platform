"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "用户名至少 3 个字符")
    .max(32, "用户名不能超过 32 个字符")
    .regex(/^[a-zA-Z0-9._-]+$/, "用户名仅支持字母、数字、点、下划线和短横线"),
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
  platformRole: z.enum(["PLATFORM_ADMIN", "USER"]),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

const updateUserSchema = z.object({
  userId: z.string().min(1, "缺少用户 ID"),
  username: z
    .string()
    .trim()
    .min(3, "用户名至少 3 个字符")
    .max(32, "用户名不能超过 32 个字符")
    .regex(/^[a-zA-Z0-9._-]+$/, "用户名仅支持字母、数字、点、下划线和短横线"),
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
  platformRole: z.enum(["PLATFORM_ADMIN", "USER"]),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export type CreateUserFormState = {
  error?: string;
  success?: string;
};

export async function createUserAction(
  _prevState: CreateUserFormState,
  formData: FormData,
): Promise<CreateUserFormState> {
  const session = await auth();

  if (session?.user.platformRole !== "PLATFORM_ADMIN") {
    return {
      error: "只有平台管理员可以创建用户。",
    };
  }

  const parsed = createUserSchema.safeParse({
    username: formData.get("username"),
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    password: formData.get("password"),
    platformRole: formData.get("platformRole"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "表单校验失败，请检查输入内容。",
    };
  }

  const username = parsed.data.username.toLowerCase();
  const email = parsed.data.email;

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

  if (session?.user.platformRole !== "PLATFORM_ADMIN") {
    return {
      error: "只有平台管理员可以编辑用户。",
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
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "表单校验失败，请检查输入内容。",
    };
  }

  const username = parsed.data.username.toLowerCase();
  const email = parsed.data.email;

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: {
      id: true,
      passwordHash: true,
    },
  });

  if (!user) {
    return {
      error: "用户不存在。",
    };
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
