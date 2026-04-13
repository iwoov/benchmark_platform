export type QuestionStatus =
    | "DRAFT"
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "APPROVED"
    | "REJECTED";

export type ReviewQuestionSystemFieldKey =
    | "status"
    | "aiReviewStatus"
    | "manualReviewStatus"
    | "datasourceId"
    | "sourceRowNumber";
export type ReviewQuestionRawFieldKey = `raw:${string}`;
export type ReviewQuestionFilterFieldKey =
    | ReviewQuestionSystemFieldKey
    | ReviewQuestionRawFieldKey;

export type ReviewQuestionFilterOperator =
    | "equals"
    | "notEquals"
    | "contains"
    | "notContains"
    | "isEmpty"
    | "isNotEmpty"
    | "gt"
    | "lt";

export type ReviewQuestionFilterCondition = {
    id: string;
    fieldKey: ReviewQuestionFilterFieldKey;
    operator: ReviewQuestionFilterOperator;
    value: string;
};

export function conditionNeedsValue(operator: ReviewQuestionFilterOperator) {
    return operator !== "isEmpty" && operator !== "isNotEmpty";
}

export function createReviewQuestionFilterCondition(
    seed = 0,
): ReviewQuestionFilterCondition {
    return {
        id: `condition-${Date.now()}-${seed}`,
        fieldKey: "status",
        operator: "equals",
        value: "SUBMITTED",
    };
}

export function sanitizeReviewQuestionFilterConditions(
    conditions: ReviewQuestionFilterCondition[],
) {
    return conditions.filter((condition) =>
        conditionNeedsValue(condition.operator)
            ? Boolean(condition.value.trim())
            : true,
    );
}

function isValidFieldKey(
    value: unknown,
): value is ReviewQuestionFilterFieldKey {
    return (
        value === "status" ||
        value === "aiReviewStatus" ||
        value === "manualReviewStatus" ||
        value === "datasourceId" ||
        value === "sourceRowNumber" ||
        (typeof value === "string" && value.startsWith("raw:"))
    );
}

function isValidOperator(
    value: unknown,
): value is ReviewQuestionFilterOperator {
    return (
        value === "equals" ||
        value === "notEquals" ||
        value === "contains" ||
        value === "notContains" ||
        value === "isEmpty" ||
        value === "isNotEmpty" ||
        value === "gt" ||
        value === "lt"
    );
}

export function parseReviewQuestionFilterConditions(
    value: string | null | undefined,
) {
    if (!value) {
        return [] as ReviewQuestionFilterCondition[];
    }

    try {
        const parsed = JSON.parse(value) as unknown;

        if (!Array.isArray(parsed)) {
            return [];
        }

        return sanitizeReviewQuestionFilterConditions(
            parsed
                .map((item, index) => {
                    if (!item || typeof item !== "object") {
                        return null;
                    }

                    const record = item as Record<string, unknown>;
                    const fieldKey = record.fieldKey;
                    const operator = record.operator;
                    const rawValue = record.value;
                    const id = record.id;

                    if (
                        !isValidFieldKey(fieldKey) ||
                        !isValidOperator(operator)
                    ) {
                        return null;
                    }

                    return {
                        id:
                            typeof id === "string" && id.trim()
                                ? id
                                : `condition-${index}`,
                        fieldKey,
                        operator,
                        value: typeof rawValue === "string" ? rawValue : "",
                    } satisfies ReviewQuestionFilterCondition;
                })
                .filter(
                    (condition): condition is ReviewQuestionFilterCondition =>
                        Boolean(condition),
                ),
        );
    } catch {
        return [];
    }
}

export function serializeReviewQuestionFilterConditions(
    conditions: ReviewQuestionFilterCondition[],
) {
    const normalized = sanitizeReviewQuestionFilterConditions(conditions);

    return normalized.length ? JSON.stringify(normalized) : "";
}
