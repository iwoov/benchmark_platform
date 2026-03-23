import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProjectDatasourceConsole } from "@/components/dashboard/project-datasource-console";
import { ProjectMembersManager } from "@/components/dashboard/project-members-manager";
import { readOriginalFileName } from "@/lib/datasources/sync-config";
import { prisma } from "@/lib/db/prisma";
import { getWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

export default async function WorkspaceManagePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const workspaceContext = await getWorkspaceContext(session.user.id);

  if (!workspaceContext.canManageProjects) {
    redirect("/workspace");
  }

  let projects: Array<{
    id: string;
    name: string;
    code: string;
    status: string;
    datasourcesCount: number;
    members: Array<{
      id: string;
      role: "AUTHOR" | "REVIEWER" | "PROJECT_MANAGER";
      joinedAt: string;
      user: {
        id: string;
        username: string | null;
        name: string;
        email: string | null;
        status: "ACTIVE" | "INACTIVE";
      };
    }>;
  }> = [];
  let users: Array<{
    id: string;
    username: string | null;
    name: string;
    email: string | null;
    status: "ACTIVE" | "INACTIVE";
  }> = [];
  let datasources: Array<{
    id: string;
    name: string;
    type: "DINGTALK_BITABLE" | "JSON_UPLOAD" | "EXCEL_UPLOAD";
    status: "ACTIVE" | "INACTIVE";
    createdAt: string;
    questionCount: number;
    project: {
      id: string;
      name: string;
      code: string;
    };
    originalFileName?: string | null;
    lastSyncAt?: string | null;
    lastSyncStatus?: "SUCCESS" | "FAILED" | null;
  }> = [];

  if (process.env.DATABASE_URL) {
    const managedProjects = await prisma.project.findMany({
      where: {
        status: "ACTIVE",
        members: {
          some: {
            userId: session.user.id,
            role: "PROJECT_MANAGER",
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                email: true,
                status: true,
              },
            },
          },
        },
        datasources: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    projects = managedProjects.map((project) => ({
      id: project.id,
      name: project.name,
      code: project.code,
      status: project.status,
      datasourcesCount: project.datasources.length,
      members: project.members.map((member) => ({
        id: member.id,
        role: member.role,
        joinedAt: member.joinedAt.toLocaleString("zh-CN"),
        user: {
          id: member.user.id,
          username: member.user.username,
          name: member.user.name,
          email: member.user.email,
          status: member.user.status,
        },
      })),
    }));

    users = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        status: true,
      },
    });

    datasources = (
      await prisma.projectDataSource.findMany({
        where: {
          projectId: {
            in: projects.map((project) => project.id),
          },
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          _count: {
            select: {
              questions: true,
            },
          },
          syncLogs: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
            select: {
              createdAt: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })
    ).map((datasource) => ({
      id: datasource.id,
      name: datasource.name,
      type: datasource.type,
      status: datasource.status,
      createdAt: datasource.createdAt.toLocaleString("zh-CN"),
      questionCount: datasource._count.questions,
      project: datasource.project,
      originalFileName: readOriginalFileName(datasource.syncConfig),
      lastSyncAt:
        datasource.syncLogs[0]?.createdAt.toLocaleString("zh-CN") ?? null,
      lastSyncStatus: datasource.syncLogs[0]?.status ?? null,
    }));
  }

  return (
    <>
      <ProjectDatasourceConsole
        title="项目数据导入"
        description="项目负责人可以为自己负责的项目导入 JSON 和 Excel 数据，系统会自动创建项目数据源并写入题目主表。"
        projects={projects.map((project) => ({
          id: project.id,
          name: project.name,
          code: project.code,
        }))}
        datasources={datasources}
      />

      <section className="content-surface">
        <div className="section-head">
          <div>
            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
              项目成员管理
            </h2>
            <p
              className="muted"
              style={{ margin: "10px 0 0", lineHeight: 1.7 }}
            >
              项目负责人可以在自己负责的项目内分配出题用户和审核用户。平台账号与项目负责人角色仍由平台管理员统一维护。
            </p>
          </div>
        </div>

        <ProjectMembersManager
          projects={projects}
          users={users}
          canManageProjectManagerRole={false}
        />
      </section>
    </>
  );
}
