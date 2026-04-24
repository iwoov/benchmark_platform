import { prisma } from "@/lib/db/prisma";
import { readImageFields, readImageMap } from "@/lib/datasources/sync-config";
import { getProjectReviewFieldCatalog } from "@/lib/reviews/field-preferences";
import type { ReviewQuestionFilterCondition } from "@/lib/reviews/question-list-filters";
import {
    buildReviewCompositeKey,
    getLatestReviewSummaryMap,
    toReviewStatusValue,
    type ReviewSummary,
    type ReviewStatusValue,
} from "@/lib/reviews/review-summary";

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
    aiReview: ReviewSummary | null;
    manualReview: ReviewSummary | null;
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
    imageFields: string[];
    imageMap: Record<string, string[]> | null;
    savedTranslations: Record<
        string,
        { translatedText: string; sourceLanguage: string | null }
    >;
};

type ReviewAwareQuestionRecord = {
    status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
    datasourceId: string;
    sourceRowNumber: number | null;
    rawRecord: Record<string, string>;
    aiReview: ReviewSummary | null;
    manualReview: ReviewSummary | null;
};

function toReviewAwareQuestionRecord(input: {
    status: ReviewAwareQuestionRecord["status"];
    datasourceId: string;
    metadata: unknown;
    aiReview: ReviewSummary | null;
    manualReview: ReviewSummary | null;
}) {
    return {
        status: input.status,
        datasourceId: input.datasourceId,
        sourceRowNumber: extractSourceRowNumber(input.metadata),
        rawRecord: extractRawRecord(input.metadata),
        aiReview: input.aiReview,
        manualReview: input.manualReview,
    } satisfies ReviewAwareQuestionRecord;
}

function isValidReviewStatusValue(value: string): value is ReviewStatusValue {
    return value === "PASS" || value === "REJECT" || value === "NONE";
}

function getConditionFieldValue(
    question: ReviewAwareQuestionRecord,
    condition: ReviewQuestionFilterCondition,
) {
    if (condition.fieldKey === "status") {
        return question.status;
    }

    if (condition.fieldKey === "aiReviewStatus") {
        return toReviewStatusValue(question.aiReview);
    }

    if (condition.fieldKey === "manualReviewStatus") {
        return toReviewStatusValue(question.manualReview);
    }

    if (condition.fieldKey === "datasourceId") {
        return question.datasourceId;
    }

    if (condition.fieldKey === "sourceRowNumber") {
        return question.sourceRowNumber;
    }

    return question.rawRecord[condition.fieldKey.slice(4)] ?? "";
}

function matchesQuestionCondition(
    question: ReviewAwareQuestionRecord,
    condition: ReviewQuestionFilterCondition,
) {
    const fieldValue = getConditionFieldValue(question, condition);

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

        if (Number.isNaN(targetValue) || typeof fieldValue !== "number") {
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

    const normalizedFieldValue = String(fieldValue).trim().toLowerCase();
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
}

export type ReviewQuestionNavigation = {
    previousQuestionId: string | null;
    nextQuestionId: string | null;
};

type NavigationContext = {
    questionId: string;
    projectId?: string;
    conditions?: ReviewQuestionFilterCondition[];
};

export type ReviewQuestionListPageData = {
    items: ReviewQuestionListItem[];
    total: number;
    page: number;
    pageSize: number;
};

export type ReviewQuestionListFilterMeta = {
    datasourceOptions: Array<{
        value: string;
        label: string;
    }>;
    rawFieldOptions: Array<{
        key: string;
        label: string;
    }>;
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
    const reviewSummaryMap = await getLatestReviewSummaryMap(
        rows.map((question) => ({
            projectId: question.project.id,
            datasourceId: question.datasource.id,
            externalRecordId: question.externalRecordId,
        })),
    );

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
        .map<ReviewQuestionListItem>((question) => {
            const reviewSummary = reviewSummaryMap.get(
                buildReviewCompositeKey({
                    projectId: question.project.id,
                    datasourceId: question.datasource.id,
                    externalRecordId: question.externalRecordId,
                }),
            ) ?? {
                latestReview: null,
                aiReview: null,
                manualReview: null,
            };

            return {
                id: question.id,
                projectId: question.project.id,
                projectName: question.project.name,
                projectCode: question.project.code,
                datasourceId: question.datasource.id,
                datasourceName: question.datasource.name,
                externalRecordId: question.externalRecordId,
                title: question.title,
                status: question.status,
                aiReview: reviewSummary.aiReview,
                manualReview: reviewSummary.manualReview,
                updatedAt: question.updatedAt.toISOString(),
                sourceRowNumber: extractSourceRowNumber(question.metadata),
                rawRecord: extractRawRecord(question.metadata),
                rawFieldOrder: extractRawFieldOrder(
                    question.datasource.syncConfig,
                ),
            };
        });
}

export async function getReviewQuestionListPageData({
    projectId,
    datasourceId,
    page = 1,
    pageSize = 50,
    conditions = [],
    subjectTitles,
}: {
    projectId: string;
    datasourceId?: string;
    page?: number;
    pageSize?: number;
    conditions?: ReviewQuestionFilterCondition[];
    subjectTitles?: string[];
}): Promise<ReviewQuestionListPageData> {
    if (!process.env.DATABASE_URL || !projectId) {
        return {
            items: [],
            total: 0,
            page: 1,
            pageSize,
        };
    }

    const normalizedPageSize = [20, 50, 100].includes(pageSize) ? pageSize : 50;
    const statusCondition = conditions.find(
        (condition) => condition.fieldKey === "status",
    );
    const datasourceCondition = conditions.find(
        (condition) => condition.fieldKey === "datasourceId",
    );
    const aiReviewStatusCondition = conditions.find(
        (condition) => condition.fieldKey === "aiReviewStatus",
    );
    const manualReviewStatusCondition = conditions.find(
        (condition) => condition.fieldKey === "manualReviewStatus",
    );
    const validStatusValue =
        statusCondition?.value === "DRAFT" ||
        statusCondition?.value === "SUBMITTED" ||
        statusCondition?.value === "UNDER_REVIEW" ||
        statusCondition?.value === "APPROVED" ||
        statusCondition?.value === "REJECTED"
            ? statusCondition.value
            : null;
    const validAiReviewStatusValue = aiReviewStatusCondition?.value
        ? isValidReviewStatusValue(aiReviewStatusCondition.value)
            ? aiReviewStatusCondition.value
            : null
        : null;
    const validManualReviewStatusValue = manualReviewStatusCondition?.value
        ? isValidReviewStatusValue(manualReviewStatusCondition.value)
            ? manualReviewStatusCondition.value
            : null
        : null;
    const candidateRows = await prisma.question.findMany({
        where: {
            projectId,
            title:
                subjectTitles && subjectTitles.length
                    ? { in: subjectTitles }
                    : undefined,
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
            datasourceId: datasourceId
                ? { equals: datasourceId }
                : datasourceCondition?.operator === "equals"
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
    });
    const reviewSummaryMap = await getLatestReviewSummaryMap(
        candidateRows.map((question) => ({
            projectId: question.project.id,
            datasourceId: question.datasource.id,
            externalRecordId: question.externalRecordId,
        })),
    );
    const sortedRows = candidateRows
        .map<ReviewQuestionListItem>((question) => {
            const reviewSummary = reviewSummaryMap.get(
                buildReviewCompositeKey({
                    projectId: question.project.id,
                    datasourceId: question.datasource.id,
                    externalRecordId: question.externalRecordId,
                }),
            ) ?? {
                latestReview: null,
                aiReview: null,
                manualReview: null,
            };

            return {
                id: question.id,
                projectId: question.project.id,
                projectName: question.project.name,
                projectCode: question.project.code,
                datasourceId: question.datasource.id,
                datasourceName: question.datasource.name,
                externalRecordId: question.externalRecordId,
                title: question.title,
                status: question.status,
                aiReview: reviewSummary.aiReview,
                manualReview: reviewSummary.manualReview,
                updatedAt: question.updatedAt.toISOString(),
                sourceRowNumber: extractSourceRowNumber(question.metadata),
                rawRecord: extractRawRecord(question.metadata),
                rawFieldOrder: extractRawFieldOrder(
                    question.datasource.syncConfig,
                ),
            };
        })
        .filter((question) => {
            if (
                aiReviewStatusCondition?.operator === "equals" &&
                validAiReviewStatusValue &&
                toReviewStatusValue(question.aiReview) !==
                    validAiReviewStatusValue
            ) {
                return false;
            }

            if (
                aiReviewStatusCondition?.operator === "notEquals" &&
                validAiReviewStatusValue &&
                toReviewStatusValue(question.aiReview) ===
                    validAiReviewStatusValue
            ) {
                return false;
            }

            if (
                manualReviewStatusCondition?.operator === "equals" &&
                validManualReviewStatusValue &&
                toReviewStatusValue(question.manualReview) !==
                    validManualReviewStatusValue
            ) {
                return false;
            }

            if (
                manualReviewStatusCondition?.operator === "notEquals" &&
                validManualReviewStatusValue &&
                toReviewStatusValue(question.manualReview) ===
                    validManualReviewStatusValue
            ) {
                return false;
            }

            return conditions.every((condition) =>
                matchesQuestionCondition(question, condition),
            );
        })
        .sort((left, right) => {
            const externalOrderDiff =
                parseExternalRecordOrder(left.externalRecordId) -
                parseExternalRecordOrder(right.externalRecordId);

            if (externalOrderDiff !== 0) {
                return externalOrderDiff;
            }

            return left.externalRecordId.localeCompare(right.externalRecordId);
        });
    const total = sortedRows.length;
    const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
    const normalizedPage = Math.min(Math.max(1, page), totalPages);
    const pageItems = sortedRows.slice(
        (normalizedPage - 1) * normalizedPageSize,
        normalizedPage * normalizedPageSize,
    );

    if (!pageItems.length) {
        return {
            items: [],
            total,
            page: normalizedPage,
            pageSize: normalizedPageSize,
        };
    }

    return {
        items: pageItems,
        total,
        page: normalizedPage,
        pageSize: normalizedPageSize,
    };
}

export async function getReviewQuestionListFilterMeta(
    projectId: string,
): Promise<ReviewQuestionListFilterMeta> {
    if (!process.env.DATABASE_URL || !projectId) {
        return {
            datasourceOptions: [],
            rawFieldOptions: [],
        };
    }

    const datasources = await prisma.projectDataSource.findMany({
        where: {
            projectId,
            status: "ACTIVE",
        },
        orderBy: [{ name: "asc" }],
        select: {
            id: true,
            name: true,
            syncConfig: true,
        },
    });
    const rawFieldOptions = await getProjectReviewFieldCatalog(projectId);

    return {
        datasourceOptions: datasources.map((datasource) => ({
            value: datasource.id,
            label: datasource.name,
        })),
        rawFieldOptions,
    };
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
            fieldTranslations: {
                select: {
                    fieldKey: true,
                    translatedText: true,
                    sourceLanguage: true,
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
        imageFields: readImageFields(question.datasource.syncConfig),
        imageMap: readImageMap(question.datasource.syncConfig),
        savedTranslations: Object.fromEntries(
            question.fieldTranslations.map((t) => [
                t.fieldKey,
                {
                    translatedText: t.translatedText,
                    sourceLanguage: t.sourceLanguage,
                },
            ]),
        ),
    } satisfies ReviewQuestionDetail;
}

export async function getReviewQuestionNavigation({
    questionId,
    projectId,
    conditions = [],
}: NavigationContext) {
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

    const scopedProjectId = projectId || currentQuestion.projectId;
    const statusCondition = conditions.find(
        (condition) => condition.fieldKey === "status",
    );
    const datasourceCondition = conditions.find(
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
    const orderedQuestions = await prisma.question.findMany({
        where: {
            projectId: scopedProjectId,
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
            status: true,
            datasourceId: true,
            metadata: true,
            externalRecordId: true,
        },
    });
    const reviewSummaryMap = await getLatestReviewSummaryMap(
        orderedQuestions.map((question) => ({
            projectId: scopedProjectId,
            datasourceId: question.datasourceId,
            externalRecordId: question.externalRecordId,
        })),
    );
    const filteredOrderedQuestions = orderedQuestions
        .filter((question) =>
            conditions.every((condition) =>
                matchesQuestionCondition(
                    toReviewAwareQuestionRecord({
                        status: question.status,
                        datasourceId: question.datasourceId,
                        metadata: question.metadata,
                        aiReview:
                            reviewSummaryMap.get(
                                buildReviewCompositeKey({
                                    projectId: scopedProjectId,
                                    datasourceId: question.datasourceId,
                                    externalRecordId: question.externalRecordId,
                                }),
                            )?.aiReview ?? null,
                        manualReview:
                            reviewSummaryMap.get(
                                buildReviewCompositeKey({
                                    projectId: scopedProjectId,
                                    datasourceId: question.datasourceId,
                                    externalRecordId: question.externalRecordId,
                                }),
                            )?.manualReview ?? null,
                    }),
                    condition,
                ),
            ),
        )
        .sort((left, right) => {
            const externalOrderDiff =
                parseExternalRecordOrder(left.externalRecordId) -
                parseExternalRecordOrder(right.externalRecordId);

            if (externalOrderDiff !== 0) {
                return externalOrderDiff;
            }

            return left.externalRecordId.localeCompare(right.externalRecordId);
        });

    const currentIndex = filteredOrderedQuestions.findIndex(
        (question) => question.id === questionId,
    );

    if (currentIndex < 0) {
        return {
            previousQuestionId: null,
            nextQuestionId: null,
        } satisfies ReviewQuestionNavigation;
    }

    return {
        previousQuestionId:
            filteredOrderedQuestions[currentIndex - 1]?.id ?? null,
        nextQuestionId: filteredOrderedQuestions[currentIndex + 1]?.id ?? null,
    } satisfies ReviewQuestionNavigation;
}
