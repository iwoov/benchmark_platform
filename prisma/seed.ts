import bcrypt from "bcryptjs";
import {
  PrismaClient,
  PlatformRole,
  ProjectMemberRole,
  ProjectStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

function getRequiredEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function main() {
  const adminName = getRequiredEnv("ADMIN_NAME", "Platform Admin");
  const adminUsername = getRequiredEnv("ADMIN_USERNAME", "admin")
    .trim()
    .toLowerCase();
  const adminEmail = getRequiredEnv("ADMIN_EMAIL", "admin@example.com")
    .trim()
    .toLowerCase();
  const adminPassword = getRequiredEnv("ADMIN_PASSWORD", "admin123456");
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const existingAdmin = await prisma.user.findFirst({
    where: {
      OR: [{ username: adminUsername }, { email: adminEmail }],
    },
  });

  const admin = existingAdmin
    ? await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          username: adminUsername,
          name: adminName,
          email: adminEmail,
          passwordHash,
          platformRole: PlatformRole.PLATFORM_ADMIN,
        },
      })
    : await prisma.user.create({
        data: {
          username: adminUsername,
          email: adminEmail,
          name: adminName,
          passwordHash,
          platformRole: PlatformRole.PLATFORM_ADMIN,
        },
      });

  const project = await prisma.project.upsert({
    where: { code: "benchmark-demo" },
    update: {
      name: "Benchmark Demo",
      status: ProjectStatus.ACTIVE,
      createdById: admin.id,
    },
    create: {
      name: "Benchmark Demo",
      code: "benchmark-demo",
      description: "Default seed project for local development.",
      status: ProjectStatus.ACTIVE,
      createdById: admin.id,
    },
  });

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: project.id,
        userId: admin.id,
      },
    },
    update: {
      role: ProjectMemberRole.PROJECT_MANAGER,
    },
    create: {
      projectId: project.id,
      userId: admin.id,
      role: ProjectMemberRole.PROJECT_MANAGER,
    },
  });

  await prisma.projectDataSource.upsert({
    where: {
      id: "seed-datasource",
    },
    update: {
      name: "DingTalk Main Table",
      projectId: project.id,
      externalTableId: "table_demo",
    },
    create: {
      id: "seed-datasource",
      projectId: project.id,
      name: "DingTalk Main Table",
      externalTableId: "table_demo",
      fieldMapping: {
        title: "题目标题",
        content: "题目内容",
        answer: "参考答案",
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
