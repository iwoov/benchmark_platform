"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { isSuperAdminRole } from "@/lib/auth/roles";

const saveSubjectSchema = z.object({
    subjectId: z
        .string()
        .trim()
        .optional()
        .transform((value) => value || undefined),
    name: z
        .string()
        .trim()
        .min(1, "学科名称不能为空")
        .max(50, "学科名称不能超过 50 个字符"),
    description: z
        .string()
        .trim()
        .optional()
        .transform((value) => value || undefined),
    primaryValues: z
        .array(z.string().trim().min(1))
        .min(1, "请至少选择 1 个 primary 取值"),
});

export type SaveSubjectFormState = {
    error?: string;
    success?: string;
};

export async function saveSubjectAction(
    _prevState: SaveSubjectFormState,
    formData: FormData,
): Promise<SaveSubjectFormState> {
    const session = await auth();

    if (!isSuperAdminRole(session?.user.platformRole)) {
        return {
            error: "只有超级管理员可以维护学科。",
        };
    }

    const parsed = saveSubjectSchema.safeParse({
        subjectId: formData.get("subjectId") || undefined,
        name: formData.get("name"),
        description: formData.get("description") || undefined,
        primaryValues: formData
            .getAll("primaryValues")
            .filter((value): value is string => typeof value === "string"),
    });

    if (!parsed.success) {
        return {
            error:
                parsed.error.issues[0]?.message ??
                "学科参数不完整，请检查后重试。",
        };
    }

    const name = parsed.data.name;
    const primaryValues = [...new Set(parsed.data.primaryValues)];

    const duplicated = await prisma.subject.findFirst({
        where: {
            name,
            ...(parsed.data.subjectId
                ? {
                      NOT: {
                          id: parsed.data.subjectId,
                      },
                  }
                : {}),
        },
        select: {
            id: true,
        },
    });

    if (duplicated) {
        return {
            error: "该学科名称已存在，请更换。",
        };
    }

    if (parsed.data.subjectId) {
        const subject = await prisma.subject.findUnique({
            where: {
                id: parsed.data.subjectId,
            },
            select: {
                id: true,
            },
        });

        if (!subject) {
            return {
                error: "学科不存在，请刷新后重试。",
            };
        }

        await prisma.subject.update({
            where: {
                id: parsed.data.subjectId,
            },
            data: {
                name,
                description: parsed.data.description,
                primaryValues: {
                    deleteMany: {},
                    create: primaryValues.map((value) => ({
                        value,
                    })),
                },
            },
        });
    } else {
        await prisma.subject.create({
            data: {
                name,
                description: parsed.data.description,
                primaryValues: {
                    create: primaryValues.map((value) => ({
                        value,
                    })),
                },
            },
        });
    }

    revalidatePath("/admin/subjects");
    revalidatePath("/admin/users");
    revalidatePath("/admin/review-tasks");
    revalidatePath("/workspace/reviews");

    return {
        success: parsed.data.subjectId
            ? `学科 ${name} 已更新。`
            : `学科 ${name} 已创建。`,
    };
}
