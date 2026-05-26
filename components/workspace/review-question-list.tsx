"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Button,
    Checkbox,
    Empty,
    Input,
    InputNumber,
    Modal,
    Pagination,
    Popconfirm,
    Select,
    Tag,
} from "@/components/ui/legacy-ui-adapters";
import {
    Bot,
    Download,
    Edit3,
    Eye,
    FileText,
    RefreshCw,
    SlidersHorizontal,
    Sparkles,
    Trash2,
    X,
} from "lucide-react";
import { createAiReviewStrategyBatchRunAction } from "@/app/actions/ai-review-strategies";
import { ReviewFieldSettingsModal } from "@/components/reviews/review-field-settings-modal";
import { useToast } from "@/components/ui/toast";
import {
    exportReviewQuestionsAction,
    exportReviewReportAction,
} from "@/app/actions/review-exports";
import { writeStoredReviewListHref } from "@/lib/reviews/review-list-preference";
import {
    type ResolvedReviewFieldPreference,
} from "@/lib/reviews/field-preferences";
import {
    aiReviewStatusFieldKey,
    datasourceFieldKey,
    manualReviewReviewerFieldKey,
    manualReviewStatusFieldKey,
    manualReviewUpdatedAtFieldKey,
    questionUpdatedAtFieldKey,
    revisionFieldKey,
} from "@/lib/reviews/system-fields";
import {
    conditionNeedsValue,
    createReviewQuestionFilterCondition,
    serializeReviewQuestionFilterConditions,
    type QuestionStatus,
    type ReviewQuestionFilterCondition,
    type ReviewQuestionFilterFieldKey,
    type ReviewQuestionFilterOperator,
} from "@/lib/reviews/question-list-filters";

type ProjectOption = {
    id: string;
    name: string;
    code: string;
};

type ReviewStrategyOption = {
    id: string;
    name: string;
    code: string;
    description: string | null;
    stepCount: number;
    projectIds: string[];
    datasourceIds: string[];
    toolTypes: string[];
    hasCleaningStep: boolean;
    hasReviewStep: boolean;
};

type ReviewQuestionItem = {
    id: string;
    projectId: string;
    projectName: string;
    projectCode: string;
    datasourceId: string;
    datasourceName: string;
    externalRecordId: string;
    title: string;
    status: QuestionStatus;
    aiReview: {
        decision: "PASS" | "REJECT";
        comment: string;
        updatedAt: string;
        reviewerName: string;
    } | null;
    manualReview: {
        decision: "PASS" | "REJECT";
        comment: string;
        updatedAt: string;
        reviewerName: string;
    } | null;
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

type ReviewStatus = "PASS" | "REJECT" | "NONE";

type FieldDefinition = {
    value: ReviewQuestionFilterFieldKey;
    label: string;
    kind: "system" | "raw";
    valueType: "text" | "select" | "number";
};

type ExportFormat = "excel" | "json" | "markdown";
type ExportScope = "selected" | "filteredAll";
type ReportFormat = "markdown" | "html" | "pdf";

type ExportFieldOption = {
    value: string;
    label: string;
};

type ListColumn = {
    key: string;
    label: string;
    width: number;
};

type QuestionOperationResponse = {
    success?: string;
    error?: string;
};

const defaultSystemListColumns: ListColumn[] = [
    {
        key: datasourceFieldKey,
        label: "数据源",
        width: 180,
    },
    {
        key: revisionFieldKey,
        label: "版本",
        width: 120,
    },
    {
        key: aiReviewStatusFieldKey,
        label: "AI审核",
        width: 160,
    },
    {
        key: manualReviewStatusFieldKey,
        label: "人工审核",
        width: 140,
    },
    {
        key: manualReviewReviewerFieldKey,
        label: "人工审核人",
        width: 140,
    },
    {
        key: manualReviewUpdatedAtFieldKey,
        label: "人工审核时间",
        width: 180,
    },
    {
        key: questionUpdatedAtFieldKey,
        label: "更新时间",
        width: 180,
    },
];

const cleaningListColumns = [
    {
        key: "cleaned_question_id",
        label: "uuid",
        width: 96,
    },
    {
        key: "primary",
        label: "primary",
        width: 96,
    },
    {
        key: "secondary",
        label: "secondary",
        width: 112,
    },
];

const questionStatusMeta = {
    DRAFT: { label: "草稿", color: "default" },
    SUBMITTED: { label: "待审核", color: "processing" },
    UNDER_REVIEW: { label: "审核中", color: "gold" },
    APPROVED: { label: "已通过", color: "success" },
    REJECTED: { label: "已驳回", color: "error" },
} satisfies Record<QuestionStatus, { label: string; color: string }>;

const reviewStatusMeta = {
    NONE: { label: "未审核", color: "default" },
    PASS: { label: "通过", color: "success" },
    REJECT: { label: "驳回", color: "error" },
} satisfies Record<ReviewStatus, { label: string; color: string }>;

const cellStyle = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
} as const;

function getOperatorOptions(valueType: FieldDefinition["valueType"]) {
    if (valueType === "select") {
        return [
            { value: "equals", label: "等于" },
            { value: "notEquals", label: "不等于" },
        ] satisfies Array<{
            value: ReviewQuestionFilterOperator;
            label: string;
        }>;
    }

    if (valueType === "number") {
        return [
            { value: "equals", label: "等于" },
            { value: "gt", label: "大于" },
            { value: "lt", label: "小于" },
        ] satisfies Array<{
            value: ReviewQuestionFilterOperator;
            label: string;
        }>;
    }

    return [
        { value: "contains", label: "包含" },
        { value: "notContains", label: "不包含" },
        { value: "equals", label: "等于" },
        { value: "isEmpty", label: "为空" },
        { value: "isNotEmpty", label: "不为空" },
    ] satisfies Array<{
        value: ReviewQuestionFilterOperator;
        label: string;
    }>;
}

function formatReviewTooltip(
    review: ReviewQuestionItem["aiReview"] | ReviewQuestionItem["manualReview"],
) {
    if (!review) {
        return "未审核";
    }

    const details = [
        `状态：${reviewStatusMeta[review.decision].label}`,
        `时间：${new Date(review.updatedAt).toLocaleString("zh-CN")}`,
    ];

    if (review.reviewerName) {
        details.push(`审核人：${review.reviewerName}`);
    }

    if (review.comment.trim()) {
        details.push(`意见：${review.comment}`);
    }

    return details.join("\n");
}

function stringifyRawValue(value: unknown) {
    if (typeof value === "string") {
        return value;
    }

    return JSON.stringify(value, null, 2);
}

function parseEditedRawValue(originalValue: unknown, input: string) {
    if (typeof originalValue === "string") {
        return input;
    }

    try {
        return JSON.parse(input);
    } catch {
        return input;
    }
}

export function ReviewQuestionList({
    canReview,
    scopeLabel,
    listPath,
    mode = "quality",
    projects,
    questions,
    selectedProjectId,
    currentPage,
    pageSize,
    totalQuestions,
    activeConditions,
    datasourceOptions,
    rawFieldOptions,
    fieldPreference,
    reviewStrategies,
}: {
    canReview: boolean;
    scopeLabel?: string;
    listPath: string;
    mode?: "quality" | "cleaning";
    projects: ProjectOption[];
    questions: ReviewQuestionItem[];
    selectedProjectId: string;
    currentPage: number;
    pageSize: number;
    totalQuestions: number;
    activeConditions: ReviewQuestionFilterCondition[];
    datasourceOptions: Array<{ value: string; label: string }>;
    rawFieldOptions: Array<{ key: string; label: string }>;
    fieldPreference: ResolvedReviewFieldPreference;
    reviewStrategies: ReviewStrategyOption[];
}) {
    const router = useRouter();
    const toast = useToast();
    const [modalOpen, setModalOpen] = useState(false);
    const [fieldSettingsOpen, setFieldSettingsOpen] = useState(false);
    const [draftConditions, setDraftConditions] = useState<
        ReviewQuestionFilterCondition[]
    >([]);
    const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>(
        [],
    );
    const [batchModalOpen, setBatchModalOpen] = useState(false);
    const [selectedStrategyId, setSelectedStrategyId] = useState("");
    const [batchConcurrency, setBatchConcurrency] = useState(1);
    const [isCreatingBatchRun, setIsCreatingBatchRun] = useState(false);
    const [cleaningModalOpen, setCleaningModalOpen] = useState(false);
    const [selectedCleaningStrategyId, setSelectedCleaningStrategyId] =
        useState("");
    const [cleaningConcurrency, setCleaningConcurrency] = useState(1);
    const [isCreatingCleaningBatchRun, setIsCreatingCleaningBatchRun] =
        useState(false);
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [exportScope, setExportScope] = useState<ExportScope>("selected");
    const [exportFormat, setExportFormat] = useState<ExportFormat>("excel");
    const [selectedExportFields, setSelectedExportFields] = useState<string[]>(
        [],
    );
    const [isExporting, setIsExporting] = useState(false);
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [reportScope, setReportScope] = useState<ExportScope>("filteredAll");
    const [reportFormat, setReportFormat] = useState<ReportFormat>("markdown");
    const [reportRejectedOnlyInDetails, setReportRejectedOnlyInDetails] =
        useState(false);
    const [reportSubjectFieldKey, setReportSubjectFieldKey] = useState("");
    const [reportDetailFields, setReportDetailFields] = useState<string[]>([
        "raw:question_id",
        "manualReviewStatus",
        "reviewComment",
        "datasourceName",
    ]);
    const [isExportingReport, setIsExportingReport] = useState(false);
    const [editingQuestion, setEditingQuestion] =
        useState<ReviewQuestionItem | null>(null);
    const [editingFieldKey, setEditingFieldKey] = useState("");
    const [editingFieldValue, setEditingFieldValue] = useState("");
    const [isSavingField, setIsSavingField] = useState(false);
    const [updatingQuestion, setUpdatingQuestion] =
        useState<ReviewQuestionItem | null>(null);
    const [replacementFile, setReplacementFile] = useState<File | null>(null);
    const [isReplacingRecord, setIsReplacingRecord] = useState(false);
    const selectionAnchorQuestionIdRef = useRef<string | null>(null);
    const pageLabels =
        mode === "cleaning"
            ? {
                  title: "数据清洗",
                  description:
                      "仅展示人工审核通过的题目。选择数据后可批量运行清洗策略，点击列表行可进入清洗详情页。",
                  noPermission:
                      "你当前没有 REVIEWER 项目角色，暂时无法进入数据清洗。",
              }
            : {
                  title: "数据质检",
                  description:
                      "展示原始 JSON / Excel 导入字段。先选择项目，再按条件叠加筛选记录，点击列表行可进入数据质检详情页。",
                  noPermission:
                      "你当前没有 REVIEWER 项目角色，暂时无法进入数据质检。",
              };

    const listColumns = useMemo(
        () => {
            if (mode === "cleaning") {
                return [...defaultSystemListColumns, ...cleaningListColumns];
            }

            const visibleFieldKeySet = new Set(
                fieldPreference.listVisibleFieldKeys,
            );

            return fieldPreference.fieldOrder
                .filter((fieldKey) => visibleFieldKeySet.has(fieldKey))
                .map((fieldKey) => ({
                    key: fieldKey,
                    label:
                        fieldPreference.fieldCatalog.find(
                            (field) => field.key === fieldKey,
                        )?.label ?? fieldKey,
                    width:
                        defaultSystemListColumns.find(
                            (column) => column.key === fieldKey,
                        )?.width ?? 220,
                }));
        },
        [fieldPreference, mode],
    );

    const fieldDefinitions = useMemo(() => {
        const systemFields: FieldDefinition[] = [
            {
                value: "status",
                label: "题目状态",
                kind: "system",
                valueType: "select",
            },
            {
                value: "aiReviewStatus",
                label: "AI审核",
                kind: "system",
                valueType: "select",
            },
            {
                value: "manualReviewStatus",
                label: "人工审核",
                kind: "system",
                valueType: "select",
            },
            {
                value: "manualReviewReviewer",
                label: "人工审核人",
                kind: "system",
                valueType: "text",
            },
            {
                value: "datasourceId",
                label: "数据源",
                kind: "system",
                valueType: "select",
            },
            {
                value: "sourceRowNumber",
                label: "来源行",
                kind: "system",
                valueType: "number",
            },
        ];
        const rawFields = rawFieldOptions.map((field) => ({
            value: `raw:${field.key}` as const,
            label: field.label,
            kind: "raw" as const,
            valueType: "text" as const,
        }));

        return [...systemFields, ...rawFields];
    }, [rawFieldOptions]);

    const fieldDefinitionMap = useMemo(
        () =>
            Object.fromEntries(
                fieldDefinitions.map((definition) => [
                    definition.value,
                    definition,
                ]),
            ) as Record<ReviewQuestionFilterFieldKey, FieldDefinition>,
        [fieldDefinitions],
    );
    const visibleQuestionIds = useMemo(
        () => questions.map((question) => question.id),
        [questions],
    );
    const selectedQuestionIdSet = useMemo(
        () => new Set(selectedQuestionIds),
        [selectedQuestionIds],
    );
    const selectedQuestions = useMemo(
        () =>
            questions.filter((question) =>
                selectedQuestionIdSet.has(question.id),
            ),
        [questions, selectedQuestionIdSet],
    );
    const editingFieldKeys = useMemo(
        () => (editingQuestion ? Object.keys(editingQuestion.rawRecord) : []),
        [editingQuestion],
    );
    const exportFieldOptions = useMemo<ExportFieldOption[]>(() => {
        const baseFields: ExportFieldOption[] = [
            { value: "externalRecordId", label: "外部记录 ID" },
            { value: "title", label: "题目标题" },
            { value: "status", label: "题目状态" },
            { value: "aiReviewStatus", label: "AI审核" },
            { value: "manualReviewStatus", label: "人工审核" },
            { value: "updatedAt", label: "题目更新时间" },
            { value: "projectName", label: "项目名称" },
            { value: "projectCode", label: "项目编码" },
            { value: "datasourceName", label: "数据源" },
            { value: "sourceRowNumber", label: "来源行号" },
            { value: "reviewDecision", label: "审核结论" },
            { value: "reviewComment", label: "审核意见" },
            { value: "reviewReviewer", label: "审核人" },
            { value: "reviewUpdatedAt", label: "审核更新时间" },
        ];
        const rawFields = rawFieldOptions.map((field) => ({
            value: `raw:${field.key}`,
            label: field.label,
        }));

        return [...baseFields, ...rawFields];
    }, [rawFieldOptions]);
    const projectStrategies = useMemo(
        () =>
            reviewStrategies.filter(
                (strategy) =>
                    !strategy.projectIds.length ||
                    strategy.projectIds.includes(selectedProjectId),
            ),
        [reviewStrategies, selectedProjectId],
    );
    const reviewBatchStrategies = useMemo(
        () => projectStrategies.filter((strategy) => strategy.hasReviewStep),
        [projectStrategies],
    );
    const cleaningBatchStrategies = useMemo(
        () => projectStrategies.filter((strategy) => strategy.hasCleaningStep),
        [projectStrategies],
    );
    const effectiveSelectedStrategyId = reviewBatchStrategies.some(
        (strategy) => strategy.id === selectedStrategyId,
    )
        ? selectedStrategyId
        : (reviewBatchStrategies[0]?.id ?? "");
    const selectedStrategy = reviewBatchStrategies.find(
        (strategy) => strategy.id === effectiveSelectedStrategyId,
    );
    const effectiveSelectedCleaningStrategyId = cleaningBatchStrategies.some(
        (strategy) => strategy.id === selectedCleaningStrategyId,
    )
        ? selectedCleaningStrategyId
        : (cleaningBatchStrategies[0]?.id ?? "");
    const selectedCleaningStrategy = cleaningBatchStrategies.find(
        (strategy) => strategy.id === effectiveSelectedCleaningStrategyId,
    );
    const allVisibleSelected =
        visibleQuestionIds.length > 0 &&
        visibleQuestionIds.every((questionId) =>
            selectedQuestionIdSet.has(questionId),
        );
    const partiallyVisibleSelected =
        selectedQuestionIds.length > 0 && !allVisibleSelected;

    const selectedProject = projects.find(
        (project) => project.id === selectedProjectId,
    );
    const showOperationColumn = mode === "quality";
    const operationColumnWidth = showOperationColumn ? 156 : 0;
    const tableHeaderHeight = 46;
    const tableRowHeight = 50;
    const operationButtonStyle = {
        width: 32,
        height: 32,
        padding: 0,
    } as const;
    const operationColumnStyle = {
        width: operationColumnWidth,
        flex: "0 0 auto",
        borderLeft: "1px solid rgba(217, 224, 234, 0.85)",
        background: "rgba(255, 255, 255, 0.98)",
        boxShadow: "-8px 0 12px -12px rgba(15, 23, 42, 0.45)",
    } as const;
    const operationHeaderStyle = {
        height: tableHeaderHeight,
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        background: "rgba(248, 250, 252, 0.95)",
        fontWeight: 700,
    } as const;
    const operationRowStyle = {
        height: tableRowHeight,
        padding: "0 16px",
        borderTop: "1px solid rgba(217, 224, 234, 0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        overflow: "hidden",
        textAlign: "right",
    } as const;
    const gridTemplateColumns = [
        "52px",
        ...listColumns.map((column) => `${column.width}px`),
    ].join(" ");
    const tableWidth =
        52 + listColumns.reduce((total, column) => total + column.width, 0);

    useEffect(() => {
        setSelectedQuestionIds((current) =>
            current.filter((questionId) =>
                visibleQuestionIds.includes(questionId),
            ),
        );

        if (
            selectionAnchorQuestionIdRef.current &&
            !visibleQuestionIds.includes(selectionAnchorQuestionIdRef.current)
        ) {
            selectionAnchorQuestionIdRef.current = null;
        }
    }, [visibleQuestionIds]);

    useEffect(() => {
        setSelectedStrategyId((current) =>
            reviewBatchStrategies.some((strategy) => strategy.id === current)
                ? current
                : (reviewBatchStrategies[0]?.id ?? ""),
        );
    }, [reviewBatchStrategies]);

    useEffect(() => {
        setSelectedCleaningStrategyId((current) =>
            cleaningBatchStrategies.some((strategy) => strategy.id === current)
                ? current
                : (cleaningBatchStrategies[0]?.id ?? ""),
        );
    }, [cleaningBatchStrategies]);

    useEffect(() => {
        if (!selectedProjectId) {
            return;
        }

        const search = new URLSearchParams({
            projectId: selectedProjectId,
            page: String(currentPage),
            pageSize: String(pageSize),
        });

        const serializedFilters =
            serializeReviewQuestionFilterConditions(activeConditions);

        if (serializedFilters) {
            search.set("filters", serializedFilters);
        }

        writeStoredReviewListHref(listPath, `${listPath}?${search.toString()}`);
    }, [activeConditions, currentPage, listPath, pageSize, selectedProjectId]);

    function buildQuestionDetailPath(questionId: string) {
        const search = new URLSearchParams({
            projectId: selectedProjectId,
            page: String(currentPage),
            pageSize: String(pageSize),
        });

        const serializedFilters =
            serializeReviewQuestionFilterConditions(activeConditions);

        if (serializedFilters) {
            search.set("filters", serializedFilters);
        }

        return `${listPath}/${questionId}?${search.toString()}`;
    }

    function clearTextSelection() {
        if (typeof window === "undefined") {
            return;
        }

        window.getSelection()?.removeAllRanges();
    }

    function openQuestionDetail(questionId: string) {
        clearTextSelection();
        router.push(buildQuestionDetailPath(questionId));
    }

    function pushListState(next: {
        projectId?: string;
        page?: number;
        pageSize?: number;
        conditions?: ReviewQuestionFilterCondition[];
    }) {
        const search = new URLSearchParams({
            projectId: next.projectId ?? selectedProjectId,
            page: String(next.page ?? currentPage),
            pageSize: String(next.pageSize ?? pageSize),
        });

        const serializedFilters = serializeReviewQuestionFilterConditions(
            next.conditions ?? activeConditions,
        );

        if (serializedFilters) {
            search.set("filters", serializedFilters);
        }

        router.push(`${listPath}?${search.toString()}`);
    }

    function isShiftPressed(nativeEvent: Event | undefined) {
        if (!nativeEvent) {
            return false;
        }

        if ("shiftKey" in nativeEvent) {
            return Boolean(
                (nativeEvent as Event & { shiftKey?: unknown }).shiftKey,
            );
        }

        return false;
    }

    function toggleQuestionSelection(
        questionId: string,
        checked: boolean,
        withShift = false,
    ) {
        setSelectedQuestionIds((current) => {
            const anchorQuestionId = selectionAnchorQuestionIdRef.current;
            const currentPageQuestionIds = questions.map((item) => item.id);

            if (withShift && anchorQuestionId) {
                const anchorIndex =
                    currentPageQuestionIds.indexOf(anchorQuestionId);
                const targetIndex = currentPageQuestionIds.indexOf(questionId);

                if (anchorIndex >= 0 && targetIndex >= 0) {
                    const [start, end] =
                        anchorIndex <= targetIndex
                            ? [anchorIndex, targetIndex]
                            : [targetIndex, anchorIndex];
                    const rangeIds = currentPageQuestionIds.slice(
                        start,
                        end + 1,
                    );
                    const nextSet = new Set(current);

                    if (checked) {
                        rangeIds.forEach((id) => nextSet.add(id));
                    } else {
                        rangeIds.forEach((id) => nextSet.delete(id));
                    }

                    return Array.from(nextSet);
                }
            }

            if (checked) {
                return current.includes(questionId)
                    ? current
                    : [...current, questionId];
            }

            return current.filter((item) => item !== questionId);
        });

        selectionAnchorQuestionIdRef.current = questionId;
    }

    function openEditModal(question: ReviewQuestionItem) {
        const fieldKeys = Object.keys(question.rawRecord);
        const fieldKey = fieldKeys[0] ?? "";

        setEditingQuestion(question);
        setEditingFieldKey(fieldKey);
        setEditingFieldValue(stringifyRawValue(question.rawRecord[fieldKey]));
    }

    function updateEditingField(fieldKey: string) {
        setEditingFieldKey(fieldKey);
        setEditingFieldValue(
            stringifyRawValue(editingQuestion?.rawRecord[fieldKey]),
        );
    }

    async function submitFieldEdit() {
        if (!editingQuestion || !editingFieldKey) {
            return;
        }

        setIsSavingField(true);

        try {
            const response = await fetch(
                `/api/data-evaluations/questions/${encodeURIComponent(
                    editingQuestion.id,
                )}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        fieldKey: editingFieldKey,
                        value: parseEditedRawValue(
                            editingQuestion.rawRecord[editingFieldKey],
                            editingFieldValue,
                        ),
                    }),
                },
            );
            const payload = (await response
                .json()
                .catch(() => ({}))) as QuestionOperationResponse;

            if (!response.ok) {
                throw new Error(payload.error ?? "字段更新失败。");
            }

            toast.success({
                title: "字段已更新",
                description: payload.success ?? "题目字段已保存。",
            });
            setEditingQuestion(null);
            router.refresh();
        } catch (error) {
            toast.error({
                title: "字段更新失败",
                description:
                    error instanceof Error ? error.message : "字段更新失败。",
            });
        } finally {
            setIsSavingField(false);
        }
    }

    async function submitRecordReplacement() {
        if (!updatingQuestion || !replacementFile) {
            return;
        }

        setIsReplacingRecord(true);

        try {
            const formData = new FormData();
            formData.set("file", replacementFile);

            const response = await fetch(
                `/api/data-evaluations/questions/${encodeURIComponent(
                    updatingQuestion.id,
                )}`,
                {
                    method: "PUT",
                    body: formData,
                },
            );
            const payload = (await response
                .json()
                .catch(() => ({}))) as QuestionOperationResponse;

            if (!response.ok) {
                throw new Error(payload.error ?? "原始记录覆盖失败。");
            }

            toast.success({
                title: "原始记录已覆盖",
                description: payload.success ?? "题目原始记录已更新。",
            });
            setUpdatingQuestion(null);
            setReplacementFile(null);
            router.refresh();
        } catch (error) {
            toast.error({
                title: "原始记录覆盖失败",
                description:
                    error instanceof Error
                        ? error.message
                        : "原始记录覆盖失败。",
            });
        } finally {
            setIsReplacingRecord(false);
        }
    }

    async function deleteQuestion(question: ReviewQuestionItem) {
        const response = await fetch(
            `/api/data-evaluations/questions/${encodeURIComponent(
                question.id,
            )}`,
            {
                method: "DELETE",
            },
        );
        const payload = (await response
            .json()
            .catch(() => ({}))) as QuestionOperationResponse;

        if (!response.ok) {
            toast.error({
                title: "删除失败",
                description: payload.error ?? "题目删除失败。",
            });
            return;
        }

        toast.success({
            title: "题目已删除",
            description: payload.success ?? "该条数据已删除。",
        });
        setSelectedQuestionIds((current) =>
            current.filter((questionId) => questionId !== question.id),
        );
        router.refresh();
    }

    function renderQuestionOperations(question: ReviewQuestionItem) {
        if (!question.canManage) {
            return <span className="muted">-</span>;
        }

        return (
            <div
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                }}
            >
                <Button
                    type="text"
                    size="small"
                    title="编辑字段"
                    aria-label="编辑字段"
                    icon={<Edit3 size={15} />}
                    style={operationButtonStyle}
                    onClick={() => openEditModal(question)}
                />
                <Button
                    type="text"
                    size="small"
                    title="JSON 覆盖"
                    aria-label="JSON 覆盖"
                    icon={<RefreshCw size={15} />}
                    style={operationButtonStyle}
                    onClick={() => {
                        setUpdatingQuestion(question);
                        setReplacementFile(null);
                    }}
                />
                <Popconfirm
                    title="删除题目"
                    description="删除后该题目的质检结果和运行记录会一并删除。"
                    okText="删除"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => deleteQuestion(question)}
                >
                    <Button
                        type="text"
                        size="small"
                        title="删除"
                        aria-label="删除"
                        icon={<Trash2 size={15} />}
                        style={operationButtonStyle}
                    />
                </Popconfirm>
            </div>
        );
    }

    async function createBatchRun() {
        if (!selectedQuestions.length) {
            toast.warning({
                title: "请先勾选题目",
                description: "至少选择 1 道题目后才能批量运行数据质检策略。",
            });
            return;
        }

        if (!effectiveSelectedStrategyId || !selectedStrategy) {
            toast.warning({
                title: "请选择策略",
                description: "当前项目没有可批量执行的数据质检策略。",
            });
            return;
        }

        setIsCreatingBatchRun(true);

        try {
            const result = await createAiReviewStrategyBatchRunAction({
                strategyId: selectedStrategy.id,
                projectId: selectedProjectId,
                questionIds: selectedQuestions.map((question) => question.id),
                concurrency: Math.min(
                    2,
                    Math.max(1, Math.floor(batchConcurrency || 1)),
                ),
                purpose: "REVIEW",
            });

            if (result.error) {
                toast.error({
                    title: "创建批量任务失败",
                    description: result.error,
                });
                return;
            }

            toast.success({
                title: "批量任务已创建",
                description:
                    result.success ??
                    "后台 worker 会继续执行当前批量质检任务。",
                duration: 5,
            });

            setSelectedQuestionIds([]);
            setBatchModalOpen(false);
        } finally {
            setIsCreatingBatchRun(false);
        }
    }

    async function createCleaningBatchRun() {
        if (!selectedQuestions.length) {
            toast.warning({
                title: "请先勾选题目",
                description: "至少选择 1 道题目后才能批量清洗字段。",
            });
            return;
        }

        if (!effectiveSelectedCleaningStrategyId || !selectedCleaningStrategy) {
            toast.warning({
                title: "请选择清洗策略",
                description: "当前项目没有可批量执行的数据清洗策略。",
            });
            return;
        }

        setIsCreatingCleaningBatchRun(true);

        try {
            const result = await createAiReviewStrategyBatchRunAction({
                strategyId: selectedCleaningStrategy.id,
                projectId: selectedProjectId,
                questionIds: selectedQuestions.map((question) => question.id),
                concurrency: Math.min(
                    2,
                    Math.max(1, Math.floor(cleaningConcurrency || 1)),
                ),
                purpose: "CLEANING",
            });

            if (result.error) {
                toast.error({
                    title: "创建批量清洗任务失败",
                    description: result.error,
                });
                return;
            }

            toast.success({
                title: "批量清洗任务已创建",
                description:
                    result.success ??
                    "后台 worker 会继续执行当前批量清洗任务。",
                duration: 5,
            });

            setSelectedQuestionIds([]);
            setCleaningModalOpen(false);
        } finally {
            setIsCreatingCleaningBatchRun(false);
        }
    }

    function openExportModal() {
        if (!selectedQuestionIds.length && !totalQuestions) {
            toast.warning({
                title: "没有可导出数据",
                description: "当前项目下没有可导出的题目。",
            });
            return;
        }

        if (!selectedExportFields.length) {
            setSelectedExportFields([
                "externalRecordId",
                "manualReviewStatus",
                "reviewComment",
            ]);
        }

        if (!selectedQuestionIds.length) {
            setExportScope("filteredAll");
        }

        setExportModalOpen(true);
    }

    async function exportSelectedQuestions() {
        if (exportScope === "selected" && !selectedQuestions.length) {
            toast.warning({
                title: "请先勾选题目",
                description: "请选择“仅导出勾选题目”时至少勾选 1 道题目。",
            });
            return;
        }

        if (!selectedExportFields.length) {
            toast.warning({
                title: "请选择导出字段",
                description: "至少选择 1 个字段后再导出。",
            });
            return;
        }

        setIsExporting(true);

        try {
            const result = await exportReviewQuestionsAction({
                projectId: selectedProjectId,
                scope: exportScope,
                questionIds: selectedQuestions.map((question) => question.id),
                filters: activeConditions,
                fieldKeys: selectedExportFields,
                format: exportFormat,
            });

            if (result.error) {
                toast.error({
                    title: "导出失败",
                    description: result.error,
                });
                return;
            }

            if (!result.base64 || !result.fileName || !result.mimeType) {
                toast.error({
                    title: "导出失败",
                    description: "导出结果不完整，请稍后重试。",
                });
                return;
            }

            const bytes = Uint8Array.from(atob(result.base64), (char) =>
                char.charCodeAt(0),
            );
            const blob = new Blob([bytes], { type: result.mimeType });
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = objectUrl;
            anchor.download = result.fileName;
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(objectUrl);

            toast.success({
                title: "导出成功",
                description: result.success ?? "文件已开始下载。",
            });
            setExportModalOpen(false);
        } catch (error) {
            toast.error({
                title: "导出失败",
                description:
                    error instanceof Error ? error.message : "请稍后再试。",
            });
        } finally {
            setIsExporting(false);
        }
    }

    function openReportModal() {
        if (!selectedQuestionIds.length && !totalQuestions) {
            toast.warning({
                title: "没有可导出数据",
                description: "当前项目下没有可导出的题目。",
            });
            return;
        }

        if (!selectedQuestionIds.length) {
            setReportScope("filteredAll");
        }

        setReportModalOpen(true);
    }

    async function exportReport() {
        if (!reportSubjectFieldKey) {
            toast.warning({
                title: "请选择学科字段",
                description: "请选择用于按学科分组的原始字段。",
            });
            return;
        }

        const normalizedReportDetailFields = reportDetailFields.filter(
            (fieldKey) => fieldKey !== "datasourceId",
        );

        if (!normalizedReportDetailFields.length) {
            toast.warning({
                title: "请选择详情字段",
                description: "至少选择 1 个详情字段后再导出。",
            });
            return;
        }

        setIsExportingReport(true);

        try {
            const result = await exportReviewReportAction({
                projectId: selectedProjectId,
                scope: reportScope,
                questionIds: selectedQuestions.map((question) => question.id),
                filters: activeConditions,
                subjectFieldKey: reportSubjectFieldKey,
                detailFieldKeys: normalizedReportDetailFields,
                rejectedOnlyInDetails: reportRejectedOnlyInDetails,
                format: reportFormat,
            });

            if (result.error) {
                toast.error({
                    title: "导出失败",
                    description: result.error,
                });
                return;
            }

            if (!result.base64 || !result.fileName || !result.mimeType) {
                toast.error({
                    title: "导出失败",
                    description: "导出结果不完整，请稍后重试。",
                });
                return;
            }

            const bytes = Uint8Array.from(atob(result.base64), (char) =>
                char.charCodeAt(0),
            );
            const blob = new Blob([bytes], { type: result.mimeType });
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = objectUrl;
            anchor.download = result.fileName;
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(objectUrl);

            toast.success({
                title: "导出成功",
                description: result.success ?? "文件已开始下载。",
            });
            setReportModalOpen(false);
        } catch (error) {
            toast.error({
                title: "导出失败",
                description:
                    error instanceof Error ? error.message : "请稍后再试。",
            });
        } finally {
            setIsExportingReport(false);
        }
    }

    return (
        <section className="content-surface review-content-surface review-compact-scope">
            <div className="section-head" style={{ marginBottom: 16 }}>
                <div>
                    <h3 className="review-page-title">{pageLabels.title}</h3>
                    <p className="muted review-page-copy">
                        {scopeLabel ?? "当前项目"}内{pageLabels.description}
                    </p>
                </div>
                <Tag color="blue">
                    {questions.length} / {totalQuestions}
                </Tag>
            </div>

            {!canReview ? (
                <Empty description={pageLabels.noPermission} />
            ) : !projects.length ? (
                <Empty description="当前没有可切换的项目数据" />
            ) : (
                <>
                    <div className="review-toolbar">
                        <div className="review-toolbar-field">
                            <div className="review-toolbar-label">当前项目</div>
                            <Select
                                value={selectedProjectId}
                                onChange={(value) => {
                                    setSelectedQuestionIds([]);
                                    pushListState({
                                        projectId: value,
                                        page: 1,
                                        conditions: [],
                                    });
                                }}
                                options={projects.map((project) => ({
                                    value: project.id,
                                    label: `${project.name} (${project.code})`,
                                }))}
                                style={{ minWidth: 280 }}
                                size="middle"
                            />
                        </div>

                        <div className="review-toolbar-actions">
                            {selectedProject ? (
                                <Tag color="gold">{selectedProject.code}</Tag>
                            ) : null}
                            {selectedQuestionIds.length ? (
                                <Tag color="blue">
                                    已选 {selectedQuestionIds.length} 题
                                </Tag>
                            ) : null}
                            <Button
                                icon={<SlidersHorizontal size={16} />}
                                onClick={() => {
                                    setDraftConditions(
                                        activeConditions.length
                                            ? activeConditions
                                            : [
                                                  createReviewQuestionFilterCondition(
                                                      1,
                                                  ),
                                              ],
                                    );
                                    setModalOpen(true);
                                }}
                            >
                                筛选条件
                            </Button>
                            {mode === "quality" ? (
                                <Button
                                    icon={<Eye size={16} />}
                                    onClick={() => setFieldSettingsOpen(true)}
                                    disabled={!selectedProjectId}
                                >
                                    字段设置
                                </Button>
                            ) : null}
                            {activeConditions.length ? (
                                <Button
                                    onClick={() =>
                                        pushListState({
                                            page: 1,
                                            conditions: [],
                                        })
                                    }
                                >
                                    清空筛选
                                </Button>
                            ) : null}
                            {mode === "quality" ? (
                                <Button
                                    type="primary"
                                    icon={<Bot size={16} />}
                                    disabled={
                                        !selectedQuestionIds.length ||
                                        !reviewBatchStrategies.length
                                    }
                                    onClick={() => setBatchModalOpen(true)}
                                >
                                    批量运行 AI 质检
                                </Button>
                            ) : (
                                <Button
                                    type="primary"
                                    icon={<Sparkles size={16} />}
                                    disabled={
                                        !selectedQuestionIds.length ||
                                        !cleaningBatchStrategies.length
                                    }
                                    onClick={() => setCleaningModalOpen(true)}
                                >
                                    批量清洗
                                </Button>
                            )}
                            <Button
                                icon={<Download size={16} />}
                                disabled={
                                    !selectedQuestionIds.length &&
                                    !totalQuestions
                                }
                                onClick={openExportModal}
                            >
                                导出数据
                            </Button>
                            <Button
                                icon={<FileText size={16} />}
                                disabled={
                                    !selectedQuestionIds.length &&
                                    !totalQuestions
                                }
                                onClick={openReportModal}
                            >
                                导出审核报告
                            </Button>
                            {selectedQuestionIds.length ? (
                                <Button
                                    onClick={() => setSelectedQuestionIds([])}
                                >
                                    清空勾选
                                </Button>
                            ) : null}
                        </div>
                    </div>

                    {activeConditions.length ? (
                        <div className="review-filter-tags">
                            {activeConditions.map((condition) => {
                                const fieldDefinition =
                                    fieldDefinitionMap[condition.fieldKey];
                                const datasourceLabel = datasourceOptions.find(
                                    (option) =>
                                        option.value === condition.value,
                                )?.label;
                                const operatorLabel =
                                    getOperatorOptions(
                                        fieldDefinition?.valueType ?? "text",
                                    ).find(
                                        (option) =>
                                            option.value === condition.operator,
                                    )?.label ?? condition.operator;
                                const valueLabel =
                                    condition.fieldKey === "status"
                                        ? (questionStatusMeta[
                                              condition.value as QuestionStatus
                                          ]?.label ?? condition.value)
                                        : condition.fieldKey ===
                                                "aiReviewStatus" ||
                                            condition.fieldKey ===
                                                "manualReviewStatus"
                                          ? (reviewStatusMeta[
                                                condition.value as ReviewStatus
                                            ]?.label ?? condition.value)
                                          : condition.fieldKey ===
                                              "datasourceId"
                                            ? (datasourceLabel ??
                                              condition.value)
                                            : condition.value || "—";

                                return (
                                    <Tag key={condition.id} color="blue">
                                        {fieldDefinition?.label ??
                                            condition.fieldKey}{" "}
                                        {operatorLabel}
                                        {conditionNeedsValue(condition.operator)
                                            ? ` ${valueLabel}`
                                            : ""}
                                    </Tag>
                                );
                            })}
                        </div>
                    ) : null}

                    {!questions.length ? (
                        <Empty
                            description={
                                totalQuestions
                                    ? "当前筛选条件下没有记录"
                                    : "当前项目下还没有题目"
                            }
                            style={{ marginTop: 24 }}
                        />
                    ) : (
                        <>
                            {mode === "quality" && !listColumns.length ? (
                                <div
                                    className="workspace-tip"
                                    style={{ marginTop: 20 }}
                                >
                                    <Tag color="gold">提示</Tag>
                                    <span>
                                        当前字段配置未在列表中启用任何原始字段，列表仅展示固定信息列。
                                    </span>
                                </div>
                            ) : null}
                            <div
                                className="table-surface"
                                style={{
                                    marginTop: 20,
                                    display: "flex",
                                    alignItems: "stretch",
                                    overflow: "hidden",
                                }}
                            >
                                <div
                                    className="review-list-scroll"
                                    style={{
                                        flex: "1 1 auto",
                                        minWidth: 0,
                                        overflowX: "auto",
                                        overflowY: "hidden",
                                    }}
                                >
                                    <div
                                        style={{
                                            minWidth: tableWidth,
                                            width: "max-content",
                                        }}
                                    >
                                        <div
                                            className="review-table-head"
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns:
                                                    gridTemplateColumns,
                                                gap: 16,
                                                height: tableHeaderHeight,
                                                padding: "0 16px",
                                                background:
                                                    "rgba(248, 250, 252, 0.9)",
                                                fontWeight: 700,
                                                alignItems: "center",
                                            }}
                                        >
                                            <div>
                                                <Checkbox
                                                    checked={allVisibleSelected}
                                                    indeterminate={
                                                        partiallyVisibleSelected
                                                    }
                                                    onChange={(event) =>
                                                        setSelectedQuestionIds(
                                                            event.target.checked
                                                                ? visibleQuestionIds
                                                                : [],
                                                        )
                                                    }
                                                    onClick={(event) =>
                                                        event.stopPropagation()
                                                    }
                                                />
                                            </div>
                                            {listColumns.map((column) => (
                                                <div
                                                    key={column.key}
                                                    style={cellStyle}
                                                    title={column.label}
                                                >
                                                    {column.label}
                                                </div>
                                            ))}
                                        </div>

                                    {questions.map((question) => {
                                        const isSelected =
                                            selectedQuestionIdSet.has(
                                                question.id,
                                            );

                                        return (
                                            <div
                                                key={question.id}
                                                role="button"
                                                tabIndex={0}
                                                className={`review-question-row${
                                                    isSelected
                                                        ? " is-selected"
                                                        : ""
                                                }`}
                                                style={{
                                                    display: "grid",
                                                    gridTemplateColumns:
                                                        gridTemplateColumns,
                                                    gap: 16,
                                                    height: tableRowHeight,
                                                    padding: "0 16px",
                                                    borderTop:
                                                        "1px solid rgba(217, 224, 234, 0.85)",
                                                    alignItems: "center",
                                                    overflow: "hidden",
                                                    cursor: "pointer",
                                                }}
                                                onClick={() =>
                                                    openQuestionDetail(
                                                        question.id,
                                                    )
                                                }
                                                onKeyDown={(event) => {
                                                    if (
                                                        event.key === "Enter" ||
                                                        event.key === " "
                                                    ) {
                                                        event.preventDefault();
                                                        openQuestionDetail(
                                                            question.id,
                                                        );
                                                    }
                                                }}
                                            >
                                                <div
                                                    onClick={(event) =>
                                                        event.stopPropagation()
                                                    }
                                                    onKeyDown={(event) =>
                                                        event.stopPropagation()
                                                    }
                                                >
                                                    <Checkbox
                                                        checked={isSelected}
                                                        onChange={(event) =>
                                                            toggleQuestionSelection(
                                                                question.id,
                                                                event.target
                                                                    .checked,
                                                                isShiftPressed(
                                                                    event.nativeEvent,
                                                                ),
                                                            )
                                                        }
                                                    />
                                                </div>
                                                {listColumns.map((column) => {
                                                    if (
                                                        column.key ===
                                                        datasourceFieldKey
                                                    ) {
                                                        return (
                                                            <div
                                                                key={`${question.id}-${column.key}`}
                                                                className="muted"
                                                                style={
                                                                    cellStyle
                                                                }
                                                                title={
                                                                    question.datasourceName
                                                                }
                                                            >
                                                                {
                                                                    question.datasourceName
                                                                }
                                                            </div>
                                                        );
                                                    }

                                                    if (
                                                        column.key ===
                                                        revisionFieldKey
                                                    ) {
                                                        return (
                                                            <div
                                                                key={`${question.id}-${column.key}`}
                                                                style={
                                                                    cellStyle
                                                                }
                                                            >
                                                                <Tag
                                                                    color={
                                                                        question.isLatestRevision
                                                                            ? "blue"
                                                                            : "default"
                                                                    }
                                                                >
                                                                    V
                                                                    {
                                                                        question.revisionNo
                                                                    }{" "}
                                                                    ·{" "}
                                                                    {question.isLatestRevision
                                                                        ? "最新版"
                                                                        : "历史版"}
                                                                </Tag>
                                                            </div>
                                                        );
                                                    }

                                                    if (
                                                        column.key ===
                                                        aiReviewStatusFieldKey
                                                    ) {
                                                        return (
                                                            <div
                                                                key={`${question.id}-${column.key}`}
                                                                title={formatReviewTooltip(
                                                                    question.aiReview,
                                                                )}
                                                            >
                                                                <Tag
                                                                    color={
                                                                        reviewStatusMeta[
                                                                            question
                                                                                .aiReview
                                                                                ?.decision ??
                                                                                "NONE"
                                                                        ]
                                                                            .color
                                                                    }
                                                                >
                                                                    {
                                                                        reviewStatusMeta[
                                                                            question
                                                                                .aiReview
                                                                                ?.decision ??
                                                                                "NONE"
                                                                        ]
                                                                            .label
                                                                    }
                                                                </Tag>
                                                            </div>
                                                        );
                                                    }

                                                    if (
                                                        column.key ===
                                                        manualReviewStatusFieldKey
                                                    ) {
                                                        return (
                                                            <div
                                                                key={`${question.id}-${column.key}`}
                                                                title={formatReviewTooltip(
                                                                    question.manualReview,
                                                                )}
                                                            >
                                                                <Tag
                                                                    color={
                                                                        reviewStatusMeta[
                                                                            question
                                                                                .manualReview
                                                                                ?.decision ??
                                                                                "NONE"
                                                                        ]
                                                                            .color
                                                                    }
                                                                >
                                                                    {
                                                                        reviewStatusMeta[
                                                                            question
                                                                                .manualReview
                                                                                ?.decision ??
                                                                                "NONE"
                                                                        ]
                                                                            .label
                                                                    }
                                                                </Tag>
                                                            </div>
                                                        );
                                                    }

                                                    if (
                                                        column.key ===
                                                        manualReviewUpdatedAtFieldKey
                                                    ) {
                                                        const value = question
                                                            .manualReview
                                                            ?.updatedAt
                                                            ? new Date(
                                                                  question.manualReview.updatedAt,
                                                              ).toLocaleString(
                                                                  "zh-CN",
                                                              )
                                                            : "—";

                                                        return (
                                                            <div
                                                                key={`${question.id}-${column.key}`}
                                                                className="muted"
                                                                style={
                                                                    cellStyle
                                                                }
                                                                title={value}
                                                            >
                                                                {value}
                                                            </div>
                                                        );
                                                    }

                                                    if (
                                                        column.key ===
                                                        questionUpdatedAtFieldKey
                                                    ) {
                                                        const value = new Date(
                                                            question.updatedAt,
                                                        ).toLocaleString(
                                                            "zh-CN",
                                                        );

                                                        return (
                                                            <div
                                                                key={`${question.id}-${column.key}`}
                                                                className="muted"
                                                                style={
                                                                    cellStyle
                                                                }
                                                                title={value}
                                                            >
                                                                {value}
                                                            </div>
                                                        );
                                                    }

                                                    if (
                                                        mode === "cleaning" &&
                                                        !column.key.startsWith(
                                                            "system:",
                                                        )
                                                    ) {
                                                        const hasResult =
                                                            question
                                                                .cleaningFieldStatus[
                                                                column.key
                                                            ] === true;

                                                        return (
                                                            <div
                                                                key={`${question.id}-${column.key}`}
                                                                style={
                                                                    cellStyle
                                                                }
                                                                title={
                                                                    hasResult
                                                                        ? "已生成清洗结果"
                                                                        : "暂无清洗结果"
                                                                }
                                                            >
                                                                <Tag
                                                                    color={
                                                                        hasResult
                                                                            ? "success"
                                                                            : "default"
                                                                    }
                                                                >
                                                                    {hasResult
                                                                        ? "是"
                                                                        : "否"}
                                                                </Tag>
                                                            </div>
                                                        );
                                                    }

                                                    const value =
                                                        column.key ===
                                                        manualReviewReviewerFieldKey
                                                            ? (question
                                                                  .manualReview
                                                                  ?.reviewerName ??
                                                              "—")
                                                            : question.rawRecord[
                                                                  column.key
                                                              ] || "—";

                                                    return (
                                                        <div
                                                            key={`${question.id}-${column.key}`}
                                                            style={cellStyle}
                                                            title={value}
                                                        >
                                                            {value}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            {showOperationColumn ? (
                                <div style={operationColumnStyle}>
                                    <div style={operationHeaderStyle}>操作</div>
                                    {questions.map((question) => {
                                        const isSelected =
                                            selectedQuestionIdSet.has(
                                                question.id,
                                            );

                                        return (
                                            <div
                                                key={`operation-${question.id}`}
                                                style={{
                                                    ...operationRowStyle,
                                                    background: isSelected
                                                        ? "rgba(239, 246, 255, 0.98)"
                                                        : "rgba(255, 255, 255, 0.98)",
                                                }}
                                                onClick={(event) =>
                                                    event.stopPropagation()
                                                }
                                                onKeyDown={(event) =>
                                                    event.stopPropagation()
                                                }
                                            >
                                                {renderQuestionOperations(
                                                    question,
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 12,
                                    marginTop: 16,
                                    flexWrap: "wrap",
                                }}
                            >
                                <div className="muted">
                                    当前第 {currentPage} 页，共{" "}
                                    {Math.max(
                                        1,
                                        Math.ceil(totalQuestions / pageSize),
                                    )}{" "}
                                    页，总计 {totalQuestions} 条。
                                </div>
                                <Pagination
                                    current={currentPage}
                                    pageSize={pageSize}
                                    total={totalQuestions}
                                    showSizeChanger
                                    pageSizeOptions={["20", "50", "100"]}
                                    onChange={(page, nextPageSize) => {
                                        const normalizedPageSize =
                                            nextPageSize ?? pageSize;

                                        setSelectedQuestionIds([]);
                                        pushListState({
                                            page:
                                                normalizedPageSize === pageSize
                                                    ? page
                                                    : 1,
                                            pageSize: normalizedPageSize,
                                        });
                                    }}
                                />
                            </div>
                        </>
                    )}

                    <Modal
                        open={modalOpen}
                        rootClassName="review-dialog"
                        onCancel={() => setModalOpen(false)}
                        onOk={() => {
                            pushListState({
                                page: 1,
                                conditions: draftConditions,
                            });
                            setModalOpen(false);
                        }}
                        okText="应用筛选"
                        cancelText="取消"
                        width={760}
                        title="筛选条件"
                        destroyOnHidden
                    >
                        <div
                            style={{ display: "grid", gap: 16, marginTop: 16 }}
                        >
                            <div className="workspace-tip">
                                <Tag color="blue">说明</Tag>
                                <span>
                                    支持多组条件叠加。当前按“全部条件同时满足”进行筛选。
                                </span>
                            </div>

                            <div style={{ display: "grid", gap: 12 }}>
                                {draftConditions.map((condition, index) => {
                                    const fieldDefinition =
                                        fieldDefinitionMap[condition.fieldKey];
                                    const operatorOptions: Array<{
                                        value: ReviewQuestionFilterOperator;
                                        label: string;
                                    }> = getOperatorOptions(
                                        fieldDefinition?.valueType ?? "text",
                                    );
                                    const availableDatasourceOptions =
                                        datasourceOptions.length
                                            ? datasourceOptions
                                            : [
                                                  {
                                                      value: "",
                                                      label: "当前项目暂无数据源",
                                                  },
                                              ];

                                    return (
                                        <div
                                            key={condition.id}
                                            className="review-filter-row"
                                        >
                                            <Select
                                                value={condition.fieldKey}
                                                options={fieldDefinitions.map(
                                                    (definition) => ({
                                                        value: definition.value,
                                                        label: definition.label,
                                                    }),
                                                )}
                                                size="middle"
                                                onChange={(value) => {
                                                    const nextFieldDefinition =
                                                        fieldDefinitionMap[
                                                            value
                                                        ];
                                                    const nextOperator =
                                                        getOperatorOptions(
                                                            nextFieldDefinition.valueType,
                                                        )[0]?.value ?? "equals";

                                                    setDraftConditions((prev) =>
                                                        prev.map((item) =>
                                                            item.id ===
                                                            condition.id
                                                                ? {
                                                                      ...item,
                                                                      fieldKey:
                                                                          value,
                                                                      operator:
                                                                          nextOperator,
                                                                      value:
                                                                          value ===
                                                                          "status"
                                                                              ? "SUBMITTED"
                                                                              : value ===
                                                                                      "aiReviewStatus" ||
                                                                                  value ===
                                                                                      "manualReviewStatus"
                                                                                ? "NONE"
                                                                                : value ===
                                                                                    "datasourceId"
                                                                                  ? (availableDatasourceOptions[0]
                                                                                        ?.value ??
                                                                                    "")
                                                                                  : "",
                                                                  }
                                                                : item,
                                                        ),
                                                    );
                                                }}
                                            />
                                            <Select
                                                value={condition.operator}
                                                options={operatorOptions}
                                                size="middle"
                                                onChange={(value) => {
                                                    setDraftConditions((prev) =>
                                                        prev.map((item) =>
                                                            item.id ===
                                                            condition.id
                                                                ? {
                                                                      ...item,
                                                                      operator:
                                                                          value,
                                                                  }
                                                                : item,
                                                        ),
                                                    );
                                                }}
                                            />
                                            {fieldDefinition?.valueType ===
                                            "select" ? (
                                                <Select
                                                    value={condition.value}
                                                    options={
                                                        condition.fieldKey ===
                                                        "status"
                                                            ? Object.entries(
                                                                  questionStatusMeta,
                                                              ).map(
                                                                  ([
                                                                      value,
                                                                      meta,
                                                                  ]) => ({
                                                                      value,
                                                                      label: meta.label,
                                                                  }),
                                                              )
                                                            : condition.fieldKey ===
                                                                    "aiReviewStatus" ||
                                                                condition.fieldKey ===
                                                                    "manualReviewStatus"
                                                              ? Object.entries(
                                                                    reviewStatusMeta,
                                                                ).map(
                                                                    ([
                                                                        value,
                                                                        meta,
                                                                    ]) => ({
                                                                        value,
                                                                        label: meta.label,
                                                                    }),
                                                                )
                                                              : availableDatasourceOptions
                                                    }
                                                    size="middle"
                                                    onChange={(value) => {
                                                        setDraftConditions(
                                                            (prev) =>
                                                                prev.map(
                                                                    (item) =>
                                                                        item.id ===
                                                                        condition.id
                                                                            ? {
                                                                                  ...item,
                                                                                  value,
                                                                              }
                                                                            : item,
                                                                ),
                                                        );
                                                    }}
                                                    disabled={
                                                        !conditionNeedsValue(
                                                            condition.operator,
                                                        )
                                                    }
                                                />
                                            ) : (
                                                <Input
                                                    value={condition.value}
                                                    size="middle"
                                                    placeholder={
                                                        fieldDefinition?.valueType ===
                                                        "number"
                                                            ? "请输入数字"
                                                            : "请输入筛选内容"
                                                    }
                                                    onChange={(event) => {
                                                        setDraftConditions(
                                                            (prev) =>
                                                                prev.map(
                                                                    (item) =>
                                                                        item.id ===
                                                                        condition.id
                                                                            ? {
                                                                                  ...item,
                                                                                  value: event
                                                                                      .target
                                                                                      .value,
                                                                              }
                                                                            : item,
                                                                ),
                                                        );
                                                    }}
                                                    disabled={
                                                        !conditionNeedsValue(
                                                            condition.operator,
                                                        )
                                                    }
                                                />
                                            )}
                                            <Button
                                                icon={<X size={14} />}
                                                onClick={() => {
                                                    setDraftConditions((prev) =>
                                                        prev.filter(
                                                            (item) =>
                                                                item.id !==
                                                                condition.id,
                                                        ),
                                                    );
                                                }}
                                            >
                                                删除
                                            </Button>
                                            <div className="review-filter-index">
                                                {index + 1}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <Button
                                onClick={() => {
                                    setDraftConditions((prev) => [
                                        ...prev,
                                        createReviewQuestionFilterCondition(
                                            prev.length + 1,
                                        ),
                                    ]);
                                }}
                            >
                                + 添加条件
                            </Button>
                        </div>
                    </Modal>

                    <Modal
                        open={Boolean(editingQuestion)}
                        rootClassName="review-dialog"
                        title="编辑字段"
                        onCancel={() => setEditingQuestion(null)}
                        onOk={submitFieldEdit}
                        okText={isSavingField ? "保存中" : "保存"}
                        cancelText="取消"
                        confirmLoading={isSavingField}
                        okButtonProps={{ disabled: !editingFieldKey }}
                        destroyOnHidden
                    >
                        <div
                            style={{ display: "grid", gap: 16, marginTop: 16 }}
                        >
                            <div>
                                <div className="review-toolbar-label">题目</div>
                                <div className="muted">
                                    {editingQuestion?.title ??
                                        editingQuestion?.externalRecordId ??
                                        "-"}
                                </div>
                            </div>
                            <div>
                                <div className="review-toolbar-label">字段</div>
                                <Select
                                    value={editingFieldKey}
                                    disabled={isSavingField}
                                    options={editingFieldKeys.map((fieldKey) => ({
                                        value: fieldKey,
                                        label: fieldKey,
                                    }))}
                                    style={{ width: "100%" }}
                                    onChange={updateEditingField}
                                />
                            </div>
                            <div>
                                <div className="review-toolbar-label">值</div>
                                <Input.TextArea
                                    value={editingFieldValue}
                                    disabled={isSavingField}
                                    style={{
                                        minHeight: 176,
                                        fontFamily:
                                            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                        fontSize: 12,
                                    }}
                                    onChange={(event) =>
                                        setEditingFieldValue(event.target.value)
                                    }
                                />
                            </div>
                        </div>
                    </Modal>

                    <Modal
                        open={Boolean(updatingQuestion)}
                        rootClassName="review-dialog"
                        title="JSON 覆盖"
                        onCancel={() => {
                            setUpdatingQuestion(null);
                            setReplacementFile(null);
                        }}
                        onOk={submitRecordReplacement}
                        okText={isReplacingRecord ? "覆盖中" : "覆盖"}
                        cancelText="取消"
                        confirmLoading={isReplacingRecord}
                        okButtonProps={{ disabled: !replacementFile }}
                        destroyOnHidden
                    >
                        <div
                            style={{ display: "grid", gap: 16, marginTop: 16 }}
                        >
                            <div className="workspace-tip">
                                <Tag color="gold">要求</Tag>
                                <span>
                                    JSON 必须是单个对象，会直接覆盖该条原始记录。
                                </span>
                            </div>
                            <div>
                                <div className="review-toolbar-label">
                                    JSON 文件
                                </div>
                                <Input
                                    type="file"
                                    accept="application/json,.json"
                                    disabled={isReplacingRecord}
                                    onChange={(event) =>
                                        setReplacementFile(
                                            event.target.files?.[0] ?? null,
                                        )
                                    }
                                />
                            </div>
                            {updatingQuestion ? (
                                <div className="muted">
                                    当前字段数{" "}
                                    {
                                        Object.keys(updatingQuestion.rawRecord)
                                            .length
                                    }
                                </div>
                            ) : null}
                        </div>
                    </Modal>

                    <ReviewFieldSettingsModal
                        open={fieldSettingsOpen}
                        projectId={selectedProjectId}
                        projectLabel={
                            selectedProject
                                ? `${selectedProject.name} (${selectedProject.code})`
                                : undefined
                        }
                        fieldPreference={fieldPreference}
                        onClose={() => setFieldSettingsOpen(false)}
                        onSaved={() => router.refresh()}
                    />

                    <Modal
                        open={batchModalOpen}
                        rootClassName="review-dialog"
                        title="批量运行数据质检"
                        okText={isCreatingBatchRun ? "创建中" : "创建后台任务"}
                        cancelText="取消"
                        onOk={createBatchRun}
                        onCancel={() => setBatchModalOpen(false)}
                        confirmLoading={isCreatingBatchRun}
                        destroyOnHidden
                    >
                        <div
                            style={{ display: "grid", gap: 16, marginTop: 16 }}
                        >
                            <div className="workspace-tip">
                                <Tag color="blue">
                                    已选 {selectedQuestions.length} 题
                                </Tag>
                                <span>
                                    建议并发不要超过
                                    2。单题策略内部可能已经有多次模型调用，题目级并发过高容易触发
                                    API 限流。
                                </span>
                            </div>

                            <div className="workspace-tip">
                                <Tag color="gold">任务查看</Tag>
                                <span>
                                    创建后可关闭此窗口。请前往侧边栏“批量任务”页面查看执行进度和失败情况。
                                </span>
                            </div>

                            <div
                                style={{
                                    display: "grid",
                                    gap: 8,
                                }}
                            >
                                <div className="review-toolbar-label">
                                    批量策略
                                </div>
                                <Select
                                    value={effectiveSelectedStrategyId}
                                    onChange={(value) =>
                                        setSelectedStrategyId(value)
                                    }
                                    options={reviewBatchStrategies.map(
                                        (strategy) => ({
                                            value: strategy.id,
                                            label: `${strategy.name} · ${strategy.stepCount} 步`,
                                        }),
                                    )}
                                    placeholder="请选择批量运行策略"
                                    disabled={
                                        isCreatingBatchRun ||
                                        !reviewBatchStrategies.length
                                    }
                                    size="middle"
                                />
                                {selectedStrategy?.description ? (
                                    <div className="muted">
                                        {selectedStrategy.description}
                                    </div>
                                ) : null}
                                {selectedStrategy?.datasourceIds.length ? (
                                    <div className="muted">
                                        当前策略限制了部分数据源，不匹配的题目会自动跳过。
                                    </div>
                                ) : null}
                            </div>

                            <div
                                style={{
                                    display: "grid",
                                    gap: 8,
                                }}
                            >
                                <div className="review-toolbar-label">
                                    题目级并发
                                </div>
                                <InputNumber
                                    min={1}
                                    max={2}
                                    precision={0}
                                    value={batchConcurrency}
                                    onChange={(value) =>
                                        setBatchConcurrency(value ?? 1)
                                    }
                                    disabled={isCreatingBatchRun}
                                    size="middle"
                                    style={{ width: 160 }}
                                />
                            </div>
                        </div>
                    </Modal>

                    <Modal
                        open={cleaningModalOpen}
                        rootClassName="review-dialog"
                        title="批量清洗字段"
                        okText={
                            isCreatingCleaningBatchRun
                                ? "创建中"
                                : "创建后台任务"
                        }
                        cancelText="取消"
                        onOk={createCleaningBatchRun}
                        onCancel={() => setCleaningModalOpen(false)}
                        confirmLoading={isCreatingCleaningBatchRun}
                        destroyOnHidden
                    >
                        <div
                            style={{ display: "grid", gap: 16, marginTop: 16 }}
                        >
                            <div className="workspace-tip">
                                <Tag color="blue">
                                    已选 {selectedQuestions.length} 题
                                </Tag>
                                <span>
                                    清洗策略会按配置字段逐题生成清洗结果。建议并发不要超过
                                    2，避免模型接口限流。
                                </span>
                            </div>

                            <div className="workspace-tip">
                                <Tag color="gold">结果查看</Tag>
                                <span>
                                    创建后可关闭此窗口。清洗结果会在题目详情页“数据清洗”区域和对应字段卡片中展示。
                                </span>
                            </div>

                            <div style={{ display: "grid", gap: 8 }}>
                                <div className="review-toolbar-label">
                                    清洗策略
                                </div>
                                <Select
                                    value={effectiveSelectedCleaningStrategyId}
                                    onChange={(value) =>
                                        setSelectedCleaningStrategyId(value)
                                    }
                                    options={cleaningBatchStrategies.map(
                                        (strategy) => ({
                                            value: strategy.id,
                                            label: `${strategy.name} · ${strategy.stepCount} 步`,
                                        }),
                                    )}
                                    placeholder="请选择批量清洗策略"
                                    disabled={
                                        isCreatingCleaningBatchRun ||
                                        !cleaningBatchStrategies.length
                                    }
                                    size="middle"
                                />
                                {selectedCleaningStrategy?.description ? (
                                    <div className="muted">
                                        {selectedCleaningStrategy.description}
                                    </div>
                                ) : null}
                                {selectedCleaningStrategy?.datasourceIds
                                    .length ? (
                                    <div className="muted">
                                        当前清洗策略限制了部分数据源，不匹配的题目会自动跳过。
                                    </div>
                                ) : null}
                            </div>

                            <div style={{ display: "grid", gap: 8 }}>
                                <div className="review-toolbar-label">
                                    题目级并发
                                </div>
                                <InputNumber
                                    min={1}
                                    max={2}
                                    precision={0}
                                    value={cleaningConcurrency}
                                    onChange={(value) =>
                                        setCleaningConcurrency(value ?? 1)
                                    }
                                    disabled={isCreatingCleaningBatchRun}
                                    size="middle"
                                    style={{ width: 160 }}
                                />
                            </div>
                        </div>
                    </Modal>

                    <Modal
                        open={exportModalOpen}
                        rootClassName="review-dialog"
                        onCancel={() => setExportModalOpen(false)}
                        onOk={exportSelectedQuestions}
                        okText={isExporting ? "导出中..." : "导出"}
                        cancelText="取消"
                        okButtonProps={{ loading: isExporting }}
                        title="导出勾选题目"
                        destroyOnHidden
                    >
                        <div
                            style={{ display: "grid", gap: 14, marginTop: 12 }}
                        >
                            <div className="workspace-tip">
                                <Tag color="blue">说明</Tag>
                                <span>
                                    已勾选 {selectedQuestionIds.length}{" "}
                                    题。可选择导出范围、字段与格式。
                                </span>
                            </div>

                            <div>
                                <div className="review-toolbar-label">
                                    导出范围
                                </div>
                                <Select
                                    value={exportScope}
                                    onChange={(value) =>
                                        setExportScope(value as ExportScope)
                                    }
                                    options={[
                                        {
                                            value: "selected",
                                            label: `仅导出勾选题目（${selectedQuestionIds.length} 条）`,
                                        },
                                        {
                                            value: "filteredAll",
                                            label: `导出当前筛选全部结果（约 ${totalQuestions} 条）`,
                                        },
                                    ]}
                                    size="middle"
                                    style={{ width: "100%" }}
                                />
                            </div>

                            <div>
                                <div className="review-toolbar-label">
                                    导出格式
                                </div>
                                <Select
                                    value={exportFormat}
                                    onChange={(value) =>
                                        setExportFormat(value as ExportFormat)
                                    }
                                    options={[
                                        {
                                            value: "excel",
                                            label: "Excel (.xlsx)",
                                        },
                                        {
                                            value: "json",
                                            label: "JSON (.json)",
                                        },
                                        {
                                            value: "markdown",
                                            label: "Markdown (.md)",
                                        },
                                    ]}
                                    size="middle"
                                    style={{ width: "100%" }}
                                />
                            </div>

                            <div>
                                <div className="review-toolbar-label">
                                    导出字段（可多选）
                                </div>
                                <Select
                                    mode="multiple"
                                    value={selectedExportFields}
                                    onChange={(value) =>
                                        setSelectedExportFields(
                                            value as string[],
                                        )
                                    }
                                    options={exportFieldOptions}
                                    placeholder="选择导出字段"
                                    size="middle"
                                    style={{ width: "100%" }}
                                    optionFilterProp="label"
                                />
                            </div>
                        </div>
                    </Modal>

                    <Modal
                        open={reportModalOpen}
                        rootClassName="review-dialog"
                        onCancel={() => setReportModalOpen(false)}
                        onOk={exportReport}
                        okText={isExportingReport ? "生成中..." : "导出报告"}
                        cancelText="取消"
                        okButtonProps={{ loading: isExportingReport }}
                        title="导出审核报告"
                        destroyOnHidden
                    >
                        <div
                            style={{ display: "grid", gap: 14, marginTop: 12 }}
                        >
                            <div className="workspace-tip">
                                <Tag color="blue">说明</Tag>
                                <span>
                                    报告包含两部分：总体及按学科的通过率统计，以及分学科题目详情。
                                </span>
                            </div>

                            <div>
                                <div className="review-toolbar-label">
                                    导出范围
                                </div>
                                <Select
                                    value={reportScope}
                                    onChange={(value) =>
                                        setReportScope(value as ExportScope)
                                    }
                                    options={[
                                        {
                                            value: "selected",
                                            label: `仅导出勾选题目（${selectedQuestionIds.length} 条）`,
                                        },
                                        {
                                            value: "filteredAll",
                                            label: `导出当前筛选全部结果（约 ${totalQuestions} 条）`,
                                        },
                                    ]}
                                    size="middle"
                                    style={{ width: "100%" }}
                                />
                            </div>

                            <div>
                                <div className="review-toolbar-label">
                                    学科分组字段
                                </div>
                                <Select
                                    value={reportSubjectFieldKey || undefined}
                                    onChange={(value) =>
                                        setReportSubjectFieldKey(value)
                                    }
                                    options={rawFieldOptions.map((field) => ({
                                        value: `raw:${field.key}`,
                                        label: field.label,
                                    }))}
                                    placeholder="选择用于按学科分组的原始字段"
                                    size="middle"
                                    style={{ width: "100%" }}
                                    showSearch
                                    optionFilterProp="label"
                                />
                            </div>

                            <div>
                                <div className="review-toolbar-label">
                                    详情筛选
                                </div>
                                <Checkbox
                                    checked={reportRejectedOnlyInDetails}
                                    onChange={(event) =>
                                        setReportRejectedOnlyInDetails(
                                            event.target.checked,
                                        )
                                    }
                                >
                                    仅显示驳回题目
                                </Checkbox>
                            </div>

                            <div>
                                <div className="review-toolbar-label">
                                    详情字段（可多选）
                                </div>
                                <Select
                                    mode="multiple"
                                    value={reportDetailFields}
                                    onChange={(value) =>
                                        setReportDetailFields(value as string[])
                                    }
                                    options={exportFieldOptions}
                                    placeholder="选择报告详情中展示的字段"
                                    size="middle"
                                    style={{ width: "100%" }}
                                    optionFilterProp="label"
                                />
                            </div>

                            <div>
                                <div className="review-toolbar-label">
                                    导出格式
                                </div>
                                <Select
                                    value={reportFormat}
                                    onChange={(value) =>
                                        setReportFormat(value as ReportFormat)
                                    }
                                    options={[
                                        {
                                            value: "markdown",
                                            label: "Markdown (.md)",
                                        },
                                        {
                                            value: "html",
                                            label: "HTML (.html) — 可通过浏览器打印为 PDF",
                                        },
                                        {
                                            value: "pdf",
                                            label: "PDF (.pdf)",
                                        },
                                    ]}
                                    size="middle"
                                    style={{ width: "100%" }}
                                />
                            </div>
                        </div>
                    </Modal>
                </>
            )}
        </section>
    );
}
