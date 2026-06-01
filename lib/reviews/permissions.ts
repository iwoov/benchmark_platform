import { prisma } from "@/lib/db/prisma";
import { isAdminRole, type PlatformRoleValue } from "@/lib/auth/roles";
import {
  getAccessiblePrimaryValueSet,
  questionMatchesPrimaryValueScopeForProject,
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
  options?: {
    projectId?: string;
    projectCreatedById?: string | null;
  },
) {
  let projectCreatedById = options?.projectCreatedById;

  if (
    projectCreatedById === undefined &&
    options?.projectId &&
    process.env.DATABASE_URL
  ) {
    const project = await prisma.project.findUnique({
      where: {
        id: options.projectId,
      },
      select: {
        createdById: true,
      },
    });

    projectCreatedById = project?.createdById ?? null;
  }

  const allowedPrimaryValues = await getAccessiblePrimaryValueSet(
    userId,
    platformRole,
  );

  return questionMatchesPrimaryValueScopeForProject(
    metadata,
    allowedPrimaryValues,
    {
      userId,
      platformRole,
      projectCreatedById,
    },
  );
}
