"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { isAdminRole } from "@/lib/auth/roles";

const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "项目名称至少 2 个字符")
    .max(80, "项目名称不能超过 80 个字符"),
  code: z
    .string()
    .trim()
    .min(2, "项目标识至少 2 个字符")
    .max(40, "项目标识不能超过 40 个字符")
    .regex(/^[a-zA-Z0-9._-]+$/, "项目标识仅支持字母、数字、点、下划线和短横线"),
  description: z
    .string()
    .trim()
    .max(300, "项目描述不能超过 300 个字符")
    .optional()
    .transform((value) => value || undefined),
});

export type CreateProjectFormState = {
  error?: string;
  success?: string;
};

export async function createProjectAction(
  _prevState: CreateProjectFormState,
  formData: FormData,
): Promise<CreateProjectFormState> {
  const session = await auth();

  if (!session?.user || !isAdminRole(session.user.platformRole)) {
    return {
      error: "只有超级管理员或平台管理员可以创建项目。",
    };
  }

  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "项目参数校验失败。",
    };
  }

  const code = parsed.data.code.toLowerCase();

  const existingProject = await prisma.project.findUnique({
    where: {
      code,
    },
    select: {
      id: true,
    },
  });

  if (existingProject) {
    return {
      error: "该项目标识已存在，请更换。",
    };
  }

  const project = await prisma.project.create({
    data: {
      name: parsed.data.name,
      code,
      description: parsed.data.description,
      createdById: session.user.id,
      status: "ACTIVE",
    },
    select: {
      name: true,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/projects");
  revalidatePath("/admin/datasources");
  revalidatePath("/workspace");
  revalidatePath("/workspace/projects");
  revalidatePath("/workspace/submissions");
  revalidatePath("/workspace/reviews");

  return {
    success: `项目 ${project.name} 已创建。`,
  };
}
