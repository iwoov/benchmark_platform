"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { isAdminRole } from "@/lib/auth/roles";

const saveSchema = z.object({
    id: z.string().optional(),
    name: z.string().trim().min(1, "请输入配置名称"),
    modelCode: z.string().trim().min(1, "请选择模型"),
    modelCodes: z.array(z.string()).optional(),
    systemPrompt: z.string().optional(),
    presetFields: z.array(z.string()).optional(),
    enabled: z.boolean().optional(),
});

export async function saveAiChatConfigAction(input: unknown): Promise<{
    error?: string;
    success?: string;
}> {
    const session = await auth();
    if (!session?.user || !isAdminRole(session.user.platformRole)) {
        return { error: "没有权限执行此操作。" };
    }

    const parsed = saveSchema.safeParse(input);
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? "参数不合法。" };
    }

    const {
        id,
        name,
        modelCode,
        modelCodes,
        systemPrompt,
        presetFields,
        enabled,
    } = parsed.data;

    if (id) {
        const existing = await prisma.aiChatConfig.findUnique({
            where: { id },
        });
        if (!existing) {
            return { error: "配置不存在。" };
        }

        await prisma.aiChatConfig.update({
            where: { id },
            data: {
                name,
                modelCode,
                modelCodes: modelCodes ?? [modelCode],
                systemPrompt: systemPrompt ?? null,
                presetFields: presetFields ?? [],
                enabled: enabled ?? true,
            },
        });

        revalidatePath("/dashboard/ai-strategies");
        revalidatePath("/admin/ai-strategies");
        return { success: `已更新对话配置「${name}」。` };
    }

    await prisma.aiChatConfig.create({
        data: {
            name,
            modelCode,
            modelCodes: modelCodes ?? [modelCode],
            systemPrompt: systemPrompt ?? null,
            presetFields: presetFields ?? [],
            enabled: enabled ?? true,
        },
    });

    revalidatePath("/dashboard/ai-strategies");
    revalidatePath("/admin/ai-strategies");
    return { success: `已创建对话配置「${name}」。` };
}

export async function deleteAiChatConfigAction(input: {
    id: string;
}): Promise<{ error?: string; success?: string }> {
    const session = await auth();
    if (!session?.user || !isAdminRole(session.user.platformRole)) {
        return { error: "没有权限执行此操作。" };
    }

    if (!input.id) {
        return { error: "缺少配置 ID。" };
    }

    const existing = await prisma.aiChatConfig.findUnique({
        where: { id: input.id },
    });

    if (!existing) {
        return { error: "配置不存在或已被删除。" };
    }

    await prisma.aiChatConfig.delete({ where: { id: input.id } });

    revalidatePath("/dashboard/ai-strategies");
    revalidatePath("/admin/ai-strategies");
    return { success: `已删除对话配置「${existing.name}」。` };
}
