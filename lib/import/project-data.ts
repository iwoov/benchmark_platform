import type { Prisma } from "@prisma/client";
import { QuestionStatus } from "@prisma/client";
import { read, utils } from "xlsx";

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;

const fieldAliases = {
  title: ["title", "题目标题", "标题", "questiontitle", "name", "题目名称"],
  content: [
    "content",
    "题目内容",
    "内容",
    "question",
    "prompt",
    "题干",
    "题目",
  ],
  answer: ["answer", "参考答案", "答案", "correctanswer"],
  analysis: ["analysis", "解析", "explanation", "详解"],
  questionType: ["questiontype", "题型", "类型", "type"],
  difficulty: ["difficulty", "难度", "level"],
  status: ["status", "状态"],
} satisfies Record<string, string[]>;

type ParsedRow = {
  externalRecordId: string;
  title: string;
  content: string;
  answer: string | null;
  analysis: string | null;
  questionType: string | null;
  difficulty: string | null;
  status: QuestionStatus;
  metadata: Prisma.InputJsonObject;
};

export type ParsedImportPayload = {
  datasourceType: "JSON_UPLOAD" | "EXCEL_UPLOAD";
  defaultName: string;
  fieldMapping: Record<string, string>;
  rows: ParsedRow[];
  totalRowCount: number;
  skippedRowCount: number;
  originalFileName: string;
};

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s_\-()[\]{}<>./\\:：，,;；'"`~!@#$%^&*+=|?！？]/g, "");
}

function trimToNull(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const stringValue = String(value).trim();
  return stringValue ? stringValue : null;
}

function toJsonSafeValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafeValue(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        toJsonSafeValue(item),
      ]),
    ) as Prisma.InputJsonObject;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return String(value);
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "");
}

function detectDatasourceType(
  fileName: string,
): ParsedImportPayload["datasourceType"] {
  const lowerFileName = fileName.toLowerCase();

  if (lowerFileName.endsWith(".json")) {
    return "JSON_UPLOAD";
  }

  if (lowerFileName.endsWith(".xlsx") || lowerFileName.endsWith(".xls")) {
    return "EXCEL_UPLOAD";
  }

  throw new Error("仅支持导入 .json、.xlsx 或 .xls 文件。");
}

function buildFieldMapping(keys: string[]) {
  const normalizedKeyMap = new Map(keys.map((key) => [normalizeKey(key), key]));
  const mapping = Object.fromEntries(
    Object.keys(fieldAliases).map((field) => [field, ""]),
  ) as Record<keyof typeof fieldAliases, string>;

  for (const field of Object.keys(fieldAliases) as Array<
    keyof typeof fieldAliases
  >) {
    const matchedAlias = fieldAliases[field].find((alias) =>
      normalizedKeyMap.has(normalizeKey(alias)),
    );

    if (matchedAlias) {
      mapping[field] = normalizedKeyMap.get(normalizeKey(matchedAlias)) ?? "";
    }
  }

  const nonEmptyKeys = keys.filter((key) => trimToNull(key));

  if (!mapping.title && nonEmptyKeys[0]) {
    mapping.title = nonEmptyKeys[0];
  }

  if (!mapping.content) {
    mapping.content =
      nonEmptyKeys.find((key) => key !== mapping.title) ?? mapping.title;
  }

  return mapping;
}

function normalizeStatus(value: unknown): QuestionStatus {
  const normalized = trimToNull(value)?.toLowerCase();

  if (!normalized) {
    return "DRAFT";
  }

  if (["submitted", "已提交", "待提交", "pending"].includes(normalized)) {
    return "SUBMITTED";
  }

  if (
    ["underreview", "under_review", "待审核", "reviewing", "审核中"].includes(
      normalized.replace(/\s+/g, ""),
    )
  ) {
    return "UNDER_REVIEW";
  }

  if (["approved", "通过", "pass", "passed"].includes(normalized)) {
    return "APPROVED";
  }

  if (["rejected", "驳回", "reject", "rejecteded"].includes(normalized)) {
    return "REJECTED";
  }

  return "DRAFT";
}

function getUniqueExternalRecordId(
  baseId: string,
  seenRecordIds: Set<string>,
  fallbackPrefix: string,
  rowIndex: number,
) {
  const initialId = trimToNull(baseId) ?? `${fallbackPrefix}-${rowIndex + 1}`;
  let candidate = initialId;
  let suffix = 1;

  while (seenRecordIds.has(candidate)) {
    suffix += 1;
    candidate = `${initialId}-${suffix}`;
  }

  seenRecordIds.add(candidate);
  return candidate;
}

function normalizeRecord(
  rawRecord: Record<string, unknown>,
  rowIndex: number,
  fieldMapping: Record<string, string>,
  seenRecordIds: Set<string>,
  datasourceType: ParsedImportPayload["datasourceType"],
): ParsedRow | null {
  const rawTitle = trimToNull(rawRecord[fieldMapping.title]);
  const rawContent = trimToNull(rawRecord[fieldMapping.content]);
  const answer = trimToNull(rawRecord[fieldMapping.answer]);
  const analysis = trimToNull(rawRecord[fieldMapping.analysis]);
  const questionType = trimToNull(rawRecord[fieldMapping.questionType]);
  const difficulty = trimToNull(rawRecord[fieldMapping.difficulty]);

  if (
    !rawTitle &&
    !rawContent &&
    !answer &&
    !analysis &&
    !questionType &&
    !difficulty
  ) {
    return null;
  }

  const title =
    rawTitle ?? rawContent?.slice(0, 60) ?? `未命名题目 ${rowIndex + 1}`;
  const content = rawContent ?? rawTitle ?? title;
  const externalRecordId = getUniqueExternalRecordId(
    String(
      rawRecord.externalRecordId ??
        rawRecord.recordId ??
        rawRecord.id ??
        rawRecord.ID ??
        "",
    ),
    seenRecordIds,
    datasourceType === "JSON_UPLOAD" ? "json" : "excel",
    rowIndex,
  );

  return {
    externalRecordId,
    title,
    content,
    answer,
    analysis,
    questionType,
    difficulty,
    status: normalizeStatus(rawRecord[fieldMapping.status]),
    metadata: {
      sourceRowNumber: rowIndex + 1,
      rawRecord: toJsonSafeValue(rawRecord) as Prisma.InputJsonObject,
    },
  } satisfies ParsedRow;
}

function parseJsonRecords(jsonValue: unknown) {
  if (Array.isArray(jsonValue)) {
    return jsonValue;
  }

  if (jsonValue && typeof jsonValue === "object") {
    const candidate = jsonValue as Record<string, unknown>;
    const listValue = [candidate.records, candidate.items, candidate.data].find(
      (value) => Array.isArray(value),
    );

    if (Array.isArray(listValue)) {
      return listValue;
    }
  }

  throw new Error(
    "JSON 文件内容必须是对象数组，或包含 records/items/data 数组。",
  );
}

function ensureObjectRows(records: unknown[]) {
  return records.flatMap((record) =>
    record && typeof record === "object" && !Array.isArray(record)
      ? [record as Record<string, unknown>]
      : [],
  );
}

export async function parseImportedProjectData(
  file: File,
): Promise<ParsedImportPayload> {
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    throw new Error("导入文件不能超过 10MB。");
  }

  const datasourceType = detectDatasourceType(file.name);
  const arrayBuffer = await file.arrayBuffer();
  const sourceRows =
    datasourceType === "JSON_UPLOAD"
      ? ensureObjectRows(
          parseJsonRecords(
            JSON.parse(Buffer.from(arrayBuffer).toString("utf8")),
          ),
        )
      : (() => {
          const workbook = read(Buffer.from(arrayBuffer), {
            type: "buffer",
            cellDates: true,
          });
          const firstSheetName = workbook.SheetNames[0];

          if (!firstSheetName) {
            throw new Error("Excel 文件中没有可读取的工作表。");
          }

          return utils.sheet_to_json<Record<string, unknown>>(
            workbook.Sheets[firstSheetName],
            {
              defval: "",
            },
          );
        })();

  if (!sourceRows.length) {
    throw new Error("导入文件中没有可用的数据记录。");
  }

  const fieldMapping = buildFieldMapping(
    Array.from(
      sourceRows.reduce((keys, row) => {
        Object.keys(row).forEach((key) => keys.add(key));
        return keys;
      }, new Set<string>()),
    ),
  );
  const seenRecordIds = new Set<string>();
  const rows = sourceRows
    .map((row, rowIndex) =>
      normalizeRecord(
        row,
        rowIndex,
        fieldMapping,
        seenRecordIds,
        datasourceType,
      ),
    )
    .flatMap((row) => (row ? [row] : []));

  if (!rows.length) {
    throw new Error("没有识别到可导入的题目字段，请至少提供标题或内容列。");
  }

  return {
    datasourceType,
    defaultName: stripExtension(file.name),
    fieldMapping: Object.fromEntries(
      Object.entries(fieldMapping).filter(([, value]) => Boolean(value)),
    ),
    rows,
    totalRowCount: sourceRows.length,
    skippedRowCount: sourceRows.length - rows.length,
    originalFileName: file.name,
  };
}
