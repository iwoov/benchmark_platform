import { prisma } from "@/lib/db/prisma";
import { isAdminRole, type PlatformRoleValue } from "@/lib/auth/roles";

export async function canUserReviewProject(
  userId: string,
  platformRole: PlatformRoleValue,
  projectId: string,
) {
  if (isAdminRole(platformRole)) {
    return true;
  }

  if (!process.env.DATABASE_URL) {
    return false;
  }

  const membership = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId,
      },
    },
    select: {
      role: true,
    },
  });

  return membership?.role === "REVIEWER";
}
