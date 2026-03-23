"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { parseImportedProjectData } from "@/lib/import/project-data";
import { getProjectManagerScope } from "@/lib/auth/project-permissions";

const importProjectDataSchema = z.object({
    projectId: z.string().min(1, "请选择项目。"),
    name: z
        .string()
        .trim()
        .max(80, "数据源名称不能超过 80 个字符")
        .optional()
        .transform((value) => value || undefined),
});

export type ImportProjectDataFormState = {
    error?: string;
    success?: string;
};

function revalidateImportPaths() {
    revalidatePath("/admin/datasources");
    revalidatePath("/admin/projects");
    revalidatePath("/workspace");
    revalidatePath("/workspace/manage");
    revalidatePath("/workspace/projects");
    revalidatePath("/workspace/submissions");
    revalidatePath("/workspace/reviews");
}

export async function importProjectDataAction(
    _prevState: ImportProjectDataFormState,
    formData: FormData,
): Promise<ImportProjectDataFormState> {
    const parsed = importProjectDataSchema.safeParse({
        projectId: formData.get("projectId"),
        name: formData.get("name") || undefined,
    });

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "导入参数不完整。",
        };
    }

    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
        return {
            error: "请选择要导入的 JSON 或 Excel 文件。",
        };
    }

    let managerScope: Awaited<ReturnType<typeof getProjectManagerScope>>;

    try {
        managerScope = await getProjectManagerScope(parsed.data.projectId);
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : "无权限执行导入。",
        };
    }

    const project = await prisma.project.findUnique({
        where: {
            id: parsed.data.projectId,
        },
        select: {
            id: true,
            name: true,
            status: true,
        },
    });

    if (!project) {
        return {
            error: "项目不存在。",
        };
    }

    if (project.status !== "ACTIVE") {
        return {
            error: "只能向启用中的项目导入数据。",
        };
    }

    try {
        const importedPayload = await parseImportedProjectData(file);
        const datasourceName = parsed.data.name ?? importedPayload.defaultName;
        const importedAt = new Date();

        const result = await prisma.$transaction(async (tx) => {
            const datasource = await tx.projectDataSource.create({
                data: {
                    projectId: project.id,
                    name: datasourceName,
                    type: importedPayload.datasourceType,
                    fieldMapping: importedPayload.fieldMapping,
                    syncConfig: {
                        importMode: "MANUAL_UPLOAD",
                        importedByScope: managerScope,
                        originalFileName: importedPayload.originalFileName,
                        rawFieldOrder: importedPayload.rawFieldOrder,
                        importedAt: importedAt.toISOString(),
                        totalRowCount: importedPayload.totalRowCount,
                        skippedRowCount: importedPayload.skippedRowCount,
                    },
                },
            });

            await tx.question.createMany({
                data: importedPayload.rows.map((row) => ({
                    projectId: project.id,
                    datasourceId: datasource.id,
                    externalRecordId: row.externalRecordId,
                    title: row.title,
                    content: row.content,
                    answer: row.answer,
                    analysis: row.analysis,
                    questionType: row.questionType,
                    difficulty: row.difficulty,
                    status: row.status,
                    metadata: row.metadata,
                    lastSyncedAt: importedAt,
                })),
            });

            await tx.syncLog.create({
                data: {
                    projectId: project.id,
                    datasourceId: datasource.id,
                    direction: "PULL",
                    action:
                        importedPayload.datasourceType === "JSON_UPLOAD"
                            ? "IMPORT_JSON"
                            : "IMPORT_EXCEL",
                    requestPayload: {
                        projectId: project.id,
                        fileName: importedPayload.originalFileName,
                        datasourceName,
                    },
                    responsePayload: {
                        importedCount: importedPayload.rows.length,
                        skippedCount: importedPayload.skippedRowCount,
                    },
                    status: "SUCCESS",
                },
            });

            return datasource;
        });

        revalidateImportPaths();

        return {
            success: `已为项目 ${project.name} 导入 ${importedPayload.rows.length} 条题目，并创建数据源 ${result.name}。`,
        };
    } catch (error) {
        return {
            error:
                error instanceof Error
                    ? error.message
                    : "导入失败，请检查文件格式后重试。",
        };
    }
}
