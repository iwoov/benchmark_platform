import { prisma } from "@/lib/db/prisma";
import type { PlatformRoleValue } from "@/lib/auth/roles";
import { readImageFields, readImageMap } from "@/lib/datasources/sync-config";
import { getProjectReviewFieldCatalog } from "@/lib/reviews/field-preferences";
import type { ReviewQuestionFilterCondition } from "@/lib/reviews/question-list-filters";
import { reviewQuestionListSystemFieldKeySet } from "@/lib/reviews/system-fields";
import {
    buildReviewCompositeKey,
    getLatestReviewSummaryMap,
    toReviewStatusValue,
    type ReviewDecisionStatus,
    type ReviewSummary,
    type ReviewStatusValue,
} from "@/lib/reviews/review-summary";
import {
    getAccessiblePrimaryValueSet,
    questionMatchesPrimaryValueScopeForProject,
} from "@/lib/subjects/access";

const revisionBaseFieldLabelMap = {
    title: "题目标题",
    content: "题干",
    answer: "答案",
    analysis: "解析",
    questionType: "题型",
    difficulty: "难度",
} as const;

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

function extractRawRecordValues(metadata: unknown) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return {} as Record<string, unknown>;
    }

    const rawRecord = (metadata as Record<string, unknown>).rawRecord;

    if (
        !rawRecord ||
        typeof rawRecord !== "object" ||
        Array.isArray(rawRecord)
    ) {
        return {} as Record<string, unknown>;
    }

    return rawRecord as Record<string, unknown>;
}

function extractRawRecord(metadata: unknown) {
    return Object.fromEntries(
        Object.entries(extractRawRecordValues(metadata)).map(
            ([key, value]) => [key, normalizeRawValue(value)],
        ),
    );
}

export type ReviewResponse = {
    source: string;
    reviewDate: string;
    teamLeadComment: string;
    otherNotesChangesMade: string;
    agreementWithRejection: string;
};

function normalizeReviewResponseText(value: unknown) {
    if (value === null || value === undefined) {
        return "";
    }

    if (typeof value === "string") {
        return value.trim();
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

function readReviewResponsesValue(metadata: unknown) {
    const rawValue = extractRawRecordValues(metadata).review_responses;

    if (Array.isArray(rawValue)) {
        return rawValue;
    }

    if (typeof rawValue !== "string") {
        return [];
    }

    const trimmed = rawValue.trim();
    if (!trimmed) {
        return [];
    }

    try {
        const parsed = JSON.parse(trimmed) as unknown;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function extractReviewResponses(metadata: unknown) {
    return readReviewResponsesValue(metadata)
        .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
                return null;
            }

            const record = item as Record<string, unknown>;
            const response = {
                source: normalizeReviewResponseText(record.source),
                reviewDate: normalizeReviewResponseText(record.review_date),
                teamLeadComment: normalizeReviewResponseText(
                    record.team_lead_comment,
                ),
                otherNotesChangesMade: normalizeReviewResponseText(
                    record.other_notes_changes_made,
                ),
                agreementWithRejection: normalizeReviewResponseText(
                    record.agreement_with_rejection,
                ),
            } satisfies ReviewResponse;

            return Object.values(response).some(Boolean) ? response : null;
        })
        .filter((item): item is ReviewResponse => Boolean(item));
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

function valuesAreEqual(left: unknown, right: unknown) {
    return (
        JSON.stringify(normalizeComparableValue(left)) ===
        JSON.stringify(normalizeComparableValue(right))
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

function compareQuestionsByDatasource(
    left: {
        datasourceName?: string;
        datasourceId: string;
        sourceRowNumber?: number | null;
        externalRecordId: string;
    },
    right: {
        datasourceName?: string;
        datasourceId: string;
        sourceRowNumber?: number | null;
        externalRecordId: string;
    },
) {
    const datasourceNameDiff = (left.datasourceName ?? "").localeCompare(
        right.datasourceName ?? "",
        "zh-CN",
    );

    if (datasourceNameDiff !== 0) {
        return datasourceNameDiff;
    }

    const datasourceIdDiff = left.datasourceId.localeCompare(right.datasourceId);

    if (datasourceIdDiff !== 0) {
        return datasourceIdDiff;
    }

    const sourceRowNumberDiff =
        (left.sourceRowNumber ?? Number.POSITIVE_INFINITY) -
        (right.sourceRowNumber ?? Number.POSITIVE_INFINITY);

    if (sourceRowNumberDiff !== 0) {
        return sourceRowNumberDiff;
    }

    const externalOrderDiff =
        parseExternalRecordOrder(left.externalRecordId) -
        parseExternalRecordOrder(right.externalRecordId);

    if (externalOrderDiff !== 0) {
        return externalOrderDiff;
    }

    return left.externalRecordId.localeCompare(right.externalRecordId);
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

function buildRevisionLink(
    question: {
        id: string;
        title: string;
        revisionNo: number;
        externalRecordId: string;
        status: ReviewQuestionRevisionLink["status"];
        updatedAt: Date;
        datasource: {
            id: string;
            name: string;
        };
    },
    reviewSummary: {
        aiReview: ReviewSummary | null;
        manualReview: ReviewSummary | null;
    },
): ReviewQuestionRevisionLink {
    return {
        id: question.id,
        title: question.title,
        revisionNo: question.revisionNo,
        externalRecordId: question.externalRecordId,
        status: question.status,
        updatedAt: question.updatedAt.toISOString(),
        datasource: question.datasource,
        aiReview: reviewSummary.aiReview,
        manualReview: reviewSummary.manualReview,
    };
}

function buildDiffFromPrevious(
    currentQuestion: {
        title: string;
        content: string;
        answer: string | null;
        analysis: string | null;
        questionType: string | null;
        difficulty: string | null;
        metadata: unknown;
    },
    previousQuestion: {
        title: string;
        content: string;
        answer: string | null;
        analysis: string | null;
        questionType: string | null;
        difficulty: string | null;
        metadata: unknown;
        datasource: {
            syncConfig: unknown;
        };
    },
): ReviewQuestionDiffEntry[] {
    const diffEntries: ReviewQuestionDiffEntry[] = [];

    for (const [fieldKey, label] of Object.entries(revisionBaseFieldLabelMap)) {
        const previousValue = previousQuestion[fieldKey as keyof typeof revisionBaseFieldLabelMap];
        const currentValue = currentQuestion[fieldKey as keyof typeof revisionBaseFieldLabelMap];

        if (!valuesAreEqual(previousValue, currentValue)) {
            diffEntries.push({
                fieldKey,
                kind: "base",
                label,
                previousValue,
                currentValue,
            });
        }
    }

    const previousRawRecord = extractRawRecordValues(previousQuestion.metadata);
    const currentRawRecord = extractRawRecordValues(currentQuestion.metadata);
    const rawFieldKeys = Array.from(
        new Set([
            ...extractRawFieldOrder(previousQuestion.datasource.syncConfig),
            ...Object.keys(previousRawRecord),
            ...Object.keys(currentRawRecord),
        ]),
    ).sort((left, right) => left.localeCompare(right, "zh-CN"));

    for (const rawFieldKey of rawFieldKeys) {
        const previousValue = previousRawRecord[rawFieldKey] ?? null;
        const currentValue = currentRawRecord[rawFieldKey] ?? null;

        if (!valuesAreEqual(previousValue, currentValue)) {
            diffEntries.push({
                fieldKey: `raw:${rawFieldKey}`,
                kind: "raw",
                label: rawFieldKey,
                previousValue,
                currentValue,
            });
        }
    }

    return diffEntries;
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
    businessQuestionKey: string | null;
    revisionNo: number;
    isLatestRevision: boolean;
    hasPreviousRevision: boolean;
    sourceRowNumber: number | null;
    rawRecord: Record<string, string>;
    rawFieldOrder: string[];
    cleaningFieldStatus: Record<string, boolean>;
    canManage: boolean;
};

export type ReviewQuestionRevisionLink = {
    id: string;
    title: string;
    revisionNo: number;
    externalRecordId: string;
    status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
    updatedAt: string;
    datasource: {
        id: string;
        name: string;
    };
    aiReview: ReviewSummary | null;
    manualReview: ReviewSummary | null;
};

export type ReviewQuestionDiffEntry = {
    fieldKey: string;
    kind: "base" | "raw";
    label: string;
    previousValue: unknown;
    currentValue: unknown;
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
    reviewResponses: ReviewResponse[];
    businessQuestionKey: string | null;
    revisionNo: number;
    isLatestRevision: boolean;
    aiReview: ReviewSummary | null;
    manualReview: ReviewSummary | null;
    imageFields: string[];
    imageMap: Record<string, string[]> | null;
    previousRevision: ReviewQuestionRevisionLink | null;
    latestRevision: ReviewQuestionRevisionLink | null;
    diffFromPrevious: ReviewQuestionDiffEntry[];
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

const localCleanedQuestionIdFieldKey = "cleaned_question_id";

function extractCleaningFieldKeysFromParsedResult(parsedResult: unknown) {
    const fieldKeys = new Set<string>();

    if (
        !parsedResult ||
        typeof parsedResult !== "object" ||
        Array.isArray(parsedResult)
    ) {
        return fieldKeys;
    }

    const stepResults = (parsedResult as Record<string, unknown>).stepResults;
    if (!Array.isArray(stepResults)) {
        return fieldKeys;
    }

    for (const step of stepResults) {
        if (!step || typeof step !== "object" || Array.isArray(step)) {
            continue;
        }

        const stepRecord = step as Record<string, unknown>;
        if (
            stepRecord.stepKind !== "AI_TOOL" ||
            stepRecord.stepType !== "FIELD_CLEANING" ||
            stepRecord.status !== "SUCCESS"
        ) {
            continue;
        }

        const items = stepRecord.items;
        if (!Array.isArray(items)) {
            continue;
        }

        for (const item of items) {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
                continue;
            }

            const itemRecord = item as Record<string, unknown>;
            if (itemRecord.status !== "SUCCESS") {
                continue;
            }

            const output = itemRecord.output;
            if (!output || typeof output !== "object" || Array.isArray(output)) {
                continue;
            }

            const fieldResults = (output as Record<string, unknown>).fieldResults;
            if (!Array.isArray(fieldResults)) {
                continue;
            }

            for (const fieldResult of fieldResults) {
                if (
                    !fieldResult ||
                    typeof fieldResult !== "object" ||
                    Array.isArray(fieldResult)
                ) {
                    continue;
                }

                const fieldKey = (fieldResult as Record<string, unknown>).fieldKey;
                if (typeof fieldKey === "string" && fieldKey.trim()) {
                    fieldKeys.add(fieldKey.trim());
                }
            }
        }
    }

    return fieldKeys;
}

async function getCleaningFieldStatusMap(
    questions: Array<{ id: string; rawRecord: Record<string, string> }>,
) {
    const statusMap = new Map<string, Record<string, boolean>>();

    for (const question of questions) {
        statusMap.set(question.id, {
            [localCleanedQuestionIdFieldKey]: Boolean(
                question.rawRecord[localCleanedQuestionIdFieldKey]?.trim(),
            ),
        });
    }

    if (!questions.length) {
        return statusMap;
    }

    const runs = await prisma.aiReviewStrategyRun.findMany({
        where: {
            questionId: {
                in: questions.map((question) => question.id),
            },
            status: "SUCCESS",
        },
        orderBy: [{ questionId: "asc" }, { createdAt: "desc" }],
        select: {
            questionId: true,
            parsedResult: true,
        },
    });

    for (const run of runs) {
        const questionStatus = statusMap.get(run.questionId) ?? {};
        for (const fieldKey of extractCleaningFieldKeysFromParsedResult(
            run.parsedResult,
        )) {
            if (questionStatus[fieldKey]) {
                continue;
            }
            questionStatus[fieldKey] = true;
        }
        statusMap.set(run.questionId, questionStatus);
    }

    return statusMap;
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

    if (condition.fieldKey === "manualReviewReviewer") {
        return question.manualReview?.reviewerName ?? "";
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

function getExactDatasourceFilter(
    datasourceId: string | undefined,
    datasourceCondition: ReviewQuestionFilterCondition | undefined,
) {
    if (datasourceId) {
        return datasourceId;
    }

    if (
        datasourceCondition?.operator === "equals" &&
        datasourceCondition.value
    ) {
        return datasourceCondition.value;
    }

    return null;
}

export type ReviewQuestionNavigation = {
    previousQuestionId: string | null;
    nextQuestionId: string | null;
};

type NavigationContext = {
    questionId: string;
    projectId?: string;
    conditions?: ReviewQuestionFilterCondition[];
    viewer?: ReviewQuestionListViewer;
    requiredManualReviewStatus?: ReviewDecisionStatus;
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

type ReviewQuestionListViewer = {
    userId: string;
    platformRole: PlatformRoleValue;
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
                      isLatestRevision: true,
                  }
                : {
                      isLatestRevision: true,
                  },
        select: {
            id: true,
            title: true,
            status: true,
            updatedAt: true,
            metadata: true,
            externalRecordId: true,
            businessQuestionKey: true,
            revisionNo: true,
            isLatestRevision: true,
            previousRevisionId: true,
            project: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                    createdById: true,
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
            return compareQuestionsByDatasource(
                {
                    datasourceName: left.datasource.name,
                    datasourceId: left.datasource.id,
                    sourceRowNumber: extractSourceRowNumber(left.metadata),
                    externalRecordId: left.externalRecordId,
                },
                {
                    datasourceName: right.datasource.name,
                    datasourceId: right.datasource.id,
                    sourceRowNumber: extractSourceRowNumber(right.metadata),
                    externalRecordId: right.externalRecordId,
                },
            );
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
                businessQuestionKey: question.businessQuestionKey,
                revisionNo: question.revisionNo,
                isLatestRevision: question.isLatestRevision,
                hasPreviousRevision: Boolean(question.previousRevisionId),
                sourceRowNumber: extractSourceRowNumber(question.metadata),
                rawRecord: extractRawRecord(question.metadata),
                rawFieldOrder: extractRawFieldOrder(
                    question.datasource.syncConfig,
                ),
                cleaningFieldStatus: {},
                canManage: false,
            };
        });
}

export async function getReviewQuestionListPageData({
    projectId,
    datasourceId,
    page = 1,
    pageSize = 50,
    conditions = [],
    viewer,
    requiredManualReviewStatus,
}: {
    projectId: string;
    datasourceId?: string;
    page?: number;
    pageSize?: number;
    conditions?: ReviewQuestionFilterCondition[];
    viewer?: ReviewQuestionListViewer;
    requiredManualReviewStatus?: ReviewDecisionStatus;
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
    const exactDatasourceFilter = getExactDatasourceFilter(
        datasourceId,
        datasourceCondition,
    );
    const shouldIncludeHistoricalRevisions = Boolean(exactDatasourceFilter);
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
    const allowedPrimaryValues = viewer
        ? await getAccessiblePrimaryValueSet(viewer.userId, viewer.platformRole)
        : null;
    const candidateRows = await prisma.question.findMany({
        where: {
            projectId,
            isLatestRevision: shouldIncludeHistoricalRevisions
                ? undefined
                : true,
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
            datasourceId: exactDatasourceFilter
                ? { equals: exactDatasourceFilter }
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
            businessQuestionKey: true,
            revisionNo: true,
            isLatestRevision: true,
            previousRevisionId: true,
            project: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                    createdById: true,
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
    const visibleRows = candidateRows.filter((question) =>
        questionMatchesPrimaryValueScopeForProject(
            question.metadata,
            allowedPrimaryValues,
            viewer
                ? {
                      ...viewer,
                      projectCreatedById: question.project.createdById,
                  }
                : null,
        ),
    );
    const reviewSummaryMap = await getLatestReviewSummaryMap(
        visibleRows.map((question) => ({
            projectId: question.project.id,
            datasourceId: question.datasource.id,
            externalRecordId: question.externalRecordId,
        })),
    );
    const sortedRows = visibleRows
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
            const canManage =
                viewer?.platformRole === "SUPER_ADMIN" ||
                (viewer?.platformRole === "PLATFORM_ADMIN" &&
                    question.project.createdById === viewer.userId);

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
                businessQuestionKey: question.businessQuestionKey,
                revisionNo: question.revisionNo,
                isLatestRevision: question.isLatestRevision,
                hasPreviousRevision: Boolean(question.previousRevisionId),
                sourceRowNumber: extractSourceRowNumber(question.metadata),
                rawRecord: extractRawRecord(question.metadata),
                rawFieldOrder: extractRawFieldOrder(
                    question.datasource.syncConfig,
                ),
                cleaningFieldStatus: {},
                canManage,
            };
        })
        .filter((question) => {
            if (
                requiredManualReviewStatus &&
                toReviewStatusValue(question.manualReview) !==
                    requiredManualReviewStatus
            ) {
                return false;
            }

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
            return compareQuestionsByDatasource(left, right);
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

    const cleaningFieldStatusMap =
        requiredManualReviewStatus === "PASS"
            ? await getCleaningFieldStatusMap(
                  pageItems.map((question) => ({
                      id: question.id,
                      rawRecord: question.rawRecord,
                  })),
              )
            : new Map<string, Record<string, boolean>>();

    return {
        items: pageItems.map((question) => ({
            ...question,
            cleaningFieldStatus:
                cleaningFieldStatusMap.get(question.id) ??
                question.cleaningFieldStatus,
        })),
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
    const rawFieldOptions = (
        await getProjectReviewFieldCatalog(projectId)
    ).filter((field) => !reviewQuestionListSystemFieldKeySet.has(field.key));

    return {
        datasourceOptions: datasources.map((datasource) => ({
            value: datasource.id,
            label: datasource.name,
        })),
        rawFieldOptions,
    };
}

export async function getReviewQuestionDetail(
    questionId: string,
    viewer?: ReviewQuestionListViewer,
) {
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
            businessQuestionKey: true,
            revisionNo: true,
            isLatestRevision: true,
            status: true,
            updatedAt: true,
            metadata: true,
            project: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                    createdById: true,
                },
            },
            datasource: {
                select: {
                    id: true,
                    name: true,
                    syncConfig: true,
                },
            },
            previousRevision: {
                select: {
                    id: true,
                    title: true,
                    content: true,
                    answer: true,
                    analysis: true,
                    questionType: true,
                    difficulty: true,
                    externalRecordId: true,
                    revisionNo: true,
                    status: true,
                    updatedAt: true,
                    metadata: true,
                    datasource: {
                        select: {
                            id: true,
                            name: true,
                            syncConfig: true,
                        },
                    },
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

    const allowedPrimaryValues = viewer
        ? await getAccessiblePrimaryValueSet(viewer.userId, viewer.platformRole)
        : null;

    if (
        !questionMatchesPrimaryValueScopeForProject(
            question.metadata,
            allowedPrimaryValues,
            viewer
                ? {
                      ...viewer,
                      projectCreatedById: question.project.createdById,
                  }
                : null,
        )
    ) {
        return null;
    }

    const previousRevision =
        question.previousRevision &&
        questionMatchesPrimaryValueScopeForProject(
            question.previousRevision.metadata,
            allowedPrimaryValues,
            viewer
                ? {
                      ...viewer,
                      projectCreatedById: question.project.createdById,
                  }
                : null,
        )
            ? question.previousRevision
            : null;
    const latestRevisionRecord =
        question.businessQuestionKey && !question.isLatestRevision
            ? await prisma.question.findFirst({
                  where: {
                      projectId: question.project.id,
                      businessQuestionKey: question.businessQuestionKey,
                      isLatestRevision: true,
                  },
                  select: {
                      id: true,
                      title: true,
                      externalRecordId: true,
                      revisionNo: true,
                      status: true,
                      updatedAt: true,
                      datasource: {
                          select: {
                              id: true,
                              name: true,
                          },
                      },
                  },
              })
            : null;
    const reviewTargets = [
        {
            projectId: question.project.id,
            datasourceId: question.datasource.id,
            externalRecordId: question.externalRecordId,
        },
        ...(previousRevision
            ? [
                  {
                      projectId: question.project.id,
                      datasourceId: previousRevision.datasource.id,
                      externalRecordId: previousRevision.externalRecordId,
                  },
              ]
            : []),
        ...(latestRevisionRecord
            ? [
                  {
                      projectId: question.project.id,
                      datasourceId: latestRevisionRecord.datasource.id,
                      externalRecordId: latestRevisionRecord.externalRecordId,
                  },
              ]
            : []),
    ];
    const reviewSummaryMap = await getLatestReviewSummaryMap(reviewTargets);
    const currentReviewSummary =
        reviewSummaryMap.get(
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
    const previousRevisionSummary = previousRevision
        ? reviewSummaryMap.get(
              buildReviewCompositeKey({
                  projectId: question.project.id,
                  datasourceId: previousRevision.datasource.id,
                  externalRecordId: previousRevision.externalRecordId,
              }),
          ) ?? {
              latestReview: null,
              aiReview: null,
              manualReview: null,
          }
        : null;
    const latestRevisionSummary = latestRevisionRecord
        ? reviewSummaryMap.get(
              buildReviewCompositeKey({
                  projectId: question.project.id,
                  datasourceId: latestRevisionRecord.datasource.id,
                  externalRecordId: latestRevisionRecord.externalRecordId,
              }),
          ) ?? {
              latestReview: null,
              aiReview: null,
              manualReview: null,
          }
        : currentReviewSummary;

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
        reviewResponses: extractReviewResponses(question.metadata),
        businessQuestionKey: question.businessQuestionKey,
        revisionNo: question.revisionNo,
        isLatestRevision: question.isLatestRevision,
        aiReview: currentReviewSummary.aiReview,
        manualReview: currentReviewSummary.manualReview,
        imageFields: readImageFields(question.datasource.syncConfig),
        imageMap: readImageMap(question.datasource.syncConfig),
        previousRevision: previousRevision
            ? buildRevisionLink(previousRevision, {
                  aiReview: previousRevisionSummary?.aiReview ?? null,
                  manualReview: previousRevisionSummary?.manualReview ?? null,
              })
            : null,
        latestRevision:
            latestRevisionRecord && latestRevisionRecord.id !== question.id
                ? buildRevisionLink(latestRevisionRecord, {
                      aiReview: latestRevisionSummary.aiReview,
                      manualReview: latestRevisionSummary.manualReview,
                  })
                : buildRevisionLink(
                      {
                          id: question.id,
                          title: question.title,
                          revisionNo: question.revisionNo,
                          externalRecordId: question.externalRecordId,
                          status: question.status,
                          updatedAt: question.updatedAt,
                          datasource: {
                              id: question.datasource.id,
                              name: question.datasource.name,
                          },
                      },
                      {
                          aiReview: currentReviewSummary.aiReview,
                          manualReview: currentReviewSummary.manualReview,
                      },
                  ),
        diffFromPrevious: previousRevision
            ? buildDiffFromPrevious(question, previousRevision)
            : [],
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
    viewer,
    requiredManualReviewStatus,
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
            datasourceId: true,
            metadata: true,
            externalRecordId: true,
            businessQuestionKey: true,
            isLatestRevision: true,
        },
    });

    if (!currentQuestion) {
        return {
            previousQuestionId: null,
            nextQuestionId: null,
        } satisfies ReviewQuestionNavigation;
    }

    const scopedProjectId = projectId || currentQuestion.projectId;
    const project = await prisma.project.findUnique({
        where: {
            id: scopedProjectId,
        },
        select: {
            createdById: true,
        },
    });
    const statusCondition = conditions.find(
        (condition) => condition.fieldKey === "status",
    );
    const datasourceCondition = conditions.find(
        (condition) => condition.fieldKey === "datasourceId",
    );
    const exactDatasourceFilter = getExactDatasourceFilter(
        undefined,
        datasourceCondition,
    );
    const shouldIncludeHistoricalRevisions = Boolean(exactDatasourceFilter);
    const validStatusValue =
        statusCondition?.value === "DRAFT" ||
        statusCondition?.value === "SUBMITTED" ||
        statusCondition?.value === "UNDER_REVIEW" ||
        statusCondition?.value === "APPROVED" ||
        statusCondition?.value === "REJECTED"
            ? statusCondition.value
            : null;
    const allowedPrimaryValues = viewer
        ? await getAccessiblePrimaryValueSet(viewer.userId, viewer.platformRole)
        : null;
    const orderedQuestions = await prisma.question.findMany({
        where: {
            projectId: scopedProjectId,
            isLatestRevision: shouldIncludeHistoricalRevisions
                ? undefined
                : true,
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
            datasourceId: exactDatasourceFilter
                ? {
                      equals: exactDatasourceFilter,
                  }
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
    const orderedAccessibleQuestions = orderedQuestions
        .filter((question) =>
            questionMatchesPrimaryValueScopeForProject(
                question.metadata,
                allowedPrimaryValues,
                viewer
                    ? {
                          ...viewer,
                          projectCreatedById: project?.createdById ?? null,
                      }
                    : null,
            ),
        )
        .sort((left, right) => {
            return compareQuestionsByDatasource(
                {
                    datasourceId: left.datasourceId,
                    sourceRowNumber: extractSourceRowNumber(left.metadata),
                    externalRecordId: left.externalRecordId,
                },
                {
                    datasourceId: right.datasourceId,
                    sourceRowNumber: extractSourceRowNumber(right.metadata),
                    externalRecordId: right.externalRecordId,
                },
            );
        });
    const filteredOrderedQuestions = orderedAccessibleQuestions
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
        .filter((question) => {
            if (!requiredManualReviewStatus) {
                return true;
            }

            const reviewSummary = reviewSummaryMap.get(
                buildReviewCompositeKey({
                    projectId: scopedProjectId,
                    datasourceId: question.datasourceId,
                    externalRecordId: question.externalRecordId,
                }),
            );

            return (
                toReviewStatusValue(reviewSummary?.manualReview ?? null) ===
                requiredManualReviewStatus
            );
        });
    let resolvedNavigationQuestionId = questionId;
    let navigationAnchor = currentQuestion;

    if (
        !shouldIncludeHistoricalRevisions &&
        !currentQuestion.isLatestRevision &&
        currentQuestion.businessQuestionKey
    ) {
        const latestRevision = await prisma.question.findFirst({
            where: {
                projectId: scopedProjectId,
                businessQuestionKey: currentQuestion.businessQuestionKey,
                isLatestRevision: true,
            },
            select: {
                id: true,
                projectId: true,
                datasourceId: true,
                metadata: true,
                externalRecordId: true,
                businessQuestionKey: true,
                isLatestRevision: true,
            },
        });

        if (latestRevision) {
            navigationAnchor = latestRevision;
            resolvedNavigationQuestionId = latestRevision.id;
        }
    }

    const currentIndex = filteredOrderedQuestions.findIndex(
        (question) => question.id === resolvedNavigationQuestionId,
    );

    if (currentIndex < 0) {
        const anchorOrder = {
            datasourceId: navigationAnchor.datasourceId,
            sourceRowNumber: extractSourceRowNumber(navigationAnchor.metadata),
            externalRecordId: navigationAnchor.externalRecordId,
        };
        let previousQuestionId: string | null = null;
        let nextQuestionId: string | null = null;

        for (const question of filteredOrderedQuestions) {
            const comparison = compareQuestionsByDatasource(
                {
                    datasourceId: question.datasourceId,
                    sourceRowNumber: extractSourceRowNumber(question.metadata),
                    externalRecordId: question.externalRecordId,
                },
                anchorOrder,
            );

            if (comparison < 0) {
                previousQuestionId = question.id;
                continue;
            }

            if (comparison > 0) {
                nextQuestionId = question.id;
                break;
            }
        }

        return {
            previousQuestionId,
            nextQuestionId,
        } satisfies ReviewQuestionNavigation;
    }

    return {
        previousQuestionId:
            filteredOrderedQuestions[currentIndex - 1]?.id ?? null,
        nextQuestionId: filteredOrderedQuestions[currentIndex + 1]?.id ?? null,
    } satisfies ReviewQuestionNavigation;
}
