"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    App,
    Button,
    Checkbox,
    Empty,
    Input,
    InputNumber,
    Modal,
    Pagination,
    Select,
    Tag,
} from "antd";
import { Bot, SlidersHorizontal, X } from "lucide-react";
import { createAiReviewStrategyBatchRunAction } from "@/app/actions/ai-review-strategies";
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
    updatedAt: string;
    sourceRowNumber: number | null;
    rawRecord: Record<string, string>;
    rawFieldOrder: string[];
};

type FieldDefinition = {
    value: ReviewQuestionFilterFieldKey;
    label: string;
    kind: "system" | "raw";
    valueType: "text" | "select" | "number";
};

const questionStatusMeta = {
    DRAFT: { label: "草稿", color: "default" },
    SUBMITTED: { label: "待审核", color: "processing" },
    UNDER_REVIEW: { label: "审核中", color: "gold" },
    APPROVED: { label: "已通过", color: "success" },
    REJECTED: { label: "已驳回", color: "error" },
} satisfies Record<QuestionStatus, { label: string; color: string }>;

const cellStyle = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
} as const;

function buildRawColumns(questions: ReviewQuestionItem[]) {
    const orderedFields = questions.reduce<string[]>((fields, question) => {
        for (const field of question.rawFieldOrder) {
            if (!fields.includes(field)) {
                fields.push(field);
            }
        }

        for (const field of Object.keys(question.rawRecord)) {
            if (!fields.includes(field)) {
                fields.push(field);
            }
        }

        return fields;
    }, []);

    return orderedFields.map((field) => ({
        key: field,
        label: field,
        width: 220,
    }));
}

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

export function ReviewQuestionList({
    canReview,
    scopeLabel,
    listPath,
    projects,
    questions,
    selectedProjectId,
    currentPage,
    pageSize,
    totalQuestions,
    activeConditions,
    datasourceOptions,
    rawFieldOptions,
    reviewStrategies,
}: {
    canReview: boolean;
    scopeLabel?: string;
    listPath: string;
    projects: ProjectOption[];
    questions: ReviewQuestionItem[];
    selectedProjectId: string;
    currentPage: number;
    pageSize: number;
    totalQuestions: number;
    activeConditions: ReviewQuestionFilterCondition[];
    datasourceOptions: Array<{ value: string; label: string }>;
    rawFieldOptions: Array<{ key: string; label: string }>;
    reviewStrategies: ReviewStrategyOption[];
}) {
    const router = useRouter();
    const { notification } = App.useApp();
    const [modalOpen, setModalOpen] = useState(false);
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

    const rawColumns = useMemo(
        () =>
            questions.length
                ? buildRawColumns(questions)
                : rawFieldOptions.map((field) => ({
                      key: field.key,
                      label: field.label,
                      width: 220,
                  })),
        [questions, rawFieldOptions],
    );

    const fieldDefinitions = useMemo(() => {
        const systemFields: FieldDefinition[] = [
            {
                value: "status",
                label: "状态",
                kind: "system",
                valueType: "select",
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
    const projectReviewStrategies = useMemo(
        () =>
            reviewStrategies.filter(
                (strategy) =>
                    !strategy.projectIds.length ||
                    strategy.projectIds.includes(selectedProjectId),
            ),
        [reviewStrategies, selectedProjectId],
    );
    const effectiveSelectedStrategyId = projectReviewStrategies.some(
        (strategy) => strategy.id === selectedStrategyId,
    )
        ? selectedStrategyId
        : (projectReviewStrategies[0]?.id ?? "");
    const selectedStrategy = projectReviewStrategies.find(
        (strategy) => strategy.id === effectiveSelectedStrategyId,
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
    const gridTemplateColumns = [
        "52px",
        "160px",
        "120px",
        "180px",
        ...rawColumns.map(() => "220px"),
    ].join(" ");
    const tableWidth = 52 + 160 + 120 + 180 + rawColumns.length * 220;

    useEffect(() => {
        setSelectedQuestionIds((current) =>
            current.filter((questionId) =>
                visibleQuestionIds.includes(questionId),
            ),
        );
    }, [visibleQuestionIds]);

    useEffect(() => {
        setSelectedStrategyId((current) =>
            projectReviewStrategies.some((strategy) => strategy.id === current)
                ? current
                : (projectReviewStrategies[0]?.id ?? ""),
        );
    }, [projectReviewStrategies]);

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

    function toggleQuestionSelection(questionId: string, checked: boolean) {
        setSelectedQuestionIds((current) => {
            if (checked) {
                return current.includes(questionId)
                    ? current
                    : [...current, questionId];
            }

            return current.filter((item) => item !== questionId);
        });
    }

    async function createBatchRun() {
        if (!selectedQuestions.length) {
            notification.warning({
                message: "请先勾选题目",
                description: "至少选择 1 道题目后才能批量运行 AI 审核策略。",
                placement: "topRight",
            });
            return;
        }

        if (!effectiveSelectedStrategyId || !selectedStrategy) {
            notification.warning({
                message: "请选择策略",
                description: "当前项目没有可批量执行的 AI 审核策略。",
                placement: "topRight",
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
            });

            if (result.error) {
                notification.error({
                    message: "创建批量任务失败",
                    description: result.error,
                    placement: "topRight",
                });
                return;
            }

            notification.success({
                message: "批量任务已创建",
                description:
                    result.success ??
                    "后台 worker 会继续执行当前批量审核任务。",
                placement: "topRight",
                duration: 5,
            });

            setSelectedQuestionIds([]);
            setBatchModalOpen(false);
        } finally {
            setIsCreatingBatchRun(false);
        }
    }

    return (
        <section className="content-surface">
            <div className="section-head" style={{ marginBottom: 16 }}>
                <div>
                    <h3
                        style={{
                            margin: 0,
                            fontSize: 22,
                            lineHeight: 1.1,
                        }}
                    >
                        题目列表
                    </h3>
                    <p
                        className="muted"
                        style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                    >
                        {scopeLabel ?? "当前项目"}内展示原始 JSON / Excel
                        导入字段。先选择项目，再按条件叠加筛选记录，点击列表行可进入题目详情页。
                    </p>
                </div>
                <Tag color="blue">
                    {questions.length} / {totalQuestions}
                </Tag>
            </div>

            {!canReview ? (
                <Empty description="你当前没有 REVIEWER 项目角色，暂时无法进入审核任务。" />
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
                                size="large"
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
                            <Button
                                type="primary"
                                icon={<Bot size={16} />}
                                disabled={
                                    !selectedQuestionIds.length ||
                                    !projectReviewStrategies.length
                                }
                                onClick={() => setBatchModalOpen(true)}
                            >
                                批量运行 AI 审核
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
                                        : condition.fieldKey === "datasourceId"
                                          ? (datasourceLabel ?? condition.value)
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

                    {!rawColumns.length ? (
                        <Empty
                            description="当前项目下还没有原始字段可展示"
                            style={{ marginTop: 24 }}
                        />
                    ) : !questions.length ? (
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
                            <div
                                className="review-list-scroll"
                                style={{
                                    overflowX: "auto",
                                    overflowY: "hidden",
                                    marginTop: 20,
                                }}
                            >
                                <div
                                    className="table-surface"
                                    style={{
                                        minWidth: tableWidth,
                                        width: "max-content",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns:
                                                gridTemplateColumns,
                                            gap: 16,
                                            padding: "14px 16px",
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
                                        <div style={cellStyle}>外部记录 ID</div>
                                        <div style={cellStyle}>状态</div>
                                        <div style={cellStyle}>更新时间</div>
                                        {rawColumns.map((column) => (
                                            <div
                                                key={column.key}
                                                style={cellStyle}
                                                title={column.label}
                                            >
                                                {column.label}
                                            </div>
                                        ))}
                                    </div>

                                    {questions.map((question) => (
                                        <div
                                            key={question.id}
                                            role="button"
                                            tabIndex={0}
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns:
                                                    gridTemplateColumns,
                                                gap: 16,
                                                padding: "16px",
                                                borderTop:
                                                    "1px solid rgba(217, 224, 234, 0.85)",
                                                alignItems: "center",
                                                background:
                                                    selectedQuestionIdSet.has(
                                                        question.id,
                                                    )
                                                        ? "rgba(230, 244, 255, 0.96)"
                                                        : "rgba(255, 255, 255, 0.82)",
                                                cursor: "pointer",
                                            }}
                                            onClick={() =>
                                                router.push(
                                                    buildQuestionDetailPath(
                                                        question.id,
                                                    ),
                                                )
                                            }
                                            onKeyDown={(event) => {
                                                if (
                                                    event.key === "Enter" ||
                                                    event.key === " "
                                                ) {
                                                    event.preventDefault();
                                                    router.push(
                                                        buildQuestionDetailPath(
                                                            question.id,
                                                        ),
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
                                                    checked={selectedQuestionIdSet.has(
                                                        question.id,
                                                    )}
                                                    onChange={(event) =>
                                                        toggleQuestionSelection(
                                                            question.id,
                                                            event.target
                                                                .checked,
                                                        )
                                                    }
                                                />
                                            </div>
                                            <div
                                                className="muted"
                                                style={cellStyle}
                                                title={
                                                    question.externalRecordId
                                                }
                                            >
                                                {question.externalRecordId}
                                            </div>
                                            <div>
                                                <Tag
                                                    color={
                                                        questionStatusMeta[
                                                            question.status
                                                        ].color
                                                    }
                                                >
                                                    {
                                                        questionStatusMeta[
                                                            question.status
                                                        ].label
                                                    }
                                                </Tag>
                                            </div>
                                            <div className="muted">
                                                {new Date(
                                                    question.updatedAt,
                                                ).toLocaleString("zh-CN")}
                                            </div>
                                            {rawColumns.map((column) => {
                                                const value =
                                                    question.rawRecord[
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
                                    ))}
                                </div>
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
                                                        label:
                                                            definition.kind ===
                                                            "raw"
                                                                ? `原始字段 · ${definition.label}`
                                                                : definition.label,
                                                    }),
                                                )}
                                                size="large"
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
                                                size="large"
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
                                                            : availableDatasourceOptions
                                                    }
                                                    size="large"
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
                                                    size="large"
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
                                                disabled={
                                                    draftConditions.length === 1
                                                }
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
                        </div>
                    </Modal>

                    <Modal
                        open={batchModalOpen}
                        title="批量运行 AI 审核"
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
                                    options={projectReviewStrategies.map(
                                        (strategy) => ({
                                            value: strategy.id,
                                            label: `${strategy.name} · ${strategy.stepCount} 步`,
                                        }),
                                    )}
                                    placeholder="请选择批量运行策略"
                                    disabled={
                                        isCreatingBatchRun ||
                                        !projectReviewStrategies.length
                                    }
                                    size="large"
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
                                    size="large"
                                    style={{ width: 160 }}
                                />
                            </div>
                        </div>
                    </Modal>
                </>
            )}
        </section>
    );
}
