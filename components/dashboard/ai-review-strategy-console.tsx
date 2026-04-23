"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
    App,
    Button,
    Empty,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Select,
    Space,
    Switch,
    Tag,
} from "antd";
import {
    ArrowDown,
    ArrowUp,
    Bot,
    Braces,
    MessageSquare,
    PencilLine,
    Plus,
    Save,
    Trash2,
} from "lucide-react";
import {
    deleteAiReviewStrategyAction,
    saveAiReviewStrategyAction,
} from "@/app/actions/ai-review-strategies";
import {
    saveAiChatConfigAction,
    deleteAiChatConfigAction,
} from "@/app/actions/ai-chat-config";
import type { AiChatConfigView } from "@/lib/ai/chat-config";
import {
    aiReviewAggregateLabels,
    aiReviewComparisonOperators,
    aiReviewDefaultPrompts,
    aiReviewOutcomeLabelMap,
    aiReviewRuleLabels,
    aiReviewToolLabels,
    createDefaultAiToolStep,
    createDefaultRuleStep,
    getMetricOptionsForStepType,
    type AiReviewAiToolStep,
    type AiReviewAiToolType,
    type AiReviewRuleStep,
    type AiReviewRuleType,
    type AiReviewStrategyDefinition,
    type AiReviewStrategyStep,
} from "@/lib/ai/review-strategy-schema";

type StrategyFormState = {
    strategyId?: string;
    name: string;
    code: string;
    description: string;
    enabled: boolean;
    projectIds: string[];
    datasourceIds: string[];
    definition: AiReviewStrategyDefinition;
};

function createDefaultStrategyForm(): StrategyFormState {
    return {
        name: "",
        code: "",
        description: "",
        enabled: true,
        projectIds: [],
        datasourceIds: [],
        definition: {
            version: 1,
            steps: [createDefaultAiToolStep("TEXT_QUALITY_CHECK")],
        },
    };
}

function createStrategyFormState(strategy?: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    enabled: boolean;
    projectIds: string[];
    datasourceIds: string[];
    definition: AiReviewStrategyDefinition;
}): StrategyFormState {
    if (!strategy) {
        return createDefaultStrategyForm();
    }

    return {
        strategyId: strategy.id,
        name: strategy.name,
        code: strategy.code,
        description: strategy.description ?? "",
        enabled: strategy.enabled,
        projectIds: strategy.projectIds,
        datasourceIds: strategy.datasourceIds,
        definition: strategy.definition,
    };
}

function buildSourceStepOptions(
    steps: AiReviewStrategyStep[],
    currentStepId: string,
) {
    return steps
        .filter((step) => step.id !== currentStepId)
        .map((step) => ({
            value: step.id,
            label: `${step.name} · ${
                step.kind === "AI_TOOL"
                    ? aiReviewToolLabels[step.toolType]
                    : aiReviewRuleLabels[step.ruleType]
            }`,
            kind: step.kind,
            toolType: step.kind === "AI_TOOL" ? step.toolType : null,
        }));
}

function sourceStepToolType(
    steps: AiReviewStrategyStep[],
    sourceStepId: string | undefined,
) {
    if (!sourceStepId) {
        return null;
    }

    const step = steps.find((item) => item.id === sourceStepId);
    return step?.kind === "AI_TOOL" ? step.toolType : null;
}

function getDatasourceFieldSet(
    datasources: Array<{
        id: string;
        rawFieldOrder: string[];
    }>,
    datasourceIds: string[],
) {
    return new Set(
        datasources
            .filter((datasource) => datasourceIds.includes(datasource.id))
            .flatMap((datasource) => datasource.rawFieldOrder),
    );
}

function summarizeScope(count: number, total: number, emptyLabel: string) {
    if (!count) {
        return emptyLabel;
    }

    return `${count} / ${total}`;
}

function getStepTypeLabel(step: AiReviewStrategyStep) {
    return step.kind === "AI_TOOL"
        ? aiReviewToolLabels[step.toolType]
        : aiReviewRuleLabels[step.ruleType];
}

const systemFieldOptions = [
    { value: "title", label: "系统字段 / title" },
    { value: "content", label: "系统字段 / content" },
    { value: "answer", label: "系统字段 / answer" },
    { value: "analysis", label: "系统字段 / analysis" },
    { value: "questionType", label: "系统字段 / questionType" },
    { value: "difficulty", label: "系统字段 / difficulty" },
    { value: "rawRecord", label: "系统字段 / rawRecord" },
];

type ChatConfigFormState = {
    configId?: string;
    name: string;
    modelCode: string;
    modelCodes: string[];
    systemPrompt: string;
    presetFields: string[];
    enabled: boolean;
};

function createDefaultChatConfigForm(): ChatConfigFormState {
    return {
        name: "",
        modelCode: "",
        modelCodes: [],
        systemPrompt: "",
        presetFields: [],
        enabled: true,
    };
}

export function AiReviewStrategyConsole({
    databaseEnabled,
    modelOptions,
    projects,
    datasources,
    strategies,
    chatConfigs,
}: {
    databaseEnabled: boolean;
    modelOptions: Array<{
        code: string;
        label: string;
        protocol: string;
    }>;
    projects: Array<{
        id: string;
        name: string;
        code: string;
    }>;
    datasources: Array<{
        id: string;
        name: string;
        projectId: string;
        projectName: string;
        projectCode: string;
        rawFieldOrder: string[];
    }>;
    strategies: Array<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        enabled: boolean;
        projectIds: string[];
        datasourceIds: string[];
        definition: AiReviewStrategyDefinition;
        createdByName: string;
        updatedAt: string;
    }>;
    chatConfigs: AiChatConfigView[];
}) {
    const router = useRouter();
    const { notification } = App.useApp();
    const [form, setForm] = useState<StrategyFormState>(
        createDefaultStrategyForm(),
    );
    const [modalOpen, setModalOpen] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [isSaving, startSaving] = useTransition();
    const [isDeleting, startDeleting] = useTransition();

    // --- Chat config state ---
    const [chatForm, setChatForm] = useState<ChatConfigFormState>(
        createDefaultChatConfigForm(),
    );
    const [chatModalOpen, setChatModalOpen] = useState(false);
    const [isSavingChat, startSavingChat] = useTransition();
    const [isDeletingChat, startDeletingChat] = useTransition();
    const [deletingChatId, setDeletingChatId] = useState<string | null>(null);

    const projectOptions = useMemo(
        () =>
            projects.map((project) => ({
                value: project.id,
                label: `${project.name} (${project.code})`,
            })),
        [projects],
    );

    const scopedDatasources = useMemo(
        () =>
            form.projectIds.length
                ? datasources.filter((datasource) =>
                      form.projectIds.includes(datasource.projectId),
                  )
                : datasources,
        [datasources, form.projectIds],
    );

    const datasourceOptions = useMemo(
        () =>
            scopedDatasources.map((datasource) => ({
                value: datasource.id,
                label: `${datasource.projectCode} / ${datasource.name}`,
            })),
        [scopedDatasources],
    );

    const modelSelectOptions = useMemo(
        () =>
            modelOptions.map((model) => ({
                value: model.code,
                label: `${model.label} · ${model.protocol}`,
            })),
        [modelOptions],
    );

    const rawFieldOptions = useMemo(() => {
        const activeDatasources = form.datasourceIds.length
            ? datasources.filter((datasource) =>
                  form.datasourceIds.includes(datasource.id),
              )
            : [];
        const fieldOrder = [
            ...new Set(
                activeDatasources.flatMap(
                    (datasource) => datasource.rawFieldOrder,
                ),
            ),
        ];

        return [
            ...systemFieldOptions,
            ...fieldOrder.map((field) => ({
                value: field,
                label: field,
            })),
        ];
    }, [datasources, form.datasourceIds]);

    const totalProjectCount = projects.length;
    const totalDatasourceCount = datasources.length;

    function notifyResult(result: { error?: string; success?: string }) {
        if (result.error) {
            notification.error({
                message: "操作失败",
                description: result.error,
                placement: "topRight",
            });
            return false;
        }

        if (result.success) {
            notification.success({
                message: "操作成功",
                description: result.success,
                placement: "topRight",
            });
        }

        router.refresh();
        return true;
    }

    function openCreateModal() {
        setForm(createDefaultStrategyForm());
        setModalOpen(true);
    }

    function openEditModal(strategy: (typeof strategies)[number]) {
        setForm(createStrategyFormState(strategy));
        setModalOpen(true);
    }

    function closeModal() {
        setModalOpen(false);
        setForm(createDefaultStrategyForm());
    }

    function updateStep(
        stepId: string,
        updater: (step: AiReviewStrategyStep) => AiReviewStrategyStep,
    ) {
        setForm((current) => ({
            ...current,
            definition: {
                ...current.definition,
                steps: current.definition.steps.map((step) =>
                    step.id === stepId ? updater(step) : step,
                ),
            },
        }));
    }

    function moveStep(index: number, direction: -1 | 1) {
        setForm((current) => {
            const nextIndex = index + direction;

            if (nextIndex < 0 || nextIndex >= current.definition.steps.length) {
                return current;
            }

            const nextSteps = [...current.definition.steps];
            const [item] = nextSteps.splice(index, 1);
            nextSteps.splice(nextIndex, 0, item);

            return {
                ...current,
                definition: {
                    ...current.definition,
                    steps: nextSteps,
                },
            };
        });
    }

    function removeStep(stepId: string) {
        setForm((current) => ({
            ...current,
            definition: {
                ...current.definition,
                steps: current.definition.steps.filter(
                    (step) => step.id !== stepId,
                ),
            },
        }));
    }

    function addAiToolStep(type: AiReviewAiToolType) {
        setForm((current) => ({
            ...current,
            definition: {
                ...current.definition,
                steps: [
                    ...current.definition.steps,
                    createDefaultAiToolStep(type),
                ],
            },
        }));
    }

    function addRuleStep(type: AiReviewRuleType) {
        setForm((current) => ({
            ...current,
            definition: {
                ...current.definition,
                steps: [
                    ...current.definition.steps,
                    createDefaultRuleStep(type),
                ],
            },
        }));
    }

    function handleAiToolTypeChange(
        step: AiReviewAiToolStep,
        nextType: AiReviewAiToolType,
    ) {
        const defaultStep = createDefaultAiToolStep(nextType);
        updateStep(step.id, () => ({
            ...defaultStep,
            id: step.id,
            modelCode: step.modelCode,
            sourceStepId: step.sourceStepId,
        }));
    }

    function handleRuleTypeChange(
        step: AiReviewRuleStep,
        nextType: AiReviewRuleType,
    ) {
        const defaultStep = createDefaultRuleStep(nextType);
        updateStep(step.id, () => ({
            ...defaultStep,
            id: step.id,
            sourceStepId: step.sourceStepId,
            metric: step.metric,
        }));
    }

    function updateRuleAggregate(step: AiReviewRuleStep, value: string) {
        if (step.ruleType === "COUNT_THRESHOLD") {
            updateStep(step.id, (currentStep) => ({
                ...(currentStep as Extract<
                    AiReviewRuleStep,
                    { ruleType: "COUNT_THRESHOLD" }
                >),
                aggregate: value as "COUNT_TRUE" | "COUNT_FALSE",
            }));
            return;
        }

        updateStep(step.id, (currentStep) => ({
            ...(currentStep as Extract<
                AiReviewRuleStep,
                { ruleType: "RATIO_THRESHOLD" }
            >),
            aggregate: value as "TRUE_RATIO" | "FALSE_RATIO",
        }));
    }

    function handleSave(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setSavingId(form.strategyId ?? "new");
        startSaving(async () => {
            const result = await saveAiReviewStrategyAction({
                strategyId: form.strategyId,
                payload: {
                    name: form.name,
                    code: form.code,
                    description: form.description,
                    enabled: form.enabled,
                    projectIds: form.projectIds,
                    datasourceIds: form.datasourceIds,
                    definition: form.definition,
                },
            });

            const success = notifyResult(result);
            setSavingId(null);

            if (success) {
                closeModal();
            }
        });
    }

    function handleDelete(strategyId: string) {
        setDeletingId(strategyId);
        startDeleting(async () => {
            const result = await deleteAiReviewStrategyAction({
                strategyId,
            });
            notifyResult(result);
            setDeletingId(null);
        });
    }

    // --- Chat config handlers ---
    const allFieldOptions = useMemo(() => {
        const allFields = new Set(
            datasources.flatMap((ds) => ds.rawFieldOrder),
        );
        return [
            ...systemFieldOptions,
            ...[...allFields].map((field) => ({
                value: field,
                label: field,
            })),
        ];
    }, [datasources]);

    function openCreateChatModal() {
        setChatForm(createDefaultChatConfigForm());
        setChatModalOpen(true);
    }

    function openEditChatModal(config: AiChatConfigView) {
        setChatForm({
            configId: config.id,
            name: config.name,
            modelCode: config.modelCodes[0] ?? config.modelCode,
            modelCodes: config.modelCodes,
            systemPrompt: config.systemPrompt ?? "",
            presetFields: config.presetFields,
            enabled: config.enabled,
        });
        setChatModalOpen(true);
    }

    function closeChatModal() {
        setChatModalOpen(false);
        setChatForm(createDefaultChatConfigForm());
    }

    function handleSaveChat(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        startSavingChat(async () => {
            const codes = chatForm.modelCodes.length
                ? chatForm.modelCodes
                : [chatForm.modelCode];
            const result = await saveAiChatConfigAction({
                id: chatForm.configId,
                name: chatForm.name,
                modelCode: codes[0],
                modelCodes: codes,
                systemPrompt: chatForm.systemPrompt || undefined,
                presetFields: chatForm.presetFields,
                enabled: chatForm.enabled,
            });
            const success = notifyResult(result);
            if (success) {
                closeChatModal();
            }
        });
    }

    function handleDeleteChat(configId: string) {
        setDeletingChatId(configId);
        startDeletingChat(async () => {
            const result = await deleteAiChatConfigAction({ id: configId });
            notifyResult(result);
            setDeletingChatId(null);
        });
    }

    return (
        <div className="ai-review-strategy-page">
            <section className="content-surface">
                <div className="section-head ai-review-strategy-head">
                    <div>
                        <h2
                            style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}
                        >
                            审核策略
                        </h2>
                        <p
                            className="muted"
                            style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                        >
                            这里维护题目审核场景的 AI
                            工具和规则步骤。管理员创建策略，审核员在题目详情页选择并执行。
                        </p>
                    </div>
                    <Button
                        type="primary"
                        icon={<Plus size={16} />}
                        onClick={openCreateModal}
                    >
                        新建策略
                    </Button>
                </div>

                {!databaseEnabled ? (
                    <Empty description="当前未配置数据库，无法保存审核策略。" />
                ) : !strategies.length ? (
                    <Empty description="当前还没有审核策略，请先创建一条策略。" />
                ) : (
                    <div className="strategy-card-grid">
                        {strategies.map((strategy) => (
                            <div key={strategy.id} className="strategy-card">
                                <div className="strategy-card-head">
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div className="strategy-title-row">
                                            <h3
                                                style={{
                                                    margin: 0,
                                                    fontSize: 18,
                                                }}
                                            >
                                                {strategy.name}
                                            </h3>
                                            <Tag>{strategy.code}</Tag>
                                            <Tag
                                                color={
                                                    strategy.enabled
                                                        ? "success"
                                                        : "default"
                                                }
                                            >
                                                {strategy.enabled
                                                    ? "启用中"
                                                    : "已停用"}
                                            </Tag>
                                        </div>
                                        {strategy.description ? (
                                            <p
                                                className="muted"
                                                style={{
                                                    margin: "8px 0 0",
                                                    lineHeight: 1.7,
                                                    display: "-webkit-box",
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient:
                                                        "vertical",
                                                    overflow: "hidden",
                                                }}
                                            >
                                                {strategy.description}
                                            </p>
                                        ) : null}
                                    </div>
                                    <Space size={8} wrap>
                                        <Button
                                            icon={<PencilLine size={16} />}
                                            onClick={() =>
                                                openEditModal(strategy)
                                            }
                                        >
                                            编辑
                                        </Button>
                                        <Popconfirm
                                            title="删除审核策略"
                                            description="删除后历史执行记录会一并失效，确认继续吗？"
                                            okText="删除"
                                            cancelText="取消"
                                            onConfirm={() =>
                                                handleDelete(strategy.id)
                                            }
                                        >
                                            <Button
                                                danger
                                                icon={<Trash2 size={16} />}
                                                loading={
                                                    isDeleting &&
                                                    deletingId === strategy.id
                                                }
                                            >
                                                删除
                                            </Button>
                                        </Popconfirm>
                                    </Space>
                                </div>

                                <div className="strategy-meta-row">
                                    <Tag bordered={false}>
                                        {strategy.definition.steps.length}{" "}
                                        个步骤
                                    </Tag>
                                    <Tag bordered={false}>
                                        AI 步骤：
                                        {
                                            strategy.definition.steps.filter(
                                                (step) =>
                                                    step.kind === "AI_TOOL",
                                            ).length
                                        }
                                    </Tag>
                                    <Tag bordered={false}>
                                        规则步骤：
                                        {
                                            strategy.definition.steps.filter(
                                                (step) => step.kind === "RULE",
                                            ).length
                                        }
                                    </Tag>
                                    <Tag bordered={false}>
                                        维护人：{strategy.createdByName}
                                    </Tag>
                                    <Tag bordered={false}>
                                        更新于{" "}
                                        {new Date(
                                            strategy.updatedAt,
                                        ).toLocaleString("zh-CN")}
                                    </Tag>
                                </div>

                                <div className="strategy-overview-grid">
                                    <div className="strategy-overview-card">
                                        <div className="strategy-overview-label">
                                            适用项目
                                        </div>
                                        <div className="strategy-overview-value">
                                            {summarizeScope(
                                                strategy.projectIds.length,
                                                totalProjectCount,
                                                "全部项目",
                                            )}
                                        </div>
                                    </div>
                                    <div className="strategy-overview-card">
                                        <div className="strategy-overview-label">
                                            适用数据源
                                        </div>
                                        <div className="strategy-overview-value">
                                            {summarizeScope(
                                                strategy.datasourceIds.length,
                                                totalDatasourceCount,
                                                "全部数据源",
                                            )}
                                        </div>
                                    </div>
                                    <div className="strategy-overview-card">
                                        <div className="strategy-overview-label">
                                            首步执行
                                        </div>
                                        <div className="strategy-overview-value">
                                            {strategy.definition.steps[0]
                                                ? getStepTypeLabel(
                                                      strategy.definition
                                                          .steps[0],
                                                  )
                                                : "未配置"}
                                        </div>
                                    </div>
                                    <div className="strategy-overview-card">
                                        <div className="strategy-overview-label">
                                            末步输出
                                        </div>
                                        <div className="strategy-overview-value">
                                            {strategy.definition.steps.at(-1)
                                                ? getStepTypeLabel(
                                                      strategy.definition.steps.at(
                                                          -1,
                                                      )!,
                                                  )
                                                : "未配置"}
                                        </div>
                                    </div>
                                </div>

                                <div className="strategy-scope-inline">
                                    具体适用项目、数据源、字段和提示词已收纳到编辑弹窗中。
                                </div>

                                <div className="strategy-tag-wrap">
                                    {strategy.definition.steps
                                        .slice(0, 3)
                                        .map((step, index) => (
                                            <Tag key={step.id} color="blue">
                                                {index + 1}. {step.name}
                                            </Tag>
                                        ))}
                                    {strategy.definition.steps.length > 3 ? (
                                        <Tag>
                                            +{strategy.definition.steps.length - 3}{" "}
                                            个步骤
                                        </Tag>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* AI Chat Config Section */}
            <section className="content-surface" style={{ marginTop: 24 }}>
                <div className="section-head ai-review-strategy-head">
                    <div>
                        <h2
                            style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}
                        >
                            AI 对话配置
                        </h2>
                        <p
                            className="muted"
                            style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                        >
                            配置审核场景的 AI
                            对话助手。选择可用模型、编写系统提示词、指定预设发送给
                            AI 的题目字段。
                        </p>
                    </div>
                    <Button
                        type="primary"
                        icon={<Plus size={16} />}
                        onClick={openCreateChatModal}
                    >
                        新建配置
                    </Button>
                </div>

                {!databaseEnabled ? (
                    <Empty description="当前未配置数据库，无法保存对话配置。" />
                ) : !chatConfigs.length ? (
                    <Empty description="当前还没有 AI 对话配置，请先创建一条配置。" />
                ) : (
                    <div className="strategy-card-grid">
                        {chatConfigs.map((config) => (
                            <div key={config.id} className="strategy-card">
                                <div className="strategy-card-head">
                                    <div>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <MessageSquare size={18} />
                                            <strong>{config.name}</strong>
                                            <Tag
                                                color={
                                                    config.enabled
                                                        ? "green"
                                                        : "default"
                                                }
                                            >
                                                {config.enabled
                                                    ? "启用"
                                                    : "已停用"}
                                            </Tag>
                                        </div>
                                    </div>
                                    <Space size={8} wrap>
                                        <Button
                                            icon={<PencilLine size={16} />}
                                            onClick={() =>
                                                openEditChatModal(config)
                                            }
                                        >
                                            编辑
                                        </Button>
                                        <Popconfirm
                                            title="删除对话配置"
                                            description="删除后将无法在审核页面使用该对话配置，确认继续吗？"
                                            okText="删除"
                                            cancelText="取消"
                                            onConfirm={() =>
                                                handleDeleteChat(config.id)
                                            }
                                        >
                                            <Button
                                                danger
                                                icon={<Trash2 size={16} />}
                                                loading={
                                                    isDeletingChat &&
                                                    deletingChatId === config.id
                                                }
                                            >
                                                删除
                                            </Button>
                                        </Popconfirm>
                                    </Space>
                                </div>

                                <div className="strategy-meta-row">
                                    <Tag bordered={false}>
                                        模型：{config.modelCodes.join("、")}
                                    </Tag>
                                    {config.presetFields.length > 0 && (
                                        <Tag bordered={false}>
                                            预设字段：
                                            {config.presetFields.length} 个
                                        </Tag>
                                    )}
                                    <Tag bordered={false}>
                                        更新于{" "}
                                        {new Date(
                                            config.updatedAt,
                                        ).toLocaleString("zh-CN")}
                                    </Tag>
                                </div>

                                {config.systemPrompt ? (
                                    <div
                                        className="muted"
                                        style={{
                                            marginTop: 8,
                                            fontSize: 13,
                                            lineHeight: 1.7,
                                            whiteSpace: "pre-wrap",
                                            maxHeight: 80,
                                            overflow: "hidden",
                                        }}
                                    >
                                        {config.systemPrompt}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Chat Config Modal */}
            <Modal
                title={
                    chatForm.configId ? "编辑 AI 对话配置" : "新建 AI 对话配置"
                }
                open={chatModalOpen}
                onCancel={closeChatModal}
                footer={null}
                width={680}
                destroyOnHidden
            >
                <form onSubmit={handleSaveChat}>
                    <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
                        <div>
                            <label className="field-label">配置名称</label>
                            <Input
                                value={chatForm.name}
                                onChange={(e) =>
                                    setChatForm((c) => ({
                                        ...c,
                                        name: e.target.value,
                                    }))
                                }
                                placeholder="例如：题目分析助手"
                            />
                        </div>

                        <div>
                            <label className="field-label">可用模型</label>
                            <Select
                                mode="multiple"
                                value={chatForm.modelCodes}
                                onChange={(value) =>
                                    setChatForm((c) => ({
                                        ...c,
                                        modelCodes: value,
                                        modelCode: value[0] ?? c.modelCode,
                                    }))
                                }
                                options={modelSelectOptions}
                                placeholder="选择一个或多个 AI 模型"
                                style={{ width: "100%" }}
                                showSearch
                                optionFilterProp="label"
                            />
                        </div>

                        <div>
                            <label className="field-label">启用</label>
                            <div>
                                <Switch
                                    checked={chatForm.enabled}
                                    onChange={(checked) =>
                                        setChatForm((c) => ({
                                            ...c,
                                            enabled: checked,
                                        }))
                                    }
                                />
                            </div>
                        </div>

                        <div>
                            <label className="field-label">系统提示词</label>
                            <Input.TextArea
                                value={chatForm.systemPrompt}
                                onChange={(e) =>
                                    setChatForm((c) => ({
                                        ...c,
                                        systemPrompt: e.target.value,
                                    }))
                                }
                                rows={6}
                                placeholder="设定 AI 的角色和行为规则，例如：你是一个题目审核助手，帮助审核员分析题目质量..."
                            />
                        </div>

                        <div>
                            <label className="field-label">预设发送字段</label>
                            <p
                                className="muted"
                                style={{
                                    margin: "0 0 8px",
                                    fontSize: 13,
                                    lineHeight: 1.5,
                                }}
                            >
                                在审核详情页发起对话时，这些字段的值会自动作为上下文发送给
                                AI。
                            </p>
                            <Select
                                mode="multiple"
                                value={chatForm.presetFields}
                                onChange={(value) =>
                                    setChatForm((c) => ({
                                        ...c,
                                        presetFields: value,
                                    }))
                                }
                                options={allFieldOptions}
                                placeholder="选择要预设发送的字段"
                                style={{ width: "100%" }}
                                showSearch
                                optionFilterProp="label"
                            />
                        </div>

                        <div
                            style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: 8,
                            }}
                        >
                            <Button onClick={closeChatModal}>取消</Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                icon={<Save size={16} />}
                                loading={isSavingChat}
                            >
                                保存配置
                            </Button>
                        </div>
                    </div>
                </form>
            </Modal>

            <Modal
                title={form.strategyId ? "编辑审核策略" : "新建审核策略"}
                open={modalOpen}
                onCancel={closeModal}
                width={920}
                footer={null}
                destroyOnHidden
                wrapClassName="strategy-modal-wrap"
            >
                <form onSubmit={handleSave} className="strategy-form-shell">
                    <div className="strategy-form-grid">
                        <div>
                            <label
                                className="field-label"
                                htmlFor="strategy-name"
                            >
                                策略名称
                            </label>
                            <Input
                                id="strategy-name"
                                value={form.name}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        name: event.target.value,
                                    }))
                                }
                                placeholder="例如：选择题稳定性审核"
                                size="large"
                            />
                        </div>
                        <div>
                            <label
                                className="field-label"
                                htmlFor="strategy-code"
                            >
                                策略编码
                            </label>
                            <Input
                                id="strategy-code"
                                value={form.code}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        code: event.target.value,
                                    }))
                                }
                                placeholder="stable_choice_review"
                                size="large"
                            />
                        </div>
                    </div>

                    <div style={{ marginTop: 16 }}>
                        <label
                            className="field-label"
                            htmlFor="strategy-description"
                        >
                            策略说明
                        </label>
                        <Input.TextArea
                            id="strategy-description"
                            value={form.description}
                            rows={3}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    description: event.target.value,
                                }))
                            }
                            placeholder="简要说明该策略的适用数据源、审核目标和触发标准。"
                        />
                    </div>

                    <div
                        className="strategy-form-grid"
                        style={{ marginTop: 16 }}
                    >
                        <div>
                            <label
                                className="field-label"
                                htmlFor="strategy-projects"
                            >
                                适用项目
                            </label>
                            <Select
                                id="strategy-projects"
                                mode="multiple"
                                value={form.projectIds}
                                onChange={(value) =>
                                    setForm((current) => {
                                        const nextDatasourceIds =
                                            current.datasourceIds.filter(
                                                (datasourceId) => {
                                                    const datasource =
                                                        datasources.find(
                                                            (item) =>
                                                                item.id ===
                                                                datasourceId,
                                                        );

                                                    return (
                                                        !value.length ||
                                                        Boolean(
                                                            datasource &&
                                                            value.includes(
                                                                datasource.projectId,
                                                            ),
                                                        )
                                                    );
                                                },
                                            );
                                        const allowedFields =
                                            getDatasourceFieldSet(
                                                datasources,
                                                nextDatasourceIds,
                                            );

                                        return {
                                            ...current,
                                            projectIds: value,
                                            datasourceIds: nextDatasourceIds,
                                            definition: {
                                                ...current.definition,
                                                steps: current.definition.steps.map(
                                                    (step) =>
                                                        step.kind === "AI_TOOL"
                                                            ? {
                                                                  ...step,
                                                                  fieldKeys:
                                                                      step.fieldKeys.filter(
                                                                          (
                                                                              fieldKey,
                                                                          ) =>
                                                                              allowedFields.has(
                                                                                  fieldKey,
                                                                              ),
                                                                      ),
                                                              }
                                                            : step,
                                                ),
                                            },
                                        };
                                    })
                                }
                                options={projectOptions}
                                placeholder="留空表示适用于全部项目"
                                size="large"
                            />
                        </div>
                        <div>
                            <label
                                className="field-label"
                                htmlFor="strategy-datasources"
                            >
                                适用数据源
                            </label>
                            <Select
                                id="strategy-datasources"
                                mode="multiple"
                                value={form.datasourceIds}
                                onChange={(value) =>
                                    setForm((current) => {
                                        const allowedFields =
                                            getDatasourceFieldSet(
                                                datasources,
                                                value,
                                            );

                                        return {
                                            ...current,
                                            datasourceIds: value,
                                            definition: {
                                                ...current.definition,
                                                steps: current.definition.steps.map(
                                                    (step) =>
                                                        step.kind === "AI_TOOL"
                                                            ? {
                                                                  ...step,
                                                                  fieldKeys:
                                                                      step.fieldKeys.filter(
                                                                          (
                                                                              fieldKey,
                                                                          ) =>
                                                                              allowedFields.has(
                                                                                  fieldKey,
                                                                              ),
                                                                      ),
                                                              }
                                                            : step,
                                                ),
                                            },
                                        };
                                    })
                                }
                                options={datasourceOptions}
                                placeholder="留空表示适用于全部数据源"
                                size="large"
                            />
                        </div>
                    </div>

                    <div className="strategy-switch-row">
                        <div>
                            <div style={{ fontWeight: 600 }}>启用策略</div>
                            <div className="muted" style={{ marginTop: 4 }}>
                                停用后审核页不会再展示该策略。
                            </div>
                        </div>
                        <Switch
                            checked={form.enabled}
                            onChange={(checked) =>
                                setForm((current) => ({
                                    ...current,
                                    enabled: checked,
                                }))
                            }
                        />
                    </div>

                    <div className="strategy-builder">
                        <div className="strategy-builder-head">
                            <div>
                                <h3 style={{ margin: 0, fontSize: 18 }}>
                                    步骤编排
                                </h3>
                                <p
                                    className="muted"
                                    style={{
                                        margin: "8px 0 0",
                                        lineHeight: 1.7,
                                    }}
                                >
                                    AI
                                    工具负责产出结构化结果，规则步骤负责根据前置结果做程序化判断。
                                </p>
                            </div>
                            <Space size={8} wrap>
                                <Button
                                    icon={<Bot size={16} />}
                                    onClick={() =>
                                        addAiToolStep("TEXT_QUALITY_CHECK")
                                    }
                                >
                                    新增 AI 工具
                                </Button>
                                <Button
                                    icon={<Braces size={16} />}
                                    onClick={() =>
                                        addRuleStep("COUNT_THRESHOLD")
                                    }
                                >
                                    新增规则判断
                                </Button>
                            </Space>
                        </div>

                        <div className="strategy-step-editor-stack">
                            {form.definition.steps.map((step, index) => {
                                const sourceOptions = buildSourceStepOptions(
                                    form.definition.steps,
                                    step.id,
                                );
                                const currentSourceToolType =
                                    sourceStepToolType(
                                        form.definition.steps,
                                        "sourceStepId" in step
                                            ? step.sourceStepId
                                            : undefined,
                                    );
                                const metricOptions =
                                    getMetricOptionsForStepType(
                                        currentSourceToolType,
                                    );
                                const ruleMetricOptions =
                                    step.kind === "RULE" &&
                                    step.ruleType !== "MAJORITY_VOTE"
                                        ? metricOptions.filter((option) =>
                                              [
                                                  "passed",
                                                  "isCorrect",
                                                  "isConsistent",
                                              ].includes(option.value),
                                          )
                                        : metricOptions;

                                return (
                                    <div
                                        key={step.id}
                                        className="strategy-step-editor-card"
                                    >
                                        <div className="strategy-step-editor-head">
                                            <div className="strategy-step-order-chip">
                                                {index + 1}
                                            </div>
                                            <div
                                                style={{ flex: 1, minWidth: 0 }}
                                            >
                                                <Input
                                                    value={step.name}
                                                    onChange={(event) =>
                                                        updateStep(
                                                            step.id,
                                                            (currentStep) => ({
                                                                ...currentStep,
                                                                name: event
                                                                    .target
                                                                    .value,
                                                            }),
                                                        )
                                                    }
                                                    placeholder="步骤名称"
                                                    size="large"
                                                />
                                            </div>
                                            <Switch
                                                checked={step.enabled}
                                                checkedChildren="启用"
                                                unCheckedChildren="停用"
                                                onChange={(checked) =>
                                                    updateStep(
                                                        step.id,
                                                        (currentStep) => ({
                                                            ...currentStep,
                                                            enabled: checked,
                                                        }),
                                                    )
                                                }
                                            />
                                            <Button
                                                icon={<ArrowUp size={16} />}
                                                onClick={() =>
                                                    moveStep(index, -1)
                                                }
                                                disabled={index === 0}
                                            />
                                            <Button
                                                icon={<ArrowDown size={16} />}
                                                onClick={() =>
                                                    moveStep(index, 1)
                                                }
                                                disabled={
                                                    index ===
                                                    form.definition.steps
                                                        .length -
                                                        1
                                                }
                                            />
                                            <Button
                                                danger
                                                icon={<Trash2 size={16} />}
                                                onClick={() =>
                                                    removeStep(step.id)
                                                }
                                            />
                                        </div>

                                        {step.kind === "AI_TOOL" ? (
                                            <>
                                                <div className="strategy-step-form-grid">
                                                    <div>
                                                        <label className="field-label">
                                                            工具类型
                                                        </label>
                                                        <Select
                                                            value={
                                                                step.toolType
                                                            }
                                                            onChange={(value) =>
                                                                handleAiToolTypeChange(
                                                                    step,
                                                                    value,
                                                                )
                                                            }
                                                            options={Object.entries(
                                                                aiReviewToolLabels,
                                                            ).map(
                                                                ([
                                                                    value,
                                                                    label,
                                                                ]) => ({
                                                                    value,
                                                                    label,
                                                                }),
                                                            )}
                                                            size="large"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="field-label">
                                                            使用模型
                                                        </label>
                                                        <Select
                                                            value={
                                                                step.modelCode ||
                                                                undefined
                                                            }
                                                            onChange={(value) =>
                                                                updateStep(
                                                                    step.id,
                                                                    (
                                                                        currentStep,
                                                                    ) => ({
                                                                        ...(currentStep as AiReviewAiToolStep),
                                                                        modelCode:
                                                                            value,
                                                                    }),
                                                                )
                                                            }
                                                            options={
                                                                modelSelectOptions
                                                            }
                                                            placeholder="请选择模型"
                                                            size="large"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="field-label">
                                                            执行次数
                                                        </label>
                                                        <InputNumber
                                                            min={1}
                                                            max={10}
                                                            value={
                                                                step.runCount
                                                            }
                                                            onChange={(value) =>
                                                                updateStep(
                                                                    step.id,
                                                                    (
                                                                        currentStep,
                                                                    ) => ({
                                                                        ...(currentStep as AiReviewAiToolStep),
                                                                        runCount:
                                                                            Number(
                                                                                value ??
                                                                                    1,
                                                                            ),
                                                                    }),
                                                                )
                                                            }
                                                            style={{
                                                                width: "100%",
                                                            }}
                                                            size="large"
                                                        />
                                                    </div>
                                                </div>

                                                <div
                                                    className="strategy-step-form-grid"
                                                    style={{ marginTop: 16 }}
                                                >
                                                    <div>
                                                        <label className="field-label">
                                                            来源步骤
                                                        </label>
                                                        <Select
                                                            allowClear
                                                            value={
                                                                step.sourceStepId
                                                            }
                                                            onChange={(value) =>
                                                                updateStep(
                                                                    step.id,
                                                                    (
                                                                        currentStep,
                                                                    ) => ({
                                                                        ...(currentStep as AiReviewAiToolStep),
                                                                        sourceStepId:
                                                                            value ??
                                                                            undefined,
                                                                    }),
                                                                )
                                                            }
                                                            options={
                                                                sourceOptions
                                                            }
                                                            placeholder="留空表示直接读取题目字段"
                                                            size="large"
                                                        />
                                                    </div>
                                                    <div className="strategy-step-form-full">
                                                        <label className="field-label">
                                                            提交字段
                                                        </label>
                                                        <Select
                                                            mode="multiple"
                                                            value={
                                                                step.fieldKeys
                                                            }
                                                            onChange={(value) =>
                                                                updateStep(
                                                                    step.id,
                                                                    (
                                                                        currentStep,
                                                                    ) => ({
                                                                        ...(currentStep as AiReviewAiToolStep),
                                                                        fieldKeys:
                                                                            value,
                                                                    }),
                                                                )
                                                            }
                                                            options={
                                                                rawFieldOptions
                                                            }
                                                            placeholder={
                                                                step.toolType ===
                                                                "REVIEW_SUMMARY"
                                                                    ? "可留空，系统会自动带入前置步骤结果"
                                                                    : form
                                                                            .datasourceIds
                                                                            .length
                                                                      ? "可选系统字段或数据源原始字段"
                                                                      : "可先选择系统字段，如需原始字段再选择适用数据源"
                                                            }
                                                            size="large"
                                                        />
                                                    </div>
                                                </div>

                                                <div style={{ marginTop: 16 }}>
                                                    <label className="field-label">
                                                        自定义提示词
                                                    </label>
                                                    <Input.TextArea
                                                        value={
                                                            step.promptTemplate
                                                        }
                                                        onChange={(event) =>
                                                            updateStep(
                                                                step.id,
                                                                (
                                                                    currentStep,
                                                                ) => ({
                                                                    ...(currentStep as AiReviewAiToolStep),
                                                                    promptTemplate:
                                                                        event
                                                                            .target
                                                                            .value,
                                                                }),
                                                            )
                                                        }
                                                        rows={4}
                                                        placeholder={
                                                            aiReviewDefaultPrompts[
                                                                step.toolType
                                                            ]
                                                        }
                                                    />
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="strategy-step-form-grid">
                                                    <div>
                                                        <label className="field-label">
                                                            规则类型
                                                        </label>
                                                        <Select
                                                            value={
                                                                step.ruleType
                                                            }
                                                            onChange={(value) =>
                                                                handleRuleTypeChange(
                                                                    step,
                                                                    value,
                                                                )
                                                            }
                                                            options={Object.entries(
                                                                aiReviewRuleLabels,
                                                            ).map(
                                                                ([
                                                                    value,
                                                                    label,
                                                                ]) => ({
                                                                    value,
                                                                    label,
                                                                }),
                                                            )}
                                                            size="large"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="field-label">
                                                            来源步骤
                                                        </label>
                                                        <Select
                                                            value={
                                                                step.sourceStepId
                                                            }
                                                            onChange={(value) =>
                                                                updateStep(
                                                                    step.id,
                                                                    (
                                                                        currentStep,
                                                                    ) => ({
                                                                        ...(currentStep as AiReviewRuleStep),
                                                                        sourceStepId:
                                                                            value,
                                                                    }),
                                                                )
                                                            }
                                                            options={sourceOptions.filter(
                                                                (option) =>
                                                                    option.kind ===
                                                                    "AI_TOOL",
                                                            )}
                                                            placeholder="请选择要统计的 AI 步骤"
                                                            size="large"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="field-label">
                                                            统计指标
                                                        </label>
                                                        <Select
                                                            value={step.metric}
                                                            onChange={(value) =>
                                                                updateStep(
                                                                    step.id,
                                                                    (
                                                                        currentStep,
                                                                    ) => ({
                                                                        ...(currentStep as AiReviewRuleStep),
                                                                        metric: value,
                                                                    }),
                                                                )
                                                            }
                                                            options={
                                                                ruleMetricOptions
                                                            }
                                                            placeholder="请选择统计指标"
                                                            size="large"
                                                        />
                                                    </div>
                                                </div>

                                                <div
                                                    className="strategy-step-form-grid"
                                                    style={{ marginTop: 16 }}
                                                >
                                                    {step.ruleType ===
                                                    "MAJORITY_VOTE" ? (
                                                        <div>
                                                            <label className="field-label">
                                                                最少票数
                                                            </label>
                                                            <InputNumber
                                                                min={1}
                                                                max={20}
                                                                value={
                                                                    step.minimumVotes
                                                                }
                                                                onChange={(
                                                                    value,
                                                                ) =>
                                                                    updateStep(
                                                                        step.id,
                                                                        (
                                                                            currentStep,
                                                                        ) => ({
                                                                            ...(currentStep as AiReviewRuleStep),
                                                                            minimumVotes:
                                                                                Number(
                                                                                    value ??
                                                                                        1,
                                                                                ),
                                                                        }),
                                                                    )
                                                                }
                                                                style={{
                                                                    width: "100%",
                                                                }}
                                                                size="large"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div>
                                                                <label className="field-label">
                                                                    聚合方式
                                                                </label>
                                                                <Select
                                                                    value={
                                                                        step.aggregate
                                                                    }
                                                                    onChange={(
                                                                        value,
                                                                    ) =>
                                                                        updateRuleAggregate(
                                                                            step,
                                                                            value,
                                                                        )
                                                                    }
                                                                    options={Object.entries(
                                                                        aiReviewAggregateLabels,
                                                                    )
                                                                        .filter(
                                                                            ([
                                                                                value,
                                                                            ]) =>
                                                                                step.ruleType ===
                                                                                "COUNT_THRESHOLD"
                                                                                    ? value.startsWith(
                                                                                          "COUNT_",
                                                                                      )
                                                                                    : value.endsWith(
                                                                                          "_RATIO",
                                                                                      ),
                                                                        )
                                                                        .map(
                                                                            ([
                                                                                value,
                                                                                label,
                                                                            ]) => ({
                                                                                value,
                                                                                label,
                                                                            }),
                                                                        )}
                                                                    size="large"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="field-label">
                                                                    比较符
                                                                </label>
                                                                <Select
                                                                    value={
                                                                        step.operator
                                                                    }
                                                                    onChange={(
                                                                        value,
                                                                    ) =>
                                                                        updateStep(
                                                                            step.id,
                                                                            (
                                                                                currentStep,
                                                                            ) => ({
                                                                                ...(currentStep as AiReviewRuleStep),
                                                                                operator:
                                                                                    value,
                                                                            }),
                                                                        )
                                                                    }
                                                                    options={aiReviewComparisonOperators.map(
                                                                        (
                                                                            value,
                                                                        ) => ({
                                                                            value,
                                                                            label: value,
                                                                        }),
                                                                    )}
                                                                    size="large"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="field-label">
                                                                    阈值
                                                                </label>
                                                                <InputNumber
                                                                    min={0}
                                                                    max={1000}
                                                                    step={
                                                                        step.ruleType ===
                                                                        "RATIO_THRESHOLD"
                                                                            ? 0.1
                                                                            : 1
                                                                    }
                                                                    value={
                                                                        step.threshold
                                                                    }
                                                                    onChange={(
                                                                        value,
                                                                    ) =>
                                                                        updateStep(
                                                                            step.id,
                                                                            (
                                                                                currentStep,
                                                                            ) => ({
                                                                                ...(currentStep as AiReviewRuleStep),
                                                                                threshold:
                                                                                    Number(
                                                                                        value ??
                                                                                            0,
                                                                                    ),
                                                                            }),
                                                                        )
                                                                    }
                                                                    style={{
                                                                        width: "100%",
                                                                    }}
                                                                    size="large"
                                                                />
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                <div
                                                    className="strategy-step-form-grid"
                                                    style={{ marginTop: 16 }}
                                                >
                                                    <div>
                                                        <label className="field-label">
                                                            命中结果标签
                                                        </label>
                                                        <Select
                                                            value={
                                                                step.outcomeLabel
                                                            }
                                                            onChange={(value) =>
                                                                updateStep(
                                                                    step.id,
                                                                    (
                                                                        currentStep,
                                                                    ) => ({
                                                                        ...(currentStep as AiReviewRuleStep),
                                                                        outcomeLabel:
                                                                            value,
                                                                    }),
                                                                )
                                                            }
                                                            options={Object.entries(
                                                                aiReviewOutcomeLabelMap,
                                                            ).map(
                                                                ([
                                                                    value,
                                                                    label,
                                                                ]) => ({
                                                                    value,
                                                                    label,
                                                                }),
                                                            )}
                                                            size="large"
                                                        />
                                                    </div>
                                                    <div className="strategy-step-form-full">
                                                        <label className="field-label">
                                                            规则摘要模板
                                                        </label>
                                                        <Input
                                                            value={
                                                                step.summaryTemplate
                                                            }
                                                            onChange={(event) =>
                                                                updateStep(
                                                                    step.id,
                                                                    (
                                                                        currentStep,
                                                                    ) => ({
                                                                        ...(currentStep as AiReviewRuleStep),
                                                                        summaryTemplate:
                                                                            event
                                                                                .target
                                                                                .value,
                                                                    }),
                                                                )
                                                            }
                                                            placeholder="可使用 {{actualValue}}、{{threshold}}、{{majorityValue}} 等变量"
                                                            size="large"
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="strategy-modal-actions">
                        <Button onClick={closeModal}>取消</Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            icon={<Save size={16} />}
                            loading={
                                isSaving &&
                                savingId === (form.strategyId ?? "new")
                            }
                        >
                            保存策略
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
