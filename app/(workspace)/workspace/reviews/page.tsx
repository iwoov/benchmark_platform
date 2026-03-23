import { QuestionStatus } from "@prisma/client";
import { auth } from "@/auth";
import { ReviewQuestionList } from "@/components/workspace/review-question-list";
import { prisma } from "@/lib/db/prisma";
import { getWorkspaceContext } from "@/lib/workspace/context";

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

type ReviewQuestion = {
  id: string;
  status: QuestionStatus;
  updatedAt: Date;
  metadata: unknown;
  project: {
    id: string;
    name: string;
    code: string;
  };
  datasource: {
    id: string;
    name: string;
    syncConfig: unknown;
  };
};

export default async function WorkspaceReviewsPage() {
  const session = await auth();
  const workspaceContext = session?.user
    ? await getWorkspaceContext(session.user.id)
    : null;

  const reviewerProjectIds =
    workspaceContext?.reviewerProjects.map(
      (membership) => membership.project.id,
    ) ?? [];

  const questionRows: ReviewQuestion[] =
    reviewerProjectIds.length && process.env.DATABASE_URL
      ? await prisma.question.findMany({
          where: {
            projectId: {
              in: reviewerProjectIds,
            },
          },
          select: {
            id: true,
            status: true,
            updatedAt: true,
            metadata: true,
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
        })
      : [];

  return (
    <ReviewQuestionList
      canReview={Boolean(workspaceContext?.canReview)}
      projects={(workspaceContext?.reviewerProjects ?? []).map(
        (membership) => ({
          id: membership.project.id,
          name: membership.project.name,
          code: membership.project.code,
        }),
      )}
      questions={questionRows.map((question) => ({
        id: question.id,
        projectId: question.project.id,
        projectName: question.project.name,
        projectCode: question.project.code,
        datasourceId: question.datasource.id,
        datasourceName: question.datasource.name,
        status: question.status,
        updatedAt: question.updatedAt.toISOString(),
        sourceRowNumber: extractSourceRowNumber(question.metadata),
        rawRecord: extractRawRecord(question.metadata),
        rawFieldOrder: extractRawFieldOrder(question.datasource.syncConfig),
      }))}
    />
  );
}
