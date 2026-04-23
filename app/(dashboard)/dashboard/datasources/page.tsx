import { prisma } from "@/lib/db/prisma";
import { ProjectDatasourceConsole } from "@/components/dashboard/project-datasource-console";
import {
    readOriginalFileName,
    readRawFieldOrder,
    readImageFields,
    readImageCount,
} from "@/lib/datasources/sync-config";

export const dynamic = "force-dynamic";

export default async function DataSourcesPage() {
    const projects = process.env.DATABASE_URL
        ? await prisma.project.findMany({
              where: {
                  status: "ACTIVE",
              },
              orderBy: {
                  createdAt: "desc",
              },
              select: {
                  id: true,
                  name: true,
                  code: true,
              },
          })
        : [];

    const datasources = process.env.DATABASE_URL
        ? await prisma.projectDataSource.findMany({
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
        : [];

    return (
        <ProjectDatasourceConsole
            title="数据源"
            description="导入项目数据源并跟踪同步状态。"
            projects={projects}
            datasources={datasources.map((datasource) => ({
                id: datasource.id,
                name: datasource.name,
                type: datasource.type,
                status: datasource.status,
                createdAt: datasource.createdAt.toLocaleString("zh-CN"),
                questionCount: datasource._count.questions,
                project: datasource.project,
                originalFileName: readOriginalFileName(datasource.syncConfig),
                rawFieldOrder: readRawFieldOrder(datasource.syncConfig),
                imageFields: readImageFields(datasource.syncConfig),
                imageCount: readImageCount(datasource.syncConfig),
                lastSyncAt:
                    datasource.syncLogs[0]?.createdAt.toLocaleString("zh-CN") ??
                    null,
                lastSyncStatus: datasource.syncLogs[0]?.status ?? null,
            }))}
        />
    );
}
