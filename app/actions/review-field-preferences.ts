"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { isAdminRole } from "@/lib/auth/roles";
import {
    getProjectReviewFieldCatalog,
    sanitizeReviewFieldPreferenceInput,
} from "@/lib/reviews/field-preferences";
import { canUserReviewProject } from "@/lib/reviews/permissions";

const saveReviewFieldPreferenceSchema = z.object({
    projectId: z.string().min(1, "缺少项目 ID"),
    fieldOrder: z.array(z.string()),
    listVisibleFieldKeys: z.array(z.string()),
    detailVisibleFieldKeys: z.array(z.string()),
});

type ReviewFieldPreferenceActionResult = {
    error?: string;
    success?: string;
};

function revalidateReviewPaths() {
    revalidatePath("/workspace/reviews");
    revalidatePath("/dashboard/review-tasks");
    revalidatePath("/admin/review-tasks");
}

async function ensureProjectAccess(userId: string, projectId: string): Promise<
    { error: string } | { sessionUserId: string }
> {
    const session = await auth();

    if (!session?.user || session.user.id !== userId) {
        return {
            error: "登录状态已失效，请重新登录。",
        };
    }

    const project = await prisma.project.findUnique({
        where: {
            id: projectId,
        },
        select: {
            id: true,
        },
    });

    if (!project) {
        return {
            error: "项目不存在。",
        };
    }

    const hasAccess =
        isAdminRole(session.user.platformRole) ||
        (await canUserReviewProject(
            session.user.id,
            session.user.platformRole,
            projectId,
        ));

    if (!hasAccess) {
        return {
            error: "你没有权限修改该项目的字段显示配置。",
        };
    }

    return {
        sessionUserId: session.user.id,
    };
}

export async function saveUserProjectReviewFieldPreferenceAction(input: {
    projectId: string;
    fieldOrder: string[];
    listVisibleFieldKeys: string[];
    detailVisibleFieldKeys: string[];
}): Promise<ReviewFieldPreferenceActionResult> {
    const session = await auth();

    if (!session?.user) {
        return {
            error: "登录状态已失效，请重新登录。",
        };
    }

    const parsed = saveReviewFieldPreferenceSchema.safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "字段配置校验失败。",
        };
    }

    const access = await ensureProjectAccess(
        session.user.id,
        parsed.data.projectId,
    );

    if ("error" in access) {
        return access;
    }

    const fieldCatalog = await getProjectReviewFieldCatalog(parsed.data.projectId);
    const config = sanitizeReviewFieldPreferenceInput({
        fieldCatalogKeys: fieldCatalog.map((field) => field.key),
        fieldOrder: parsed.data.fieldOrder,
        listVisibleFieldKeys: parsed.data.listVisibleFieldKeys,
        detailVisibleFieldKeys: parsed.data.detailVisibleFieldKeys,
    });

    await prisma.userProjectReviewFieldPreference.upsert({
        where: {
            userId_projectId: {
                userId: session.user.id,
                projectId: parsed.data.projectId,
            },
        },
        create: {
            userId: session.user.id,
            projectId: parsed.data.projectId,
            config,
        },
        update: {
            config,
        },
    });

    revalidateReviewPaths();

    return {
        success: "字段显示配置已保存。",
    };
}

export async function resetUserProjectReviewFieldPreferenceAction(input: {
    projectId: string;
}): Promise<ReviewFieldPreferenceActionResult> {
    const session = await auth();

    if (!session?.user) {
        return {
            error: "登录状态已失效，请重新登录。",
        };
    }

    const parsed = z
        .object({
            projectId: z.string().min(1, "缺少项目 ID"),
        })
        .safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "重置字段配置失败。",
        };
    }

    const access = await ensureProjectAccess(
        session.user.id,
        parsed.data.projectId,
    );

    if ("error" in access) {
        return access;
    }

    await prisma.userProjectReviewFieldPreference.deleteMany({
        where: {
            userId: session.user.id,
            projectId: parsed.data.projectId,
        },
    });

    revalidateReviewPaths();

    return {
        success: "字段显示配置已恢复默认。",
    };
}
