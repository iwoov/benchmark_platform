import { ProjectMemberRole } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export type ProjectMemberManagerScope = "PLATFORM_ADMIN" | "PROJECT_MANAGER";

export async function getProjectManagerScope(
  projectId: string,
): Promise<ProjectMemberManagerScope> {
  const session = await auth();

  if (!session?.user) {
    throw new Error("请先登录后再执行该操作。");
  }

  if (session.user.platformRole === "PLATFORM_ADMIN") {
    return "PLATFORM_ADMIN";
  }

  const membership = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId: session.user.id,
      },
    },
    select: {
      role: true,
    },
  });

  if (membership?.role !== ProjectMemberRole.PROJECT_MANAGER) {
    throw new Error("只有平台管理员或当前项目负责人可以管理项目成员。");
  }

  return "PROJECT_MANAGER";
}

export async function getProjectMemberManagerScope(
  projectId: string,
): Promise<ProjectMemberManagerScope> {
  return getProjectManagerScope(projectId);
}
