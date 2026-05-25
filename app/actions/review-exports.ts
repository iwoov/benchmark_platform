"use server";

import { createRequire } from "node:module";
import { z } from "zod";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
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

const requireFromProject = createRequire(`${process.cwd()}/package.json`);

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
    const shouldIncludeHistoricalRevisions =
        parsed.data.scope === "selected" ||
        (parsed.data.scope === "filteredAll" &&
            datasourceCondition?.operator === "equals" &&
            Boolean(datasourceCondition.value.trim()));
    const questions = await prisma.question.findMany({
        where: {
            projectId: parsed.data.projectId,
            isLatestRevision: shouldIncludeHistoricalRevisions
                ? undefined
                : true,
            ...(parsed.data.scope === "selected"
                ? {
                      id: {
                          in: uniqueQuestionIds,
                      },
                  }
                : {}),
            status:
                parsed.data.scope === "filteredAll" &&
                statusCondition?.operator === "equals" &&
                validStatusValue
                    ? {
                          equals: validStatusValue,
                      }
                    : parsed.data.scope === "filteredAll" &&
                        statusCondition?.operator === "notEquals" &&
                        validStatusValue
                      ? {
                            not: validStatusValue,
                        }
                      : undefined,
            datasourceId:
                parsed.data.scope === "filteredAll" &&
                datasourceCondition?.operator === "equals"
                    ? {
                          equals: datasourceCondition.value,
                      }
                    : parsed.data.scope === "filteredAll" &&
                        datasourceCondition?.operator === "notEquals"
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
        if (parsed.data.scope === "selected") {
            return true;
        }

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

const reportFormatSchema = z.enum(["markdown", "html", "pdf"]);

const exportReviewReportSchema = z.object({
    projectId: z.string().trim().min(1, "缺少项目 ID"),
    scope: exportScopeSchema.default("selected"),
    questionIds: z.array(z.string().trim().min(1)).default([]),
    filters: z.array(exportFilterConditionSchema).default([]),
    subjectFieldKey: z.string().trim().min(1, "请选择用于分组的学科字段"),
    detailFieldKeys: z
        .array(z.string().trim().min(1))
        .min(1, "请至少选择 1 个详情字段"),
    rejectedOnlyInDetails: z.boolean().default(false),
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

type PdfTableColumn<T> = {
    header: string;
    width: number;
    getValue: (row: T) => string | number;
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

function resolvePdfFontPath(weight: "regular" | "semibold") {
    const fontPath =
        weight === "semibold"
            ? "@expo-google-fonts/noto-sans-sc/600SemiBold/NotoSansSC_600SemiBold.ttf"
            : "@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf";

    return requireFromProject.resolve(fontPath);
}

async function buildReportPdf(
    projectName: string,
    datePart: string,
    overallStats: SubjectGroupStats,
    groupStats: SubjectGroupStats[],
    groupDetails: SubjectGroupDetail[],
    detailHeaders: string[],
) {
    const doc = new PDFDocument({
        size: "A4",
        margin: 40,
        bufferPages: true,
        info: {
            Title: `审核报告 - ${projectName}`,
            Author: "EvalCheck",
            Subject: "审核报告",
        },
    });
    const chunks: Buffer[] = [];
    const pdfBufferPromise = new Promise<Buffer>((resolve, reject) => {
        doc.on("data", (chunk: Buffer | Uint8Array) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
    });

    doc.registerFont("report-regular", resolvePdfFontPath("regular"));
    doc.registerFont("report-semibold", resolvePdfFontPath("semibold"));

    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const bottomLimit = () => doc.page.height - doc.page.margins.bottom;

    function ensureSpace(height: number) {
        if (doc.y + height > bottomLimit()) {
            doc.addPage();
        }
    }

    function textHeight(
        text: string,
        width: number,
        fontSize: number,
        fontName = "report-regular",
    ) {
        doc.font(fontName).fontSize(fontSize);
        return doc.heightOfString(text || " ", {
            width,
            lineGap: 2,
        });
    }

    function wrapTextLines(
        text: string,
        width: number,
        fontSize: number,
        fontName = "report-regular",
    ) {
        doc.font(fontName).fontSize(fontSize);

        const lines: string[] = [];
        const paragraphs = (text || " ")
            .replaceAll("\r\n", "\n")
            .replaceAll("\r", "\n")
            .split("\n");

        for (const paragraph of paragraphs) {
            if (!paragraph) {
                lines.push(" ");
                continue;
            }

            let line = "";

            for (const char of Array.from(paragraph)) {
                const candidate = `${line}${char}`;

                if (
                    !line ||
                    doc.widthOfString(candidate, { characterSpacing: 0 }) <=
                        width
                ) {
                    line = candidate;
                    continue;
                }

                lines.push(line);
                line = char;
            }

            if (line) {
                lines.push(line);
            }
        }

        return lines;
    }

    function drawPagedText(
        text: string,
        x: number,
        width: number,
        options: {
            fontName?: string;
            fontSize?: number;
            color?: string;
            lineGap?: number;
        } = {},
    ) {
        const fontName = options.fontName ?? "report-regular";
        const fontSize = options.fontSize ?? 9.5;
        const color = options.color ?? "#111827";
        const lineGap = options.lineGap ?? 1.5;
        const lines = wrapTextLines(text, width, fontSize, fontName);

        doc.font(fontName).fontSize(fontSize).fillColor(color);

        for (const line of lines) {
            const lineHeight = doc.currentLineHeight() + lineGap;

            if (doc.y + lineHeight > bottomLimit()) {
                doc.addPage();
            }

            doc.font(fontName)
                .fontSize(fontSize)
                .fillColor(color)
                .text(line, x, doc.y, {
                    width,
                    lineGap: 0,
                    lineBreak: false,
                });
            doc.y += lineGap;
        }
    }

    function drawSectionTitle(text: string) {
        ensureSpace(38);
        doc.moveDown(0.7);
        doc.font("report-semibold")
            .fontSize(16)
            .fillColor("#111827")
            .text(text, margin, doc.y, { width: contentWidth });
        doc.moveDown(0.5);
    }

    function drawSubsectionTitle(text: string) {
        ensureSpace(30);
        doc.moveDown(0.45);
        doc.font("report-semibold")
            .fontSize(13)
            .fillColor("#374151")
            .text(text, margin, doc.y, { width: contentWidth });
        doc.moveDown(0.35);
    }

    function drawParagraph(text: string, options?: { muted?: boolean }) {
        const normalized = text.trim() ? text : " ";
        const height = textHeight(normalized, contentWidth, 10.5);
        ensureSpace(Math.min(height + 6, 72));
        doc.font("report-regular")
            .fontSize(10.5)
            .fillColor(options?.muted ? "#6b7280" : "#1f2937")
            .text(normalized, margin, doc.y, {
                width: contentWidth,
                lineGap: 2,
            });
        doc.moveDown(0.25);
    }

    function drawDivider() {
        ensureSpace(16);
        const y = doc.y + 5;
        doc.moveTo(margin, y)
            .lineTo(margin + contentWidth, y)
            .lineWidth(0.5)
            .strokeColor("#e5e7eb")
            .stroke();
        doc.y = y + 10;
    }

    function drawTable<T>(columns: PdfTableColumn<T>[], rows: T[]) {
        const paddingX = 6;
        const paddingY = 5;
        const headerHeight = 24;

        function drawHeader() {
            ensureSpace(headerHeight + 12);
            let x = margin;
            const y = doc.y;

            doc.rect(margin, y, contentWidth, headerHeight)
                .fillColor("#f3f4f6")
                .fill();

            for (const column of columns) {
                doc.rect(x, y, column.width, headerHeight)
                    .lineWidth(0.5)
                    .strokeColor("#d1d5db")
                    .stroke();
                doc.font("report-semibold")
                    .fontSize(9.5)
                    .fillColor("#111827")
                    .text(column.header, x + paddingX, y + paddingY, {
                        width: column.width - paddingX * 2,
                        lineGap: 1,
                    });
                x += column.width;
            }

            doc.y = y + headerHeight;
        }

        drawHeader();

        for (const row of rows) {
            const cellHeights = columns.map((column) =>
                textHeight(
                    String(column.getValue(row) ?? ""),
                    column.width - paddingX * 2,
                    9.5,
                ),
            );
            const rowHeight = Math.max(24, Math.max(...cellHeights) + paddingY * 2);

            if (doc.y + rowHeight > bottomLimit()) {
                doc.addPage();
                drawHeader();
            }

            let x = margin;
            const y = doc.y;

            for (const column of columns) {
                doc.rect(x, y, column.width, rowHeight)
                    .lineWidth(0.5)
                    .strokeColor("#d1d5db")
                    .stroke();
                doc.font("report-regular")
                    .fontSize(9.5)
                    .fillColor("#1f2937")
                    .text(String(column.getValue(row) ?? ""), x + paddingX, y + paddingY, {
                        width: column.width - paddingX * 2,
                        lineGap: 1,
                    });
                x += column.width;
            }

            doc.y = y + rowHeight;
        }

        doc.moveDown(0.8);
    }

    function drawInlineFieldGrid(fields: Array<[string, string]>) {
        if (!fields.length) return;

        const columnGap = 10;
        const columnsPerRow = Math.min(3, fields.length);
        const columnWidth =
            (contentWidth - columnGap * (columnsPerRow - 1)) / columnsPerRow;
        const labelSize = 8.5;
        const valueSize = 9.5;
        const paddingY = 3;

        for (let index = 0; index < fields.length; index += columnsPerRow) {
            const rowFields = fields.slice(index, index + columnsPerRow);
            const rowHeight = Math.max(
                ...rowFields.map(([label, value]) => {
                    const labelHeight = textHeight(
                        label,
                        columnWidth,
                        labelSize,
                        "report-semibold",
                    );
                    const valueHeight = textHeight(
                        value || " ",
                        columnWidth,
                        valueSize,
                    );
                    return labelHeight + valueHeight + paddingY * 2;
                }),
            );

            ensureSpace(rowHeight + 2);

            const y = doc.y;

            rowFields.forEach(([label, value], fieldIndex) => {
                const x = margin + fieldIndex * (columnWidth + columnGap);
                doc.font("report-semibold")
                    .fontSize(labelSize)
                    .fillColor("#6b7280")
                    .text(label, x, y, {
                        width: columnWidth,
                        lineGap: 0,
                    });
                doc.font("report-regular")
                    .fontSize(valueSize)
                    .fillColor("#111827")
                    .text(value || " ", x, y + 12, {
                        width: columnWidth,
                        lineGap: 1,
                    });
            });

            doc.y = y + rowHeight + 2;
        }

        doc.moveDown(0.15);
    }

    function drawTextBlock(label: string, value: string) {
        const normalized = value.trim() ? value.trim() : " ";
        ensureSpace(36);
        doc.font("report-semibold")
            .fontSize(9)
            .fillColor("#6b7280")
            .text(label, margin, doc.y, { width: contentWidth });
        doc.moveDown(0.1);
        drawPagedText(normalized, margin, contentWidth, {
            fontName: "report-regular",
            fontSize: 9.5,
            color: "#111827",
            lineGap: 1.5,
        });
        doc.moveDown(0.25);
    }

    doc.font("report-semibold")
        .fontSize(20)
        .fillColor("#111827")
        .text(`审核报告 - ${projectName}`, margin, doc.y, {
            width: contentWidth,
        });
    doc.moveDown(0.35);
    doc.font("report-regular")
        .fontSize(10.5)
        .fillColor("#6b7280")
        .text(`导出时间：${datePart}`, margin, doc.y, { width: contentWidth });
    drawDivider();

    drawSectionTitle("一、总体概况");
    drawTable(
        [
            { header: "指标", width: 160, getValue: (row) => row[0] },
            { header: "数值", width: contentWidth - 160, getValue: (row) => row[1] },
        ],
        [
            ["总题目数", overallStats.total],
            ["已通过", overallStats.approved],
            ["未通过", overallStats.rejected],
            ["待审核", overallStats.pending],
            ["通过率", overallStats.passRate],
        ] as Array<[string, string | number]>,
    );

    drawSubsectionTitle("按学科统计");
    drawTable(
        [
            { header: "学科", width: 152, getValue: (row) => row.subject },
            { header: "总题目数", width: 72, getValue: (row) => row.total },
            { header: "已通过", width: 66, getValue: (row) => row.approved },
            { header: "未通过", width: 66, getValue: (row) => row.rejected },
            { header: "待审核", width: 66, getValue: (row) => row.pending },
            {
                header: "通过率",
                width: contentWidth - 152 - 72 - 66 - 66 - 66,
                getValue: (row) => row.passRate,
            },
        ],
        groupStats,
    );

    drawSectionTitle("二、分学科题目详情");

    for (const group of groupDetails) {
        drawSubsectionTitle(group.subject);

        if (!group.rows.length) {
            drawParagraph("（暂无题目）", { muted: true });
            continue;
        }

        group.rows.forEach((row, index) => {
            ensureSpace(28);
            doc.font("report-semibold")
                .fontSize(11)
                .fillColor("#111827")
                .text(`题目 ${index + 1}`, margin, doc.y, {
                    width: contentWidth,
                });
            doc.moveDown(0.12);

            const inlineFields: Array<[string, string]> = [];
            const textBlocks: Array<[string, string]> = [];

            for (const header of detailHeaders) {
                const value = formatCellValue(row[header] ?? "").trim();

                if (header === "审核意见") {
                    textBlocks.push([header, value]);
                } else {
                    inlineFields.push([header, value]);
                }
            }

            drawInlineFieldGrid(inlineFields);

            for (const [label, value] of textBlocks) {
                drawTextBlock(label, value);
            }

            drawDivider();
        });
    }

    const pageRange = doc.bufferedPageRange();
    for (let i = pageRange.start; i < pageRange.start + pageRange.count; i += 1) {
        doc.switchToPage(i);
        doc.font("report-regular")
            .fontSize(9)
            .fillColor("#9ca3af")
            .text(`${i + 1} / ${pageRange.count}`, margin, doc.page.height - 34, {
                width: contentWidth,
                align: "center",
            });
    }

    doc.end();

    return pdfBufferPromise;
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
    const shouldIncludeHistoricalRevisions =
        parsed.data.scope === "selected" ||
        (parsed.data.scope === "filteredAll" &&
            datasourceCondition?.operator === "equals" &&
            Boolean(datasourceCondition.value.trim()));

    const questions = await prisma.question.findMany({
        where: {
            projectId,
            isLatestRevision: shouldIncludeHistoricalRevisions
                ? undefined
                : true,
            ...(parsed.data.scope === "selected"
                ? { id: { in: uniqueQuestionIds } }
                : {}),
            status:
                parsed.data.scope === "filteredAll" &&
                statusCondition?.operator === "equals" &&
                validStatusValue
                    ? { equals: validStatusValue }
                    : parsed.data.scope === "filteredAll" &&
                        statusCondition?.operator === "notEquals" &&
                        validStatusValue
                      ? { not: validStatusValue }
                      : undefined,
            datasourceId:
                parsed.data.scope === "filteredAll" &&
                datasourceCondition?.operator === "equals"
                    ? { equals: datasourceCondition.value }
                    : parsed.data.scope === "filteredAll" &&
                        datasourceCondition?.operator === "notEquals"
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
        if (parsed.data.scope === "selected") {
            return true;
        }

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
        const rows = items
            .filter((question) => {
                if (!parsed.data.rejectedOnlyInDetails) {
                    return true;
                }

                const reviewSummary = reviewSummaryMap.get(
                    buildReviewCompositeKey({
                        projectId,
                        datasourceId: question.datasource.id,
                        externalRecordId: question.externalRecordId,
                    }),
                ) ?? { latestReview: null, aiReview: null, manualReview: null };

                return reviewSummary.latestReview?.decision === "REJECT";
            })
            .map((question) => {
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

    if (format === "pdf") {
        let pdf: Buffer;

        try {
            pdf = await buildReportPdf(
                projectName,
                datePart,
                overallStats,
                groupStats,
                groupDetails,
                detailHeaders,
            );
        } catch (error) {
            return {
                error:
                    error instanceof Error
                        ? `PDF 生成失败：${error.message}`
                        : "PDF 生成失败，请稍后再试。",
            };
        }

        return {
            success: `审核报告已生成，共 ${orderedQuestions.length} 道题目，${groupStats.length} 个学科。`,
            fileName: `${fileNameBase}.pdf`,
            mimeType: "application/pdf",
            base64: toBase64(pdf),
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
