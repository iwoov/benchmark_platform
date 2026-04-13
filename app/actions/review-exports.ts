"use server";

import { z } from "zod";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { canUserReviewProject } from "@/lib/reviews/permissions";
import {
    buildReviewCompositeKey,
    getLatestReviewSummaryMap,
    toReviewStatusValue,
} from "@/lib/reviews/review-summary";

const exportFormatSchema = z.enum(["excel", "json", "markdown"]);
const exportScopeSchema = z.enum(["selected", "filteredAll"]);
const filterFieldKeySchema = z.union([
    z.literal("status"),
    z.literal("aiReviewStatus"),
    z.literal("manualReviewStatus"),
    z.literal("datasourceId"),
    z.literal("sourceRowNumber"),
    z.string().regex(/^raw:.+$/),
]);
const filterOperatorSchema = z.union([
    z.literal("equals"),
    z.literal("notEquals"),
    z.literal("contains"),
    z.literal("notContains"),
    z.literal("isEmpty"),
    z.literal("isNotEmpty"),
    z.literal("gt"),
    z.literal("lt"),
]);
const exportFilterConditionSchema = z.object({
    id: z.string().trim().optional(),
    fieldKey: filterFieldKeySchema,
    operator: filterOperatorSchema,
    value: z.string().default(""),
});

const exportReviewQuestionsSchema = z.object({
    projectId: z.string().trim().min(1, "缺少项目 ID"),
    scope: exportScopeSchema.default("selected"),
    questionIds: z.array(z.string().trim().min(1)).default([]),
    filters: z.array(exportFilterConditionSchema).default([]),
    fieldKeys: z.array(z.string().trim().min(1)).min(1, "请至少选择 1 个字段"),
    format: exportFormatSchema,
});

type ExportFormat = z.infer<typeof exportFormatSchema>;

const baseFieldLabels: Record<string, string> = {
    externalRecordId: "外部记录 ID",
    title: "题目标题",
    status: "题目状态",
    aiReviewStatus: "AI审核状态",
    manualReviewStatus: "人工审核状态",
    updatedAt: "题目更新时间",
    projectName: "项目名称",
    projectCode: "项目编码",
    datasourceName: "数据源",
    sourceRowNumber: "来源行号",
    reviewDecision: "审核结论",
    reviewComment: "审核意见",
    reviewReviewer: "审核人",
    reviewUpdatedAt: "审核更新时间",
};

const questionStatusLabelMap: Record<string, string> = {
    DRAFT: "草稿",
    SUBMITTED: "待审核",
    UNDER_REVIEW: "审核中",
    APPROVED: "已通过",
    REJECTED: "已驳回",
};

const reviewDecisionLabelMap: Record<string, string> = {
    PASS: "通过",
    REJECT: "驳回",
    NEEDS_REVISION: "退回修改",
};

const reviewStatusLabelMap: Record<string, string> = {
    NONE: "未审核",
    PASS: "通过",
    REJECT: "驳回",
    NEEDS_REVISION: "退回修改",
};

function normalizeRawRecord(metadata: unknown) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return {} as Record<string, string>;
    }

    const rawRecord = (metadata as Record<string, unknown>).rawRecord;

    if (
        !rawRecord ||
        typeof rawRecord !== "object" ||
        Array.isArray(rawRecord)
    ) {
        return {} as Record<string, string>;
    }

    return Object.fromEntries(
        Object.entries(rawRecord as Record<string, unknown>).map(
            ([key, value]) => [key, value == null ? "" : String(value)],
        ),
    );
}

function extractSourceRowNumber(metadata: unknown) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return null;
    }

    const sourceRowNumber = (metadata as Record<string, unknown>)
        .sourceRowNumber;

    return typeof sourceRowNumber === "number" ? sourceRowNumber : null;
}

function fieldLabel(fieldKey: string) {
    if (fieldKey.startsWith("raw:")) {
        return fieldKey.slice(4);
    }

    return baseFieldLabels[fieldKey] ?? fieldKey;
}

function markdownEscape(value: string) {
    return value.replaceAll("|", "\\|").replaceAll("\n", "<br/>");
}

function formatCellValue(value: unknown) {
    if (value == null) {
        return "";
    }

    if (typeof value === "string") {
        return value;
    }

    return String(value);
}

function toBase64(content: string | Buffer) {
    return Buffer.from(content).toString("base64");
}

export type ExportReviewQuestionsResult = {
    error?: string;
    success?: string;
    fileName?: string;
    mimeType?: string;
    base64?: string;
};

export async function exportReviewQuestionsAction(
    input: z.input<typeof exportReviewQuestionsSchema>,
): Promise<ExportReviewQuestionsResult> {
    const session = await auth();

    if (!session?.user) {
        return {
            error: "请先登录后再导出。",
        };
    }

    const parsed = exportReviewQuestionsSchema.safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "导出参数不完整。",
        };
    }

    const canReview = await canUserReviewProject(
        session.user.id,
        session.user.platformRole,
        parsed.data.projectId,
    );

    if (!canReview) {
        return {
            error: "你当前没有该项目的审核权限。",
        };
    }

    if (parsed.data.scope === "selected" && !parsed.data.questionIds.length) {
        return {
            error: "请先勾选至少 1 条题目后再导出。",
        };
    }

    const statusCondition = parsed.data.filters.find(
        (condition) => condition.fieldKey === "status",
    );
    const datasourceCondition = parsed.data.filters.find(
        (condition) => condition.fieldKey === "datasourceId",
    );
    const validStatusValue =
        statusCondition?.value === "DRAFT" ||
        statusCondition?.value === "SUBMITTED" ||
        statusCondition?.value === "UNDER_REVIEW" ||
        statusCondition?.value === "APPROVED" ||
        statusCondition?.value === "REJECTED"
            ? statusCondition.value
            : null;
    const uniqueQuestionIds = [...new Set(parsed.data.questionIds)];
    const questions = await prisma.question.findMany({
        where: {
            projectId: parsed.data.projectId,
            ...(parsed.data.scope === "selected"
                ? {
                      id: {
                          in: uniqueQuestionIds,
                      },
                  }
                : {}),
            status:
                statusCondition?.operator === "equals" && validStatusValue
                    ? {
                          equals: validStatusValue,
                      }
                    : statusCondition?.operator === "notEquals" &&
                        validStatusValue
                      ? {
                            not: validStatusValue,
                        }
                      : undefined,
            datasourceId:
                datasourceCondition?.operator === "equals"
                    ? {
                          equals: datasourceCondition.value,
                      }
                    : datasourceCondition?.operator === "notEquals"
                      ? {
                            not: datasourceCondition.value,
                        }
                      : undefined,
        },
        select: {
            id: true,
            title: true,
            status: true,
            updatedAt: true,
            externalRecordId: true,
            metadata: true,
            project: {
                select: {
                    name: true,
                    code: true,
                },
            },
            datasource: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });
    const reviewSummaryMap = await getLatestReviewSummaryMap(
        questions.map((question) => ({
            projectId: parsed.data.projectId,
            datasourceId: question.datasource.id,
            externalRecordId: question.externalRecordId,
        })),
    );
    const filteredQuestions = questions.filter((question) => {
        const rawRecord = normalizeRawRecord(question.metadata);
        const sourceRowNumber = extractSourceRowNumber(question.metadata);
        const reviewSummary = reviewSummaryMap.get(
            buildReviewCompositeKey({
                projectId: parsed.data.projectId,
                datasourceId: question.datasource.id,
                externalRecordId: question.externalRecordId,
            }),
        ) ?? {
            latestReview: null,
            aiReview: null,
            manualReview: null,
        };

        return parsed.data.filters.every((condition) => {
            const fieldValue =
                condition.fieldKey === "status"
                    ? question.status
                    : condition.fieldKey === "aiReviewStatus"
                      ? toReviewStatusValue(reviewSummary.aiReview)
                      : condition.fieldKey === "manualReviewStatus"
                        ? toReviewStatusValue(reviewSummary.manualReview)
                        : condition.fieldKey === "datasourceId"
                          ? question.datasource.id
                          : condition.fieldKey === "sourceRowNumber"
                            ? sourceRowNumber
                            : (rawRecord[condition.fieldKey.slice(4)] ?? "");

            if (
                condition.fieldKey === "status" ||
                condition.fieldKey === "aiReviewStatus" ||
                condition.fieldKey === "manualReviewStatus" ||
                condition.fieldKey === "datasourceId"
            ) {
                if (condition.operator === "equals") {
                    return fieldValue === condition.value;
                }

                if (condition.operator === "notEquals") {
                    return fieldValue !== condition.value;
                }

                return true;
            }

            if (condition.fieldKey === "sourceRowNumber") {
                const targetValue = Number(condition.value);

                if (
                    Number.isNaN(targetValue) ||
                    typeof fieldValue !== "number"
                ) {
                    return false;
                }

                if (condition.operator === "equals") {
                    return fieldValue === targetValue;
                }

                if (condition.operator === "gt") {
                    return fieldValue > targetValue;
                }

                if (condition.operator === "lt") {
                    return fieldValue < targetValue;
                }

                return true;
            }

            const normalizedFieldValue = String(fieldValue)
                .trim()
                .toLowerCase();
            const normalizedCompareValue = condition.value.trim().toLowerCase();

            if (condition.operator === "isEmpty") {
                return !normalizedFieldValue;
            }

            if (condition.operator === "isNotEmpty") {
                return Boolean(normalizedFieldValue);
            }

            if (condition.operator === "equals") {
                return normalizedFieldValue === normalizedCompareValue;
            }

            if (condition.operator === "notEquals") {
                return normalizedFieldValue !== normalizedCompareValue;
            }

            if (condition.operator === "notContains") {
                return !normalizedFieldValue.includes(normalizedCompareValue);
            }

            return normalizedFieldValue.includes(normalizedCompareValue);
        });
    });

    if (!filteredQuestions.length) {
        return {
            error:
                parsed.data.scope === "filteredAll"
                    ? "当前筛选条件下没有可导出的题目记录。"
                    : "未找到可导出的题目记录。",
        };
    }

    const questionById = new Map(
        filteredQuestions.map((question) => [question.id, question]),
    );
    const orderedQuestions =
        parsed.data.scope === "selected"
            ? uniqueQuestionIds
                  .map((questionId) => questionById.get(questionId))
                  .filter(
                      (question): question is NonNullable<typeof question> =>
                          Boolean(question),
                  )
            : filteredQuestions.sort((left, right) =>
                  left.externalRecordId.localeCompare(right.externalRecordId),
              );

    const rows = orderedQuestions.map((question) => {
        const rawRecord = normalizeRawRecord(question.metadata);
        const sourceRowNumber = extractSourceRowNumber(question.metadata);
        const reviewSummary = reviewSummaryMap.get(
            buildReviewCompositeKey({
                projectId: parsed.data.projectId,
                datasourceId: question.datasource.id,
                externalRecordId: question.externalRecordId,
            }),
        ) ?? {
            latestReview: null,
            aiReview: null,
            manualReview: null,
        };
        const latestReview = reviewSummary.latestReview;

        const record = Object.fromEntries(
            parsed.data.fieldKeys.map((fieldKey) => {
                if (fieldKey.startsWith("raw:")) {
                    const rawField = fieldKey.slice(4);
                    return [fieldLabel(fieldKey), rawRecord[rawField] ?? ""];
                }

                if (fieldKey === "externalRecordId") {
                    return [fieldLabel(fieldKey), question.externalRecordId];
                }

                if (fieldKey === "title") {
                    return [fieldLabel(fieldKey), question.title];
                }

                if (fieldKey === "status") {
                    return [
                        fieldLabel(fieldKey),
                        questionStatusLabelMap[question.status] ??
                            question.status,
                    ];
                }

                if (fieldKey === "aiReviewStatus") {
                    const status = toReviewStatusValue(reviewSummary.aiReview);
                    return [
                        fieldLabel(fieldKey),
                        reviewStatusLabelMap[status] ?? status,
                    ];
                }

                if (fieldKey === "manualReviewStatus") {
                    const status = toReviewStatusValue(
                        reviewSummary.manualReview,
                    );
                    return [
                        fieldLabel(fieldKey),
                        reviewStatusLabelMap[status] ?? status,
                    ];
                }

                if (fieldKey === "updatedAt") {
                    return [
                        fieldLabel(fieldKey),
                        question.updatedAt.toLocaleString("zh-CN"),
                    ];
                }

                if (fieldKey === "projectName") {
                    return [fieldLabel(fieldKey), question.project.name];
                }

                if (fieldKey === "projectCode") {
                    return [fieldLabel(fieldKey), question.project.code];
                }

                if (fieldKey === "datasourceName") {
                    return [fieldLabel(fieldKey), question.datasource.name];
                }

                if (fieldKey === "sourceRowNumber") {
                    return [fieldLabel(fieldKey), sourceRowNumber ?? ""];
                }

                if (fieldKey === "reviewDecision") {
                    return [
                        fieldLabel(fieldKey),
                        latestReview
                            ? (reviewDecisionLabelMap[latestReview.decision] ??
                              latestReview.decision)
                            : "",
                    ];
                }

                if (fieldKey === "reviewComment") {
                    return [fieldLabel(fieldKey), latestReview?.comment ?? ""];
                }

                if (fieldKey === "reviewReviewer") {
                    return [
                        fieldLabel(fieldKey),
                        latestReview?.reviewerName ?? "",
                    ];
                }

                if (fieldKey === "reviewUpdatedAt") {
                    return [
                        fieldLabel(fieldKey),
                        latestReview?.updatedAt
                            ? new Date(latestReview.updatedAt).toLocaleString(
                                  "zh-CN",
                              )
                            : "",
                    ];
                }

                return [fieldLabel(fieldKey), ""];
            }),
        );

        return record;
    });

    const format = parsed.data.format as ExportFormat;
    const datePart = new Date().toISOString().slice(0, 10);
    const fileNameBase = `review-export-${datePart}`;

    if (format === "json") {
        return {
            success:
                parsed.data.scope === "filteredAll"
                    ? `已导出当前筛选结果，共 ${rows.length} 条。`
                    : `已导出勾选题目，共 ${rows.length} 条。`,
            fileName: `${fileNameBase}.json`,
            mimeType: "application/json;charset=utf-8",
            base64: toBase64(JSON.stringify(rows, null, 2)),
        };
    }

    if (format === "markdown") {
        const headers = parsed.data.fieldKeys.map((fieldKey) =>
            fieldLabel(fieldKey),
        );
        const lines = [
            `| ${headers.join(" | ")} |`,
            `| ${headers.map(() => "---").join(" | ")} |`,
            ...rows.map((row) => {
                const values = headers.map((header) =>
                    markdownEscape(formatCellValue(row[header] ?? "")),
                );
                return `| ${values.join(" | ")} |`;
            }),
        ];

        return {
            success:
                parsed.data.scope === "filteredAll"
                    ? `已导出当前筛选结果，共 ${rows.length} 条。`
                    : `已导出勾选题目，共 ${rows.length} 条。`,
            fileName: `${fileNameBase}.md`,
            mimeType: "text/markdown;charset=utf-8",
            base64: toBase64(lines.join("\n")),
        };
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "题目导出");
    const excelBuffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
    }) as Buffer;

    return {
        success:
            parsed.data.scope === "filteredAll"
                ? `已导出当前筛选结果，共 ${rows.length} 条。`
                : `已导出勾选题目，共 ${rows.length} 条。`,
        fileName: `${fileNameBase}.xlsx`,
        mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        base64: toBase64(excelBuffer),
    };
}
