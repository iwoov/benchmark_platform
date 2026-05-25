"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { QuestionStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { parseImportedProjectData } from "@/lib/import/project-data";
import { deleteDatasourceUploads } from "@/lib/import/file-storage";
import { getProjectManagerScope } from "@/lib/auth/project-permissions";
import { attachDatasourceToScopedStrategies } from "@/lib/ai/strategy-scope";

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

export type DeleteDatasourceActionState = {
    error?: string;
    success?: string;
};

const deleteDatasourceSchema = z.object({
    datasourceId: z.string().trim().min(1, "缺少数据源 ID。"),
});

function parseStringArray(value: unknown) {
    if (!Array.isArray(value)) {
        return [] as string[];
    }

    return value.filter(
        (item): item is string =>
            typeof item === "string" && Boolean(item.trim()),
    );
}

function extractRawRecord(metadata: unknown) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return null;
    }

    const rawRecord = (metadata as Record<string, unknown>).rawRecord;

    if (!rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord)) {
        return null;
    }

    return rawRecord;
}

function normalizeComparableValue(value: unknown): unknown {
    if (value === undefined) {
        return null;
    }

    if (value === null) {
        return null;
    }

    if (Array.isArray(value)) {
        return value.map((item) => normalizeComparableValue(item));
    }

    if (typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
                .map(([key, item]) => [key, normalizeComparableValue(item)]),
        );
    }

    return value;
}

function toStableComparableString(value: unknown) {
    return JSON.stringify(normalizeComparableValue(value));
}

function revisionPayloadChanged(
    previousQuestion: {
        title: string;
        content: string;
        answer: string | null;
        analysis: string | null;
        questionType: string | null;
        difficulty: string | null;
        metadata: unknown;
    },
    nextRow: {
        title: string;
        content: string;
        answer: string | null;
        analysis: string | null;
        questionType: string | null;
        difficulty: string | null;
        metadata: unknown;
    },
) {
    const fieldChanged =
        previousQuestion.title !== nextRow.title ||
        previousQuestion.content !== nextRow.content ||
        previousQuestion.answer !== nextRow.answer ||
        previousQuestion.analysis !== nextRow.analysis ||
        previousQuestion.questionType !== nextRow.questionType ||
        previousQuestion.difficulty !== nextRow.difficulty;

    if (fieldChanged) {
        return true;
    }

    return (
        toStableComparableString(extractRawRecord(previousQuestion.metadata)) !==
        toStableComparableString(extractRawRecord(nextRow.metadata))
    );
}

function normalizeRevisionImportStatus(status: QuestionStatus): QuestionStatus {
    return status === "DRAFT" ? "DRAFT" : "SUBMITTED";
}

function revalidateImportPaths() {
    revalidatePath("/dashboard/datasources");
    revalidatePath("/admin/datasources");
    revalidatePath("/dashboard/projects");
    revalidatePath("/admin/projects");
    revalidatePath("/dashboard/review-tasks");
    revalidatePath("/dashboard/ai-strategies");
    revalidatePath("/workspace");
    revalidatePath("/workspace/projects");
    revalidatePath("/workspace/submissions");
    revalidatePath("/workspace/reviews");
    revalidatePath("/admin/ai-strategies");
}

export async function importProjectDataAction(
    _prevState: ImportProjectDataFormState,
    formData: FormData,
): Promise<ImportProjectDataFormState> {
    const autoApplyAiStrategies =
        formData.get("autoApplyAiStrategies") === "on";

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
            const revisionKeys = [
                ...new Set(
                    importedPayload.rows
                        .map((row) => row.businessQuestionKey)
                        .filter(
                            (value): value is string =>
                                typeof value === "string" &&
                                Boolean(value.trim()),
                        ),
                ),
            ];
            const latestRevisionMap = new Map<
                string,
                {
                    id: string;
                    revisionNo: number;
                    isLatestRevision: boolean;
                    title: string;
                    content: string;
                    answer: string | null;
                    analysis: string | null;
                    questionType: string | null;
                    difficulty: string | null;
                    metadata: unknown;
                }
            >();

            if (revisionKeys.length) {
                const existingQuestions = await tx.question.findMany({
                    where: {
                        projectId: project.id,
                        businessQuestionKey: {
                            in: revisionKeys,
                        },
                    },
                    orderBy: [
                        { businessQuestionKey: "asc" },
                        { revisionNo: "desc" },
                    ],
                    select: {
                        id: true,
                        businessQuestionKey: true,
                        revisionNo: true,
                        isLatestRevision: true,
                        title: true,
                        content: true,
                        answer: true,
                        analysis: true,
                        questionType: true,
                        difficulty: true,
                        metadata: true,
                    },
                });

                existingQuestions.forEach((question) => {
                    if (!question.businessQuestionKey) {
                        return;
                    }

                    const existing = latestRevisionMap.get(
                        question.businessQuestionKey,
                    );
                    if (
                        existing &&
                        (existing.revisionNo > question.revisionNo ||
                            (existing.revisionNo === question.revisionNo &&
                                existing.isLatestRevision))
                    ) {
                        return;
                    }

                    latestRevisionMap.set(question.businessQuestionKey, {
                        id: question.id,
                        revisionNo: question.revisionNo,
                        isLatestRevision: question.isLatestRevision,
                        title: question.title,
                        content: question.content,
                        answer: question.answer,
                        analysis: question.analysis,
                        questionType: question.questionType,
                        difficulty: question.difficulty,
                        metadata: question.metadata,
                    });
                });
            }

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

            let createdQuestionCount = 0;
            let newQuestionCount = 0;
            let revisedQuestionCount = 0;
            let skippedUnchangedRevisionCount = 0;

            for (const row of importedPayload.rows) {
                const previousRevision = row.businessQuestionKey
                    ? latestRevisionMap.get(row.businessQuestionKey)
                    : null;

                if (
                    previousRevision &&
                    !revisionPayloadChanged(previousRevision, row)
                ) {
                    skippedUnchangedRevisionCount += 1;
                    continue;
                }

                const revisionNo = previousRevision
                    ? previousRevision.revisionNo + 1
                    : 1;
                const normalizedStatus = previousRevision
                    ? normalizeRevisionImportStatus(row.status)
                    : row.status;
                const createdQuestion = await tx.question.create({
                    data: {
                        projectId: project.id,
                        datasourceId: datasource.id,
                        externalRecordId: row.externalRecordId,
                        businessQuestionKey: row.businessQuestionKey,
                        title: row.title,
                        content: row.content,
                        answer: row.answer,
                        analysis: row.analysis,
                        questionType: row.questionType,
                        difficulty: row.difficulty,
                        status: normalizedStatus,
                        revisionNo,
                        isLatestRevision: true,
                        previousRevisionId: previousRevision?.id ?? null,
                        metadata: row.metadata,
                        lastSyncedAt: importedAt,
                    },
                    select: {
                        id: true,
                    },
                });

                if (previousRevision) {
                    await tx.question.updateMany({
                        where: {
                            projectId: project.id,
                            businessQuestionKey: row.businessQuestionKey,
                            id: {
                                not: createdQuestion.id,
                            },
                        },
                        data: {
                            isLatestRevision: false,
                        },
                    });
                    revisedQuestionCount += 1;
                } else {
                    newQuestionCount += 1;
                }

                createdQuestionCount += 1;

                if (row.businessQuestionKey) {
                    latestRevisionMap.set(row.businessQuestionKey, {
                        id: createdQuestion.id,
                        revisionNo,
                        isLatestRevision: true,
                        title: row.title,
                        content: row.content,
                        answer: row.answer,
                        analysis: row.analysis,
                        questionType: row.questionType,
                        difficulty: row.difficulty,
                        metadata: row.metadata,
                    });
                }
            }

            if (!createdQuestionCount) {
                throw new Error(
                    "导入内容与当前项目中的最新题目相比没有变化，未创建新数据源。",
                );
            }

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
                        importedCount: createdQuestionCount,
                        newQuestionCount,
                        revisedQuestionCount,
                        skippedCount: importedPayload.skippedRowCount,
                        skippedUnchangedRevisionCount,
                    },
                    status: "SUCCESS",
                },
            });

            const updatedStrategyCount = autoApplyAiStrategies
                ? await attachDatasourceToScopedStrategies(tx, {
                      projectId: project.id,
                      datasourceId: datasource.id,
                  })
                : 0;

            return {
                datasource,
                createdQuestionCount,
                newQuestionCount,
                revisedQuestionCount,
                skippedUnchangedRevisionCount,
                updatedStrategyCount,
            };
        });

        revalidateImportPaths();

        return {
            success: `已为项目 ${project.name} 导入 ${result.createdQuestionCount} 条题目，并创建数据源 ${result.datasource.name}。新增 ${result.newQuestionCount} 条，修订 ${result.revisedQuestionCount} 条，跳过未变化修订 ${result.skippedUnchangedRevisionCount} 条。${
                autoApplyAiStrategies
                    ? result.updatedStrategyCount
                        ? ` 已自动加入 ${result.updatedStrategyCount} 条审核策略范围。`
                        : " 当前没有需要补充数据源范围的审核策略。"
                    : ""
            }`,
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

export async function deleteDatasourceAction(input: {
    datasourceId: string;
}): Promise<DeleteDatasourceActionState> {
    const parsed = deleteDatasourceSchema.safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "删除参数不完整。",
        };
    }

    const datasource = await prisma.projectDataSource.findUnique({
        where: {
            id: parsed.data.datasourceId,
        },
        select: {
            id: true,
            name: true,
            projectId: true,
            _count: {
                select: {
                    questions: true,
                    reviews: true,
                    aiReviewRuns: true,
                    syncLogs: true,
                },
            },
        },
    });

    if (!datasource) {
        return {
            error: "数据源不存在或已被删除。",
        };
    }

    try {
        await getProjectManagerScope(datasource.projectId);
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : "无权限删除数据源。",
        };
    }

    try {
        const strategyChangeSummary = await prisma.$transaction(async (tx) => {
            const strategies = await tx.aiReviewStrategy.findMany({
                select: {
                    id: true,
                    datasourceIds: true,
                    enabled: true,
                },
            });

            let updatedCount = 0;
            let disabledCount = 0;

            for (const strategy of strategies) {
                const datasourceIds = parseStringArray(strategy.datasourceIds);

                if (!datasourceIds.includes(datasource.id)) {
                    continue;
                }

                const nextDatasourceIds = datasourceIds.filter(
                    (item) => item !== datasource.id,
                );
                const shouldDisable =
                    datasourceIds.length > 0 &&
                    nextDatasourceIds.length === 0 &&
                    strategy.enabled;

                await tx.aiReviewStrategy.update({
                    where: {
                        id: strategy.id,
                    },
                    data: {
                        datasourceIds: nextDatasourceIds,
                        enabled: shouldDisable ? false : strategy.enabled,
                    },
                });
                updatedCount += 1;
                if (shouldDisable) {
                    disabledCount += 1;
                }
            }

            await tx.projectDataSource.delete({
                where: {
                    id: datasource.id,
                },
            });

            return {
                updatedCount,
                disabledCount,
            };
        });

        await deleteDatasourceUploads(datasource.id);
        revalidateImportPaths();

        return {
            success: `已删除数据源 ${datasource.name}，清理 ${datasource._count.questions} 条题目、${datasource._count.reviews} 条审核记录、${datasource._count.aiReviewRuns} 条 AI 运行记录、${datasource._count.syncLogs} 条同步日志${
                strategyChangeSummary.updatedCount
                    ? `，并更新 ${strategyChangeSummary.updatedCount} 条 AI 策略的数据源范围`
                    : ""
            }${
                strategyChangeSummary.disabledCount
                    ? `；其中 ${strategyChangeSummary.disabledCount} 条策略因不再包含任何数据源而被自动停用`
                    : ""
            }。`,
        };
    } catch (error) {
        return {
            error:
                error instanceof Error
                    ? error.message
                    : "删除数据源失败，请稍后重试。",
        };
    }
}
