import { prisma } from "@/lib/db/prisma";

function normalizeRawValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.replace(/\s+/g, " ").trim();
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractRawRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {} as Record<string, string>;
  }

  const rawRecord = (metadata as Record<string, unknown>).rawRecord;

  if (!rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord)) {
    return {} as Record<string, string>;
  }

  return Object.fromEntries(
    Object.entries(rawRecord as Record<string, unknown>).map(([key, value]) => [
      key,
      normalizeRawValue(value),
    ]),
  );
}

function extractSourceRowNumber(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const sourceRowNumber = (metadata as Record<string, unknown>).sourceRowNumber;

  return typeof sourceRowNumber === "number" ? sourceRowNumber : null;
}

function extractRawFieldOrder(syncConfig: unknown) {
  if (
    !syncConfig ||
    typeof syncConfig !== "object" ||
    Array.isArray(syncConfig)
  ) {
    return [] as string[];
  }

  const rawFieldOrder = (syncConfig as Record<string, unknown>).rawFieldOrder;

  if (!Array.isArray(rawFieldOrder)) {
    return [] as string[];
  }

  return rawFieldOrder.filter(
    (value): value is string =>
      typeof value === "string" && Boolean(value.trim()),
  );
}

export type ReviewProjectOption = {
  id: string;
  name: string;
  code: string;
};

export type ReviewQuestionListItem = {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  datasourceId: string;
  datasourceName: string;
  externalRecordId: string;
  title: string;
  status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  updatedAt: string;
  sourceRowNumber: number | null;
  rawRecord: Record<string, string>;
  rawFieldOrder: string[];
};

export async function getReviewQuestionListData(projectIds?: string[]) {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  const rows = await prisma.question.findMany({
    where:
      projectIds && projectIds.length
        ? {
            projectId: {
              in: projectIds,
            },
          }
        : undefined,
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
      metadata: true,
      externalRecordId: true,
      project: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      datasource: {
        select: {
          id: true,
          name: true,
          syncConfig: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  return rows.map<ReviewQuestionListItem>((question) => ({
    id: question.id,
    projectId: question.project.id,
    projectName: question.project.name,
    projectCode: question.project.code,
    datasourceId: question.datasource.id,
    datasourceName: question.datasource.name,
    externalRecordId: question.externalRecordId,
    title: question.title,
    status: question.status,
    updatedAt: question.updatedAt.toISOString(),
    sourceRowNumber: extractSourceRowNumber(question.metadata),
    rawRecord: extractRawRecord(question.metadata),
    rawFieldOrder: extractRawFieldOrder(question.datasource.syncConfig),
  }));
}
