"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

const assignProjectMemberSchema = z.object({
  projectId: z.string().min(1, "缺少项目 ID"),
  userId: z.string().min(1, "请选择用户"),
  role: z.enum(["AUTHOR", "REVIEWER", "PROJECT_MANAGER"]),
});

const removeProjectMemberSchema = z.object({
  membershipId: z.string().min(1, "缺少成员 ID"),
});

export type ProjectMemberFormState = {
  error?: string;
  success?: string;
};

async function requireAdmin() {
  const session = await auth();

  if (session?.user.platformRole !== "PLATFORM_ADMIN") {
    throw new Error("只有平台管理员可以管理项目成员。");
  }

  return session;
}

export async function assignProjectMemberAction(
  _prevState: ProjectMemberFormState,
  formData: FormData,
): Promise<ProjectMemberFormState> {
  try {
    await requireAdmin();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "无权限执行该操作。",
    };
  }

  const parsed = assignProjectMemberSchema.safeParse({
    projectId: formData.get("projectId"),
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "表单校验失败。",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: {
      id: true,
      name: true,
      username: true,
      status: true,
      platformRole: true,
    },
  });

  if (!user || user.status !== "ACTIVE") {
    return {
      error: "用户不存在或已停用。",
    };
  }

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: parsed.data.projectId,
        userId: parsed.data.userId,
      },
    },
    update: {
      role: parsed.data.role,
    },
    create: {
      projectId: parsed.data.projectId,
      userId: parsed.data.userId,
      role: parsed.data.role,
    },
  });

  revalidatePath("/admin/projects");
  revalidatePath("/workspace");
  revalidatePath("/workspace/projects");
  revalidatePath("/workspace/submissions");
  revalidatePath("/workspace/reviews");

  return {
    success: `已将 ${user.name} 设为 ${parsed.data.role}。`,
  };
}

export async function removeProjectMemberAction(
  _prevState: ProjectMemberFormState,
  formData: FormData,
): Promise<ProjectMemberFormState> {
  try {
    await requireAdmin();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "无权限执行该操作。",
    };
  }

  const parsed = removeProjectMemberSchema.safeParse({
    membershipId: formData.get("membershipId"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "参数不完整。",
    };
  }

  const membership = await prisma.projectMember.findUnique({
    where: { id: parsed.data.membershipId },
    include: {
      user: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!membership) {
    return {
      error: "成员关系不存在。",
    };
  }

  await prisma.projectMember.delete({
    where: {
      id: parsed.data.membershipId,
    },
  });

  revalidatePath("/admin/projects");
  revalidatePath("/workspace");
  revalidatePath("/workspace/projects");
  revalidatePath("/workspace/submissions");
  revalidatePath("/workspace/reviews");

  return {
    success: `已移除 ${membership.user.name} 的项目成员关系。`,
  };
}
