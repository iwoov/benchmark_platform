import { prisma } from "@/lib/db/prisma";
import { isAdminRole, type PlatformRoleValue } from "@/lib/auth/roles";
import {
  getAccessiblePrimaryValueSet,
  questionMatchesPrimaryValueScope,
} from "@/lib/subjects/access";

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

export async function canUserAccessQuestionByMetadata(
  userId: string,
  platformRole: PlatformRoleValue,
  metadata: unknown,
) {
  const allowedPrimaryValues = await getAccessiblePrimaryValueSet(
    userId,
    platformRole,
  );

  return questionMatchesPrimaryValueScope(metadata, allowedPrimaryValues);
}
