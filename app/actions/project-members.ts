"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getProjectMemberManagerScope } from "@/lib/auth/project-permissions";

const assignProjectMemberSchema = z.object({
    projectId: z.string().min(1, "缺少项目 ID"),
    userId: z.string().min(1, "请选择用户"),
    role: z.enum(["AUTHOR", "REVIEWER"]),
});

const removeProjectMemberSchema = z.object({
    membershipId: z.string().min(1, "缺少成员 ID"),
});

export type ProjectMemberFormState = {
    error?: string;
    success?: string;
};

export async function assignProjectMemberAction(
    _prevState: ProjectMemberFormState,
    formData: FormData,
): Promise<ProjectMemberFormState> {
    const parsed = assignProjectMemberSchema.safeParse({
        projectId: formData.get("projectId"),
        userId: formData.get("userId"),
        role: formData.get("role"),
    });

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "表单校验失败。",
        };
    }

    try {
        await getProjectMemberManagerScope(parsed.data.projectId);
    } catch (error) {
        return {
            error:
                error instanceof Error ? error.message : "无权限执行该操作。",
        };
    }

    const project = await prisma.project.findUnique({
        where: { id: parsed.data.projectId },
        select: {
            id: true,
            name: true,
        },
    });

    if (!project) {
        return {
            error: "项目不存在。",
        };
    }

    const user = await prisma.user.findUnique({
        where: { id: parsed.data.userId },
        select: {
            id: true,
            name: true,
            username: true,
            status: true,
            platformRole: true,
        },
    });

    if (!user || user.status !== "ACTIVE") {
        return {
            error: "用户不存在或已停用。",
        };
    }

    if (user.platformRole !== "USER") {
        return {
            error: "项目协作角色只能分配给普通账号。",
        };
    }

    await prisma.projectMember.upsert({
        where: {
            projectId_userId: {
                projectId: parsed.data.projectId,
                userId: parsed.data.userId,
            },
        },
        update: {
            role: parsed.data.role,
        },
        create: {
            projectId: parsed.data.projectId,
            userId: parsed.data.userId,
            role: parsed.data.role,
        },
    });

    revalidatePath("/admin/projects");
    revalidatePath("/workspace");
    revalidatePath("/workspace/projects");
    revalidatePath("/workspace/submissions");
    revalidatePath("/workspace/reviews");

    return {
        success: `已在项目 ${project.name} 中更新 ${user.name} 的成员角色。`,
    };
}

export async function removeProjectMemberAction(
    _prevState: ProjectMemberFormState,
    formData: FormData,
): Promise<ProjectMemberFormState> {
    const parsed = removeProjectMemberSchema.safeParse({
        membershipId: formData.get("membershipId"),
    });

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "参数不完整。",
        };
    }

    const membership = await prisma.projectMember.findUnique({
        where: { id: parsed.data.membershipId },
        include: {
            user: {
                select: {
                    name: true,
                },
            },
        },
    });

    if (!membership) {
        return {
            error: "成员关系不存在。",
        };
    }

    try {
        await getProjectMemberManagerScope(membership.projectId);
    } catch (error) {
        return {
            error:
                error instanceof Error ? error.message : "无权限执行该操作。",
        };
    }

    await prisma.projectMember.delete({
        where: {
            id: parsed.data.membershipId,
        },
    });

    revalidatePath("/admin/projects");
    revalidatePath("/workspace");
    revalidatePath("/workspace/projects");
    revalidatePath("/workspace/submissions");
    revalidatePath("/workspace/reviews");

    return {
        success: `已移除 ${membership.user.name} 的项目成员关系。`,
    };
}
