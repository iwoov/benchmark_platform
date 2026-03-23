"use client";

import { useMemo, useState } from "react";
import { Button, Empty, Input, Modal, Select, Space, Tag } from "antd";
import { Plus, SlidersHorizontal, X } from "lucide-react";

type QuestionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED";

type ProjectOption = {
  id: string;
  name: string;
  code: string;
};

type ReviewQuestionItem = {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  datasourceId: string;
  datasourceName: string;
  status: QuestionStatus;
  updatedAt: string;
  sourceRowNumber: number | null;
  rawRecord: Record<string, string>;
  rawFieldOrder: string[];
};

type SystemFieldKey = "status" | "datasourceId" | "sourceRowNumber";
type RawFieldKey = `raw:${string}`;
type FilterFieldKey = SystemFieldKey | RawFieldKey;

type FilterOperator =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "isEmpty"
  | "isNotEmpty"
  | "gt"
  | "lt";

type FilterCondition = {
  id: string;
  fieldKey: FilterFieldKey;
  operator: FilterOperator;
  value: string;
};

type FieldDefinition = {
  value: FilterFieldKey;
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

function conditionNeedsValue(operator: FilterOperator) {
  return operator !== "isEmpty" && operator !== "isNotEmpty";
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function createCondition(seed = 0): FilterCondition {
  return {
    id: `condition-${Date.now()}-${seed}`,
    fieldKey: "status",
    operator: "equals",
    value: "SUBMITTED",
  };
}

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
    ] satisfies Array<{ value: FilterOperator; label: string }>;
  }

  if (valueType === "number") {
    return [
      { value: "equals", label: "等于" },
      { value: "gt", label: "大于" },
      { value: "lt", label: "小于" },
    ] satisfies Array<{ value: FilterOperator; label: string }>;
  }

  return [
    { value: "contains", label: "包含" },
    { value: "notContains", label: "不包含" },
    { value: "equals", label: "等于" },
    { value: "isEmpty", label: "为空" },
    { value: "isNotEmpty", label: "不为空" },
  ] satisfies Array<{ value: FilterOperator; label: string }>;
}

function getFieldValue(question: ReviewQuestionItem, fieldKey: FilterFieldKey) {
  if (fieldKey === "status") {
    return question.status;
  }

  if (fieldKey === "datasourceId") {
    return question.datasourceId;
  }

  if (fieldKey === "sourceRowNumber") {
    return question.sourceRowNumber;
  }

  return question.rawRecord[fieldKey.slice(4)] ?? "";
}

function matchesCondition(
  question: ReviewQuestionItem,
  condition: FilterCondition,
  fieldDefinition: FieldDefinition | undefined,
) {
  if (!fieldDefinition) {
    return true;
  }

  const fieldValue = getFieldValue(question, condition.fieldKey);

  if (fieldDefinition.valueType === "select") {
    if (condition.operator === "equals") {
      return fieldValue === condition.value;
    }

    return fieldValue !== condition.value;
  }

  if (fieldDefinition.valueType === "number") {
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

    return fieldValue < targetValue;
  }

  const normalizedFieldValue = normalizeText(String(fieldValue));
  const normalizedCompareValue = normalizeText(condition.value);

  if (condition.operator === "isEmpty") {
    return !normalizedFieldValue;
  }

  if (condition.operator === "isNotEmpty") {
    return Boolean(normalizedFieldValue);
  }

  if (condition.operator === "equals") {
    return normalizedFieldValue === normalizedCompareValue;
  }

  if (condition.operator === "notContains") {
    return !normalizedFieldValue.includes(normalizedCompareValue);
  }

  return normalizedFieldValue.includes(normalizedCompareValue);
}

function sanitizeConditions(conditions: FilterCondition[]) {
  return conditions.filter((condition) =>
    conditionNeedsValue(condition.operator)
      ? Boolean(condition.value.trim())
      : true,
  );
}

export function ReviewQuestionList({
  canReview,
  projects,
  questions,
}: {
  canReview: boolean;
  projects: ProjectOption[];
  questions: ReviewQuestionItem[];
}) {
  const [selectedProjectId, setSelectedProjectId] = useState(
    projects[0]?.id ?? "",
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [conditions, setConditions] = useState<FilterCondition[]>([]);
  const [draftConditions, setDraftConditions] = useState<FilterCondition[]>([]);

  const projectQuestions = useMemo(
    () =>
      questions.filter((question) => question.projectId === selectedProjectId),
    [questions, selectedProjectId],
  );

  const rawColumns = useMemo(
    () => buildRawColumns(projectQuestions),
    [projectQuestions],
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
    const rawFields = rawColumns.map((column) => ({
      value: `raw:${column.key}` as const,
      label: column.label,
      kind: "raw" as const,
      valueType: "text" as const,
    }));

    return [...systemFields, ...rawFields];
  }, [rawColumns]);

  const fieldDefinitionMap = useMemo(
    () =>
      Object.fromEntries(
        fieldDefinitions.map((definition) => [definition.value, definition]),
      ) as Record<FilterFieldKey, FieldDefinition>,
    [fieldDefinitions],
  );

  const datasourceOptions = useMemo(
    () =>
      Array.from(
        projectQuestions.reduce((items, question) => {
          items.set(question.datasourceId, {
            value: question.datasourceId,
            label: question.datasourceName,
          });
          return items;
        }, new Map<string, { value: string; label: string }>()),
      ).map(([, value]) => value),
    [projectQuestions],
  );

  const visibleQuestions = useMemo(() => {
    const activeConditions = sanitizeConditions(conditions);

    return projectQuestions.filter((question) =>
      activeConditions.every((condition) =>
        matchesCondition(
          question,
          condition,
          fieldDefinitionMap[condition.fieldKey],
        ),
      ),
    );
  }, [conditions, fieldDefinitionMap, projectQuestions]);

  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId,
  );
  const gridTemplateColumns = rawColumns.map(() => "220px").join(" ");
  const tableWidth = rawColumns.length * 220;

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
          <p className="muted" style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
            展示原始 JSON / Excel 导入字段。先选择项目，再按条件叠加筛选记录。
          </p>
        </div>
        <Tag color="blue">
          {visibleQuestions.length} / {projectQuestions.length}
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
                  setSelectedProjectId(value);
                  setConditions([]);
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
              <Button
                icon={<SlidersHorizontal size={16} />}
                onClick={() => {
                  setDraftConditions(
                    conditions.length ? conditions : [createCondition(1)],
                  );
                  setModalOpen(true);
                }}
              >
                筛选条件
              </Button>
              {conditions.length ? (
                <Button onClick={() => setConditions([])}>清空筛选</Button>
              ) : null}
            </div>
          </div>

          {conditions.length ? (
            <div className="review-filter-tags">
              {conditions.map((condition) => {
                const fieldDefinition = fieldDefinitionMap[condition.fieldKey];
                const datasourceLabel = datasourceOptions.find(
                  (option) => option.value === condition.value,
                )?.label;
                const operatorLabel =
                  getOperatorOptions(fieldDefinition.valueType).find(
                    (option) => option.value === condition.operator,
                  )?.label ?? condition.operator;
                const valueLabel =
                  condition.fieldKey === "status"
                    ? (questionStatusMeta[condition.value as QuestionStatus]
                        ?.label ?? condition.value)
                    : condition.fieldKey === "datasourceId"
                      ? (datasourceLabel ?? condition.value)
                      : condition.value || "—";

                return (
                  <Tag key={condition.id} color="blue">
                    {fieldDefinition.label} {operatorLabel}
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
          ) : !visibleQuestions.length ? (
            <Empty
              description={
                projectQuestions.length
                  ? "当前筛选条件下没有记录"
                  : "当前项目下还没有题目"
              }
              style={{ marginTop: 24 }}
            />
          ) : (
            <div
              className="review-list-scroll"
              style={{ overflowX: "auto", overflowY: "hidden", marginTop: 20 }}
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
                    gridTemplateColumns: gridTemplateColumns,
                    gap: 16,
                    padding: "14px 16px",
                    background: "rgba(248, 250, 252, 0.9)",
                    fontWeight: 700,
                    alignItems: "center",
                  }}
                >
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

                {visibleQuestions.map((question) => (
                  <div
                    key={question.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: gridTemplateColumns,
                      gap: 16,
                      padding: "16px",
                      borderTop: "1px solid rgba(217, 224, 234, 0.85)",
                      alignItems: "center",
                      background: "rgba(255, 255, 255, 0.82)",
                    }}
                  >
                    {rawColumns.map((column) => {
                      const value = question.rawRecord[column.key] || "—";

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
          )}

          <Modal
            open={modalOpen}
            onCancel={() => setModalOpen(false)}
            onOk={() => {
              setConditions(sanitizeConditions(draftConditions));
              setModalOpen(false);
            }}
            okText="应用筛选"
            cancelText="取消"
            width={760}
            title="筛选条件"
            destroyOnHidden
          >
            <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
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
                    value: FilterOperator;
                    label: string;
                  }> = getOperatorOptions(fieldDefinition?.valueType ?? "text");
                  const availableDatasourceOptions = datasourceOptions.length
                    ? datasourceOptions
                    : [{ value: "", label: "当前项目暂无数据源" }];

                  return (
                    <div key={condition.id} className="review-filter-row">
                      <Select
                        value={condition.fieldKey}
                        options={fieldDefinitions.map((definition) => ({
                          value: definition.value,
                          label:
                            definition.kind === "raw"
                              ? `原始字段 · ${definition.label}`
                              : definition.label,
                        }))}
                        size="large"
                        onChange={(value) => {
                          const nextFieldDefinition = fieldDefinitionMap[value];
                          const nextOperator =
                            getOperatorOptions(nextFieldDefinition.valueType)[0]
                              ?.value ?? "equals";

                          setDraftConditions((prev) =>
                            prev.map((item) =>
                              item.id === condition.id
                                ? {
                                    ...item,
                                    fieldKey: value,
                                    operator: nextOperator,
                                    value:
                                      value === "status"
                                        ? "SUBMITTED"
                                        : value === "datasourceId"
                                          ? (availableDatasourceOptions[0]
                                              ?.value ?? "")
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
                              item.id === condition.id
                                ? { ...item, operator: value }
                                : item,
                            ),
                          );
                        }}
                      />
                      {fieldDefinition?.valueType === "select" ? (
                        <Select
                          value={condition.value}
                          options={
                            condition.fieldKey === "status"
                              ? Object.entries(questionStatusMeta).map(
                                  ([value, meta]) => ({
                                    value,
                                    label: meta.label,
                                  }),
                                )
                              : availableDatasourceOptions
                          }
                          size="large"
                          onChange={(value) => {
                            setDraftConditions((prev) =>
                              prev.map((item) =>
                                item.id === condition.id
                                  ? { ...item, value }
                                  : item,
                              ),
                            );
                          }}
                          disabled={!conditionNeedsValue(condition.operator)}
                        />
                      ) : (
                        <Input
                          value={condition.value}
                          size="large"
                          placeholder={
                            fieldDefinition?.valueType === "number"
                              ? "请输入数字"
                              : "请输入筛选内容"
                          }
                          onChange={(event) => {
                            setDraftConditions((prev) =>
                              prev.map((item) =>
                                item.id === condition.id
                                  ? { ...item, value: event.target.value }
                                  : item,
                              ),
                            );
                          }}
                          disabled={!conditionNeedsValue(condition.operator)}
                        />
                      )}
                      <Button
                        icon={<X size={14} />}
                        onClick={() => {
                          setDraftConditions((prev) =>
                            prev.filter((item) => item.id !== condition.id),
                          );
                        }}
                        disabled={draftConditions.length === 1}
                      >
                        删除
                      </Button>
                      <div className="review-filter-index">{index + 1}</div>
                    </div>
                  );
                })}
              </div>

              <Space>
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => {
                    setDraftConditions((prev) => [
                      ...prev,
                      createCondition(prev.length + 1),
                    ]);
                  }}
                >
                  添加条件
                </Button>
                <Button
                  onClick={() => setDraftConditions([createCondition(1)])}
                >
                  重置草稿
                </Button>
              </Space>
            </div>
          </Modal>
        </>
      )}
    </section>
  );
}
