export const datasourceFieldKey = "system:datasource";
export const revisionFieldKey = "system:revision";
export const aiReviewStatusFieldKey = "system:aiReviewStatus";
export const manualReviewStatusFieldKey = "system:manualReviewStatus";
export const manualReviewUpdatedAtFieldKey = "system:manualReviewUpdatedAt";
export const questionUpdatedAtFieldKey = "system:questionUpdatedAt";
export const manualReviewReviewerFieldKey = "system:manualReviewReviewer";

export const reviewQuestionListSystemFieldOptions = [
    {
        key: datasourceFieldKey,
        label: "数据源",
        defaultListVisible: true,
    },
    {
        key: revisionFieldKey,
        label: "版本",
        defaultListVisible: true,
    },
    {
        key: aiReviewStatusFieldKey,
        label: "AI审核",
        defaultListVisible: true,
    },
    {
        key: manualReviewStatusFieldKey,
        label: "人工审核",
        defaultListVisible: true,
    },
    {
        key: manualReviewUpdatedAtFieldKey,
        label: "人工审核时间",
        defaultListVisible: true,
    },
    {
        key: questionUpdatedAtFieldKey,
        label: "更新时间",
        defaultListVisible: true,
    },
    {
        key: manualReviewReviewerFieldKey,
        label: "人工审核人",
        defaultListVisible: false,
    },
] as const;

export const reviewQuestionListSystemFieldKeySet = new Set<string>(
    reviewQuestionListSystemFieldOptions.map((field) => field.key),
);
