import { prisma } from "@/lib/db/prisma";

export async function getCurrentUserRecord(userId: string) {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      status: true,
      platformRole: true,
      memberships: {
        select: {
          role: true,
        },
      },
    },
  });
}
