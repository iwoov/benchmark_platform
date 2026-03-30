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

    if (
        !rawRecord ||
        typeof rawRecord !== "object" ||
        Array.isArray(rawRecord)
    ) {
        return {} as Record<string, string>;
    }

    return Object.fromEntries(
        Object.entries(rawRecord as Record<string, unknown>).map(
            ([key, value]) => [key, normalizeRawValue(value)],
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

function parseExternalRecordOrder(value: string) {
    const match = value.match(/(\d+)(?!.*\d)/);

    if (!match) {
        return Number.POSITIVE_INFINITY;
    }

    return Number(match[1]);
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

export type ReviewQuestionDetail = {
    id: string;
    title: string;
    content: string;
    answer: string | null;
    analysis: string | null;
    questionType: string | null;
    difficulty: string | null;
    externalRecordId: string;
    status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
    updatedAt: string;
    project: {
        id: string;
        name: string;
        code: string;
    };
    datasource: {
        id: string;
        name: string;
    };
    sourceRowNumber: number | null;
    rawRecord: Record<string, string>;
    rawFieldOrder: string[];
};

export type ReviewQuestionNavigation = {
    previousQuestionId: string | null;
    nextQuestionId: string | null;
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
        orderBy: [{ createdAt: "asc" }],
    });

    return rows
        .sort((left, right) => {
            const externalOrderDiff =
                parseExternalRecordOrder(left.externalRecordId) -
                parseExternalRecordOrder(right.externalRecordId);

            if (externalOrderDiff !== 0) {
                return externalOrderDiff;
            }

            return left.externalRecordId.localeCompare(right.externalRecordId);
        })
        .map<ReviewQuestionListItem>((question) => ({
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

export async function getReviewQuestionDetail(questionId: string) {
    if (!process.env.DATABASE_URL) {
        return null;
    }

    const question = await prisma.question.findUnique({
        where: {
            id: questionId,
        },
        select: {
            id: true,
            title: true,
            content: true,
            answer: true,
            analysis: true,
            questionType: true,
            difficulty: true,
            externalRecordId: true,
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
    });

    if (!question) {
        return null;
    }

    return {
        id: question.id,
        title: question.title,
        content: question.content,
        answer: question.answer,
        analysis: question.analysis,
        questionType: question.questionType,
        difficulty: question.difficulty,
        externalRecordId: question.externalRecordId,
        status: question.status,
        updatedAt: question.updatedAt.toISOString(),
        project: question.project,
        datasource: {
            id: question.datasource.id,
            name: question.datasource.name,
        },
        sourceRowNumber: extractSourceRowNumber(question.metadata),
        rawRecord: extractRawRecord(question.metadata),
        rawFieldOrder: extractRawFieldOrder(question.datasource.syncConfig),
    } satisfies ReviewQuestionDetail;
}

export async function getReviewQuestionNavigation(questionId: string) {
    if (!process.env.DATABASE_URL) {
        return {
            previousQuestionId: null,
            nextQuestionId: null,
        } satisfies ReviewQuestionNavigation;
    }

    const currentQuestion = await prisma.question.findUnique({
        where: {
            id: questionId,
        },
        select: {
            id: true,
            projectId: true,
        },
    });

    if (!currentQuestion) {
        return {
            previousQuestionId: null,
            nextQuestionId: null,
        } satisfies ReviewQuestionNavigation;
    }

    const orderedQuestions = await prisma.question.findMany({
        where: {
            projectId: currentQuestion.projectId,
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
            id: true,
        },
    });

    const currentIndex = orderedQuestions.findIndex(
        (question) => question.id === questionId,
    );

    if (currentIndex < 0) {
        return {
            previousQuestionId: null,
            nextQuestionId: null,
        } satisfies ReviewQuestionNavigation;
    }

    return {
        previousQuestionId: orderedQuestions[currentIndex - 1]?.id ?? null,
        nextQuestionId: orderedQuestions[currentIndex + 1]?.id ?? null,
    } satisfies ReviewQuestionNavigation;
}
