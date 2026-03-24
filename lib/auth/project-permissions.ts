import { auth } from "@/auth";
import { isAdminRole } from "@/lib/auth/roles";

export type ProjectMemberManagerScope = "SUPER_ADMIN" | "PLATFORM_ADMIN";

export async function getProjectManagerScope(
    _projectId: string,
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

    return session.user.platformRole;
}

export async function getProjectMemberManagerScope(
    projectId: string,
): Promise<ProjectMemberManagerScope> {
    return getProjectManagerScope(projectId);
}
