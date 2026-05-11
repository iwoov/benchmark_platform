import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { isAdminRole } from "@/lib/auth/roles";

export type ProjectMemberManagerScope = "SUPER_ADMIN" | "PLATFORM_ADMIN";

export async function getProjectManagerScope(
    projectId: string,
): Promise<ProjectMemberManagerScope> {
    const session = await auth();

    if (!session?.user) {
        throw new Error("请先登录后再执行该操作。");
    }

    if (!isAdminRole(session.user.platformRole)) {
        throw new Error(
            "只有超级管理员或平台管理员可以管理项目成员和数据导入。",
        );
    }

    if (session.user.platformRole === "PLATFORM_ADMIN") {
        const project = await prisma.project.findUnique({
            where: {
                id: projectId,
            },
            select: {
                createdById: true,
            },
        });

        if (!project) {
            throw new Error("项目不存在。");
        }

        if (project.createdById !== session.user.id) {
            throw new Error("平台管理员只能操作自己创建的项目。");
        }
    }

    return session.user.platformRole;
}

export async function getProjectMemberManagerScope(
    projectId: string,
): Promise<ProjectMemberManagerScope> {
    return getProjectManagerScope(projectId);
}
