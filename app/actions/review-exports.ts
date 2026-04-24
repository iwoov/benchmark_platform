"use server";

import { z } from "zod";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import {
    canUserAccessQuestionByMetadata,
    canUserReviewProject,
} from "@/lib/reviews/permissions";
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
};

const reviewStatusLabelMap: Record<string, string> = {
    NONE: "未审核",
    PASS: "通过",
    REJECT: "驳回",
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
    const visibleQuestions = (
        await Promise.all(
            questions.map(async (question) =>
                (await canUserAccessQuestionByMetadata(
                    session.user.id,
                    session.user.platformRole,
                    question.metadata,
                ))
                    ? question
                    : null,
            ),
        )
    ).filter((question) => question !== null);
    const reviewSummaryMap = await getLatestReviewSummaryMap(
        visibleQuestions.map((question) => ({
            projectId: parsed.data.projectId,
            datasourceId: question.datasource.id,
            externalRecordId: question.externalRecordId,
        })),
    );
    const filteredQuestions = visibleQuestions.filter((question) => {
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
        const blocks: string[] = [];
        for (const row of rows) {
            for (const header of headers) {
                const raw = formatCellValue(row[header] ?? "");
                const value = raw
                    .split("\n")
                    .map((l, i) => (i === 0 ? l : `  ${l}`))
                    .join("\n");
                blocks.push(`**${header}**`);
                blocks.push("");
                blocks.push(value);
                blocks.push("");
            }
            blocks.push("---");
            blocks.push("");
        }

        return {
            success:
                parsed.data.scope === "filteredAll"
                    ? `已导出当前筛选结果，共 ${rows.length} 条。`
                    : `已导出勾选题目，共 ${rows.length} 条。`,
            fileName: `${fileNameBase}.md`,
            mimeType: "text/markdown;charset=utf-8",
            base64: toBase64(blocks.join("\n")),
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

// ---------------------------------------------------------------------------
// Export review report
// ---------------------------------------------------------------------------

const reportFormatSchema = z.enum(["markdown", "html"]);

const exportReviewReportSchema = z.object({
    projectId: z.string().trim().min(1, "缺少项目 ID"),
    scope: exportScopeSchema.default("selected"),
    questionIds: z.array(z.string().trim().min(1)).default([]),
    filters: z.array(exportFilterConditionSchema).default([]),
    subjectFieldKey: z.string().trim().min(1, "请选择用于分组的学科字段"),
    detailFieldKeys: z
        .array(z.string().trim().min(1))
        .min(1, "请至少选择 1 个详情字段"),
    format: reportFormatSchema,
});

type ReportFormat = z.infer<typeof reportFormatSchema>;

type SubjectGroupStats = {
    subject: string;
    total: number;
    approved: number;
    rejected: number;
    pending: number;
    passRate: string;
};

type SubjectGroupDetail = {
    subject: string;
    rows: Array<Record<string, string>>;
};

function percent(numerator: number, denominator: number) {
    if (denominator === 0) return "0.00%";
    return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function buildReportMarkdown(
    projectName: string,
    datePart: string,
    overallStats: SubjectGroupStats,
    groupStats: SubjectGroupStats[],
    groupDetails: SubjectGroupDetail[],
    detailHeaders: string[],
) {
    const lines: string[] = [];

    lines.push(`# 审核报告 — ${projectName}`);
    lines.push("");
    lines.push(`> 导出时间：${datePart}`);
    lines.push("");

    // Part 1: Summary
    lines.push("## 一、总体概况");
    lines.push("");
    lines.push(`| 指标 | 数值 |`);
    lines.push(`| --- | --- |`);
    lines.push(`| 总题目数 | ${overallStats.total} |`);
    lines.push(`| 已通过 | ${overallStats.approved} |`);
    lines.push(`| 未通过 | ${overallStats.rejected} |`);
    lines.push(`| 待审核 | ${overallStats.pending} |`);
    lines.push(`| 通过率 | ${overallStats.passRate} |`);
    lines.push("");

    lines.push("### 按学科统计");
    lines.push("");
    lines.push("| 学科 | 总题目数 | 已通过 | 未通过 | 待审核 | 通过率 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const group of groupStats) {
        lines.push(
            `| ${markdownEscape(group.subject)} | ${group.total} | ${group.approved} | ${group.rejected} | ${group.pending} | ${group.passRate} |`,
        );
    }
    lines.push("");

    // Part 2: Per-subject details
    lines.push("## 二、分学科题目详情");
    lines.push("");

    for (const group of groupDetails) {
        lines.push(`### ${group.subject}`);
        lines.push("");

        if (!group.rows.length) {
            lines.push("_（暂无题目）_");
            lines.push("");
            continue;
        }

        for (const row of group.rows) {
            for (const header of detailHeaders) {
                const raw = formatCellValue(row[header] ?? "");
                const value = raw
                    .split("\n")
                    .map((l, i) => (i === 0 ? l : `  ${l}`))
                    .join("\n");
                lines.push(`**${header}**`);
                lines.push("");
                lines.push(value);
                lines.push("");
            }
            lines.push("---");
            lines.push("");
        }
    }

    return lines.join("\n");
}

function wrapMarkdownInHtml(markdown: string, projectName: string) {
    // Convert markdown to simple HTML (tables, headings, paragraphs)
    const htmlBody = markdown
        .split("\n")
        .reduce((acc, line) => {
            if (line.startsWith("# ")) {
                acc.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
            } else if (line.startsWith("## ")) {
                acc.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
            } else if (line.startsWith("### ")) {
                acc.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
            } else if (line.startsWith("> ")) {
                acc.push(
                    `<blockquote>${escapeHtml(line.slice(2))}</blockquote>`,
                );
            } else if (line === "---") {
                acc.push("<hr>");
            } else if (line.startsWith("| ") && line.includes(" --- ")) {
                // Skip separator rows but mark that the previous row was a header
                const lastRow = acc[acc.length - 1];
                if (lastRow?.startsWith("<tr>")) {
                    acc[acc.length - 1] = lastRow
                        .replaceAll("<td>", "<th>")
                        .replaceAll("</td>", "</th>");
                }
            } else if (line.startsWith("| ")) {
                const cells = line
                    .split("|")
                    .slice(1, -1)
                    .map((cell) => cell.trim());

                // If the previous line was not a table row, start a new table
                const prev = acc[acc.length - 1];
                if (!prev?.startsWith("<tr>") && !prev?.includes("<th>")) {
                    acc.push(
                        '<table border="1" cellpadding="6" cellspacing="0">',
                    );
                }

                acc.push(
                    `<tr>${cells.map((cell) => `<td>${escapeHtml(cell.replace(/\\[|]/g, "|").replace(/<br\/>/g, "\n"))}</td>`).join("")}</tr>`,
                );
            } else if (line.startsWith("**") && line.includes("**：")) {
                // **label**：value  -> <p><strong>label</strong>：value</p>
                const match = line.match(/^\*\*(.+?)\*\*：(.*)$/);
                if (match) {
                    acc.push(
                        `<p><strong>${escapeHtml(match[1])}</strong>：${escapeHtml(match[2].replace(/\s{2}$/, ""))}</p>`,
                    );
                } else {
                    acc.push(`<p>${escapeHtml(line)}</p>`);
                }
            } else if (line.startsWith("**") && line.endsWith("**")) {
                // Standalone bold: **label**
                acc.push(
                    `<p><strong>${escapeHtml(line.slice(2, -2))}</strong></p>`,
                );
            } else if (line.startsWith("_（") && line.endsWith("）_")) {
                acc.push(`<p><em>${escapeHtml(line.slice(2, -2))}</em></p>`);
            } else if (line === "") {
                // Close any open table
                const prev = acc[acc.length - 1];
                if (prev?.startsWith("<tr>") || prev?.includes("<th>")) {
                    acc.push("</table>");
                }
                acc.push("");
            } else if (line.trim()) {
                // Plain text content (field values, etc.)
                acc.push(`<p>${escapeHtml(line)}</p>`);
            }

            return acc;
        }, [] as string[])
        .join("\n");

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>审核报告 — ${escapeHtml(projectName)}</title>
<style>
  @page { margin: 20mm; }
  body {
    font-family: -apple-system, "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
    line-height: 1.7;
    color: #1a1a1a;
    max-width: 960px;
    margin: 0 auto;
    padding: 24px;
  }
  h1 { font-size: 22px; border-bottom: 2px solid #1a1a1a; padding-bottom: 8px; }
  h2 { font-size: 18px; margin-top: 32px; color: #333; }
  h3 { font-size: 15px; margin-top: 24px; color: #555; }
  blockquote { color: #666; border-left: 3px solid #ddd; padding-left: 12px; margin: 12px 0; }
  hr { border: none; border-top: 1px solid #e5e5e5; margin: 16px 0; }
  h3 + p { margin-top: 4px; }
  p { margin: 2px 0; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  th, td { border: 1px solid #d9d9d9; padding: 6px 10px; text-align: left; }
  th { background: #fafafa; font-weight: 600; }
  tr:nth-child(even) { background: #fafafa; }
  @media print {
    body { padding: 0; }
    h2 { page-break-before: auto; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
${htmlBody}
</body>
</html>`;
}

function escapeHtml(text: string) {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

export async function exportReviewReportAction(
    input: z.input<typeof exportReviewReportSchema>,
): Promise<ExportReviewQuestionsResult> {
    const session = await auth();

    if (!session?.user) {
        return { error: "请先登录后再导出。" };
    }

    const parsed = exportReviewReportSchema.safeParse(input);

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
        return { error: "你当前没有该项目的审核权限。" };
    }

    if (parsed.data.scope === "selected" && !parsed.data.questionIds.length) {
        return { error: "请先勾选至少 1 条题目后再导出。" };
    }

    const projectId = parsed.data.projectId;

    // --- Query questions ---
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
            projectId,
            ...(parsed.data.scope === "selected"
                ? { id: { in: uniqueQuestionIds } }
                : {}),
            status:
                statusCondition?.operator === "equals" && validStatusValue
                    ? { equals: validStatusValue }
                    : statusCondition?.operator === "notEquals" &&
                        validStatusValue
                      ? { not: validStatusValue }
                      : undefined,
            datasourceId:
                datasourceCondition?.operator === "equals"
                    ? { equals: datasourceCondition.value }
                    : datasourceCondition?.operator === "notEquals"
                      ? { not: datasourceCondition.value }
                      : undefined,
        },
        select: {
            id: true,
            title: true,
            status: true,
            updatedAt: true,
            externalRecordId: true,
            metadata: true,
            project: { select: { name: true, code: true } },
            datasource: { select: { id: true, name: true } },
        },
    });
    const visibleQuestions = (
        await Promise.all(
            questions.map(async (question) =>
                (await canUserAccessQuestionByMetadata(
                    session.user.id,
                    session.user.platformRole,
                    question.metadata,
                ))
                    ? question
                    : null,
            ),
        )
    ).filter((question) => question !== null);

    const reviewSummaryMap = await getLatestReviewSummaryMap(
        visibleQuestions.map((question) => ({
            projectId,
            datasourceId: question.datasource.id,
            externalRecordId: question.externalRecordId,
        })),
    );

    // --- Apply in-memory filters ---
    const filteredQuestions = visibleQuestions.filter((question) => {
        const rawRecord = normalizeRawRecord(question.metadata);
        const sourceRowNumber = extractSourceRowNumber(question.metadata);
        const reviewSummary = reviewSummaryMap.get(
            buildReviewCompositeKey({
                projectId,
                datasourceId: question.datasource.id,
                externalRecordId: question.externalRecordId,
            }),
        ) ?? { latestReview: null, aiReview: null, manualReview: null };

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
                if (condition.operator === "equals")
                    return fieldValue === condition.value;
                if (condition.operator === "notEquals")
                    return fieldValue !== condition.value;
                return true;
            }

            if (condition.fieldKey === "sourceRowNumber") {
                const targetValue = Number(condition.value);
                if (Number.isNaN(targetValue) || typeof fieldValue !== "number")
                    return false;
                if (condition.operator === "equals")
                    return fieldValue === targetValue;
                if (condition.operator === "gt")
                    return fieldValue > targetValue;
                if (condition.operator === "lt")
                    return fieldValue < targetValue;
                return true;
            }

            const normalizedFieldValue = String(fieldValue)
                .trim()
                .toLowerCase();
            const normalizedCompareValue = condition.value.trim().toLowerCase();

            if (condition.operator === "isEmpty") return !normalizedFieldValue;
            if (condition.operator === "isNotEmpty")
                return Boolean(normalizedFieldValue);
            if (condition.operator === "equals")
                return normalizedFieldValue === normalizedCompareValue;
            if (condition.operator === "notEquals")
                return normalizedFieldValue !== normalizedCompareValue;
            if (condition.operator === "notContains")
                return !normalizedFieldValue.includes(normalizedCompareValue);
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

    const orderedQuestions =
        parsed.data.scope === "selected"
            ? uniqueQuestionIds
                  .map((id) => filteredQuestions.find((q) => q.id === id))
                  .filter((q): q is NonNullable<typeof q> => Boolean(q))
            : filteredQuestions.sort((a, b) =>
                  a.externalRecordId.localeCompare(b.externalRecordId),
              );

    // --- Resolve subject field ---
    const subjectRawKey = parsed.data.subjectFieldKey.startsWith("raw:")
        ? parsed.data.subjectFieldKey.slice(4)
        : parsed.data.subjectFieldKey;

    // --- Group by subject ---
    const groupMap = new Map<
        string,
        Array<(typeof orderedQuestions)[number]>
    >();

    for (const question of orderedQuestions) {
        const rawRecord = normalizeRawRecord(question.metadata);
        const subject = rawRecord[subjectRawKey]?.trim() || "未分类";

        if (!groupMap.has(subject)) {
            groupMap.set(subject, []);
        }

        groupMap.get(subject)!.push(question);
    }

    // --- Compute stats ---
    const projectName =
        orderedQuestions[0]?.project.name ?? projectId;

    function computeGroupStats(
        subject: string,
        items: Array<(typeof orderedQuestions)[number]>,
    ): SubjectGroupStats {
        let approved = 0;
        let rejected = 0;

        for (const question of items) {
            const manualReview = reviewSummaryMap.get(
                buildReviewCompositeKey({
                    projectId,
                    datasourceId: question.datasource.id,
                    externalRecordId: question.externalRecordId,
                }),
            )?.manualReview;

            if (manualReview?.decision === "PASS") {
                approved += 1;
            } else if (manualReview?.decision === "REJECT") {
                rejected += 1;
            }
        }

        const pending = items.length - approved - rejected;

        return {
            subject,
            total: items.length,
            approved,
            rejected,
            pending,
            passRate: percent(approved, items.length),
        };
    }

    const groupStats: SubjectGroupStats[] = [];
    const groupDetails: SubjectGroupDetail[] = [];
    const detailHeaders = parsed.data.detailFieldKeys.map((key) =>
        fieldLabel(key),
    );

    let overallApproved = 0;
    let overallRejected = 0;

    for (const [subject, items] of groupMap) {
        const stats = computeGroupStats(subject, items);
        groupStats.push(stats);
        overallApproved += stats.approved;
        overallRejected += stats.rejected;

        // Build detail rows
        const rows = items.map((question) => {
            const rawRecord = normalizeRawRecord(question.metadata);
            const sourceRowNumber = extractSourceRowNumber(question.metadata);
            const reviewSummary = reviewSummaryMap.get(
                buildReviewCompositeKey({
                    projectId,
                    datasourceId: question.datasource.id,
                    externalRecordId: question.externalRecordId,
                }),
            ) ?? { latestReview: null, aiReview: null, manualReview: null };
            const latestReview = reviewSummary.latestReview;

            return Object.fromEntries(
                parsed.data.detailFieldKeys.map((fk) => {
                    const label = fieldLabel(fk);

                    if (fk.startsWith("raw:")) {
                        return [label, rawRecord[fk.slice(4)] ?? ""];
                    }

                    if (fk === "externalRecordId")
                        return [label, question.externalRecordId];
                    if (fk === "title") return [label, question.title];
                    if (fk === "status")
                        return [
                            label,
                            questionStatusLabelMap[question.status] ??
                                question.status,
                        ];
                    if (fk === "aiReviewStatus") {
                        const s = toReviewStatusValue(reviewSummary.aiReview);
                        return [label, reviewStatusLabelMap[s] ?? s];
                    }
                    if (fk === "manualReviewStatus") {
                        const s = toReviewStatusValue(
                            reviewSummary.manualReview,
                        );
                        return [label, reviewStatusLabelMap[s] ?? s];
                    }
                    if (fk === "updatedAt")
                        return [
                            label,
                            question.updatedAt.toLocaleString("zh-CN"),
                        ];
                    if (fk === "projectName")
                        return [label, question.project.name];
                    if (fk === "projectCode")
                        return [label, question.project.code];
                    if (fk === "datasourceName")
                        return [label, question.datasource.name];
                    if (fk === "sourceRowNumber")
                        return [
                            label,
                            sourceRowNumber != null
                                ? String(sourceRowNumber)
                                : "",
                        ];
                    if (fk === "reviewDecision")
                        return [
                            label,
                            latestReview
                                ? (reviewDecisionLabelMap[
                                      latestReview.decision
                                  ] ?? latestReview.decision)
                                : "",
                        ];
                    if (fk === "reviewComment")
                        return [label, latestReview?.comment ?? ""];
                    if (fk === "reviewReviewer")
                        return [label, latestReview?.reviewerName ?? ""];
                    if (fk === "reviewUpdatedAt")
                        return [
                            label,
                            latestReview?.updatedAt
                                ? new Date(
                                      latestReview.updatedAt,
                                  ).toLocaleString("zh-CN")
                                : "",
                        ];
                    return [label, ""];
                }),
            );
        });

        groupDetails.push({ subject, rows });
    }

    const overallStats: SubjectGroupStats = {
        subject: "总计",
        total: orderedQuestions.length,
        approved: overallApproved,
        rejected: overallRejected,
        pending: orderedQuestions.length - overallApproved - overallRejected,
        passRate: percent(overallApproved, orderedQuestions.length),
    };

    // --- Generate output ---
    const datePart = new Date().toLocaleString("zh-CN");
    const fileDate = new Date().toISOString().slice(0, 10);
    const fileNameBase = `review-report-${fileDate}`;
    const format = parsed.data.format as ReportFormat;

    const markdown = buildReportMarkdown(
        projectName,
        datePart,
        overallStats,
        groupStats,
        groupDetails,
        detailHeaders,
    );

    if (format === "markdown") {
        return {
            success: `审核报告已生成，共 ${orderedQuestions.length} 道题目，${groupStats.length} 个学科。`,
            fileName: `${fileNameBase}.md`,
            mimeType: "text/markdown;charset=utf-8",
            base64: toBase64(markdown),
        };
    }

    // HTML format (print-to-PDF ready)
    const html = wrapMarkdownInHtml(markdown, projectName);

    return {
        success: `审核报告已生成，共 ${orderedQuestions.length} 道题目，${groupStats.length} 个学科。可在浏览器中打开后通过 Ctrl+P 打印为 PDF。`,
        fileName: `${fileNameBase}.html`,
        mimeType: "text/html;charset=utf-8",
        base64: toBase64(html),
    };
}
