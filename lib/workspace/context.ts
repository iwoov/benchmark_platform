import { ProjectMemberRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function getWorkspaceContext(userId: string) {
  const memberships = process.env.DATABASE_URL
    ? await prisma.projectMember.findMany({
        where: {
          userId,
          project: {
            status: "ACTIVE",
          },
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              code: true,
              description: true,
              status: true,
            },
          },
        },
        orderBy: {
          joinedAt: "desc",
        },
      })
    : [];

  const authorProjects = memberships.filter(
    (membership) => membership.role === ProjectMemberRole.AUTHOR,
  );
  const reviewerProjects = memberships.filter(
    (membership) => membership.role === ProjectMemberRole.REVIEWER,
  );

  return {
    memberships,
    projectCount: memberships.length,
    authorProjects,
    reviewerProjects,
    authorProjectCount: authorProjects.length,
    reviewerProjectCount: reviewerProjects.length,
    canAuthor: authorProjects.length > 0,
    canReview: reviewerProjects.length > 0,
  };
}
