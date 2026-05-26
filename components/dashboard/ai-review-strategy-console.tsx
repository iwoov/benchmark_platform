"use client";

import {
    cloneElement,
    isValidElement,
    useMemo,
    useState,
    useTransition,
    type CSSProperties,
    type FormEvent,
    type ReactElement,
    type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
    ArrowDown,
    ArrowUp,
    Bot,
    Braces,
    MessageSquare,
    PencilLine,
    Plus,
    Save,
    Sparkles,
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
import { defaultAiChatPresetFields } from "@/lib/ai/chat-preset-fields";
import { Badge } from "@/components/ui/badge";
import { Button as UiButton, type ButtonProps } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import {
    Input as UiInput,
    Select as UiSelect,
    Textarea,
} from "@/components/ui/input";
import { Modal as UiModal } from "@/components/ui/modal";
import { MultiSelect } from "@/components/ui/multi-select";
import { Popconfirm as UiPopconfirm } from "@/components/ui/popconfirm";
import { Switch as UiSwitch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
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

type SelectOption = {
    value: string;
    label: ReactNode;
};

type SelectProps = {
    id?: string;
    mode?: "multiple";
    value?: string | string[];
    onChange?: (value: any) => void;
    options?: SelectOption[];
    placeholder?: string;
    allowClear?: boolean;
    disabled?: boolean;
    className?: string;
    style?: CSSProperties;
    size?: "large" | "middle" | "small";
    showSearch?: boolean;
    optionFilterProp?: string;
    maxTagCount?: "responsive" | number;
    maxTagTextLength?: number;
    popupMatchSelectWidth?: boolean;
};

function Select({
    id,
    mode,
    value,
    onChange,
    options = [],
    placeholder,
    allowClear,
    disabled,
    className,
    style,
}: SelectProps) {
    if (mode === "multiple") {
        return (
            <MultiSelect
                id={id}
                value={Array.isArray(value) ? value : []}
                onChange={(nextValue) => onChange?.(nextValue)}
                options={options.map((option) => ({
                    value: option.value,
                    label:
                        typeof option.label === "string"
                            ? option.label
                            : String(option.value),
                }))}
                placeholder={placeholder}
                disabled={disabled}
                className={className}
            />
        );
    }

    return (
        <UiSelect
            id={id}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => {
                const nextValue = event.target.value;
                onChange?.(allowClear && nextValue === "" ? undefined : nextValue);
            }}
            disabled={disabled}
            className={className}
            style={style}
        >
            {placeholder ? (
                <option value="" disabled={!allowClear}>
                    {placeholder}
                </option>
            ) : null}
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </UiSelect>
    );
}

type LocalButtonProps = Omit<ButtonProps, "type" | "leftIcon" | "variant"> & {
    type?: "primary" | "default" | "link";
    htmlType?: "button" | "submit" | "reset";
    icon?: ReactNode;
    danger?: boolean;
};

function Button({
    type,
    htmlType = "button",
    icon,
    danger,
    children,
    ...props
}: LocalButtonProps) {
    const variant = danger
        ? "destructive"
        : type === "primary"
          ? "default"
          : type === "link"
            ? "link"
            : "secondary";

    return (
        <UiButton
            {...props}
            type={htmlType}
            variant={variant}
            leftIcon={icon}
        >
            {children}
        </UiButton>
    );
}

function Empty({ description }: { description?: ReactNode }) {
    return (
        <EmptyState
            title={typeof description === "string" ? description : "暂无数据"}
            description={
                typeof description === "string" ? undefined : undefined
            }
        />
    );
}

function InputAdapter({
    size: _size,
    ...props
}: Omit<React.ComponentProps<typeof UiInput>, "size"> & {
    size?: "large" | "middle" | "small";
}) {
    return <UiInput {...props} />;
}

function TextAreaAdapter({
    size: _size,
    ...props
}: Omit<React.ComponentProps<typeof Textarea>, "size"> & {
    size?: "large" | "middle" | "small";
}) {
    return <Textarea {...props} />;
}

const Input: typeof InputAdapter & { TextArea: typeof TextAreaAdapter } =
    Object.assign(InputAdapter, {
        TextArea: TextAreaAdapter,
    });

function Switch({
    checkedChildren: _checkedChildren,
    unCheckedChildren: _unCheckedChildren,
    ...props
}: React.ComponentProps<typeof UiSwitch> & {
    checkedChildren?: ReactNode;
    unCheckedChildren?: ReactNode;
}) {
    return <UiSwitch {...props} />;
}

function InputNumber({
    value,
    onChange,
    min,
    max,
    step,
    style,
    size: _size,
}: {
    value?: number;
    onChange?: (value: number | null) => void;
    min?: number;
    max?: number;
    step?: number;
    style?: CSSProperties;
    size?: "large" | "middle" | "small";
}) {
    return (
        <UiInput
            type="number"
            value={value ?? ""}
            min={min}
            max={max}
            step={step}
            style={style}
            onChange={(event) => {
                const rawValue = event.target.value;
                onChange?.(rawValue === "" ? null : Number(rawValue));
            }}
        />
    );
}

function Modal({
    title,
    open,
    onCancel,
    children,
    width,
    footer,
    wrapClassName,
}: {
    title?: ReactNode;
    open: boolean;
    onCancel?: () => void;
    children: ReactNode;
    width?: number | string;
    footer?: ReactNode;
    destroyOnHidden?: boolean;
    wrapClassName?: string;
}) {
    return (
        <UiModal
            title={title}
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    onCancel?.();
                }
            }}
            width={width}
            footer={footer === null ? undefined : footer}
            className={wrapClassName}
        >
            {children}
        </UiModal>
    );
}

function Popconfirm({
    title,
    description,
    okText,
    cancelText,
    onConfirm,
    children,
}: {
    title: ReactNode;
    description?: ReactNode;
    okText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
    children: ReactNode;
}) {
    return (
        <UiPopconfirm
            title={title}
            description={description}
            confirmText={okText}
            cancelText={cancelText}
            tone="destructive"
            onConfirm={onConfirm}
        >
            {(open) =>
                isValidElement(children) ? (
                    cloneElement(children as ReactElement<{ onClick?: () => void }>, {
                        onClick: open,
                    })
                ) : (
                    <span onClick={open}>{children}</span>
                )
            }
        </UiPopconfirm>
    );
}

function Space({
    children,
    size = 8,
    align,
    wrap,
}: {
    children: ReactNode;
    size?: number;
    align?: "start" | "end" | "center" | "baseline";
    wrap?: boolean;
}) {
    const alignItems =
        align === "end"
            ? "flex-end"
            : align === "start"
              ? "flex-start"
              : align === "baseline"
                ? "baseline"
                : "center";

    return (
        <div
            style={{
                display: "flex",
                gap: size,
                alignItems,
                flexWrap: wrap ? "wrap" : "nowrap",
            }}
        >
            {children}
        </div>
    );
}

function Tag({
    children,
    color,
}: {
    children: ReactNode;
    color?: "success" | "default" | "green" | string;
}) {
    return (
        <Badge
            variant={
                color === "success" || color === "green"
                    ? "success"
                    : "outline"
            }
            size="sm"
        >
            {children}
        </Badge>
    );
}

type StrategyFormState = {
    strategyId?: string;
    scopeAdminId: string;
    name: string;
    code: string;
    description: string;
    enabled: boolean;
    projectIds: string[];
    datasourceIds: string[];
    definition: AiReviewStrategyDefinition;
};

function createDefaultStrategyForm(
    scopeAdminId = "",
    initialToolType: AiReviewAiToolType = "TEXT_QUALITY_CHECK",
): StrategyFormState {
    return {
        scopeAdminId,
        name: "",
        code: "",
        description: "",
        enabled: true,
        projectIds: [],
        datasourceIds: [],
        definition: {
            version: 1,
            steps: [createDefaultAiToolStep(initialToolType)],
        },
    };
}

function createDefaultEvaluationStrategyForm(scopeAdminId = ""): StrategyFormState {
    const solveStep: AiReviewAiToolStep = {
        ...createDefaultAiToolStep("AI_SOLVE_QUESTION"),
        id: "eval_solve_1",
        name: "一阶段：模型作答",
        runCount: 1,
    };
    const judgeStep: AiReviewAiToolStep = {
        ...createDefaultAiToolStep("ANSWER_MATCH_CHECK"),
        id: "eval_judge_1",
        name: "二阶段：答案正确性判断",
        runCount: 1,
        sourceStepId: solveStep.id,
    };

    return {
        scopeAdminId,
        name: "",
        code: "",
        description: "",
        enabled: true,
        projectIds: [],
        datasourceIds: [],
        definition: {
            version: 1,
            steps: [solveStep, judgeStep],
        },
    };
}

function getStructuredOutputContract(toolType: AiReviewAiToolType) {
    switch (toolType) {
        case "AI_SOLVE_QUESTION":
            return `{
  "answer": "模型答案",
  "normalizedAnswer": "标准化答案",
  "reasoning": "作答过程",
  "confidence": 0.8
}`;
        case "ANSWER_MATCH_CHECK":
            return `{
  "matchLevel": "EXACT|SEMANTIC_MATCH|PARTIAL_MATCH|MISMATCH|UNKNOWN",
  "isCorrect": true,
  "summary": "判题摘要",
  "difference": null
}`;
        case "DIFFICULTY_EVALUATION":
            return `{
  "difficultyLevel": "EASY|MEDIUM|HARD",
  "score": 3,
  "summary": "难度判断摘要",
  "evidence": []
}`;
        default:
            return null;
    }
}

function createStrategyFormState(strategy?: {
    id: string;
    scopeAdminId: string;
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
        scopeAdminId: strategy.scopeAdminId,
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
        projectId: string;
        rawFieldOrder: string[];
    }>,
    projectIds: string[],
    datasourceIds: string[],
) {
    const activeDatasources = datasources.filter(
        (datasource) =>
            (datasourceIds.length
                ? datasourceIds.includes(datasource.id)
                : true) &&
            (projectIds.length
                ? projectIds.includes(datasource.projectId)
                : true),
    );

    return new Set(
        systemFieldOptions
            .map((option) => option.value)
            .concat(
                activeDatasources.flatMap(
                    (datasource) => datasource.rawFieldOrder,
                ),
            ),
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

type StrategyCategory = "REVIEW" | "CLEANING" | "EVALUATION" | "CHAT";

const STRATEGY_CATEGORIES: Array<{
    value: StrategyCategory;
    label: string;
    description: string;
    defaultTool: AiReviewAiToolType | null;
    createButtonLabel: string;
}> = [
    {
        value: "REVIEW",
        label: "审核策略",
        description: "面向题干、答案、解析的内容审核",
        defaultTool: "TEXT_QUALITY_CHECK",
        createButtonLabel: "新建审核策略",
    },
    {
        value: "CLEANING",
        label: "清洗策略",
        description: "字段清洗与文本归一化",
        defaultTool: "FIELD_CLEANING",
        createButtonLabel: "新建清洗策略",
    },
    {
        value: "EVALUATION",
        label: "评测策略",
        description: "两阶段评测：一阶段模型作答，二阶段模型判断答案是否正确",
        defaultTool: "AI_SOLVE_QUESTION",
        createButtonLabel: "新建评测策略",
    },
    {
        value: "CHAT",
        label: "AI 对话配置",
        description: "配置审核场景的 AI 对话助手，选择可用模型、系统提示词与预设字段",
        defaultTool: null,
        createButtonLabel: "新建对话配置",
    },
];

function parseStrategyCategory(value: string | null): StrategyCategory | null {
    return STRATEGY_CATEGORIES.some((category) => category.value === value)
        ? (value as StrategyCategory)
        : null;
}

function getStrategyCategory(strategy: {
    definition: { steps: AiReviewStrategyStep[] };
}): Exclude<StrategyCategory, "CHAT"> {
    const aiSteps = strategy.definition.steps.filter(
        (step): step is Extract<AiReviewStrategyStep, { kind: "AI_TOOL" }> =>
            step.kind === "AI_TOOL",
    );
    if (aiSteps.some((step) => step.toolType === "FIELD_CLEANING")) {
        return "CLEANING";
    }
    if (
        aiSteps.some((step) => step.toolType === "ANSWER_MATCH_CHECK")
    ) {
        return "EVALUATION";
    }
    return "REVIEW";
}

const systemFieldOptions = [
    { value: "title", label: "系统字段 / title" },
    { value: "content", label: "系统字段 / content" },
    { value: "answer", label: "系统字段 / answer" },
    { value: "analysis", label: "系统字段 / analysis" },
    { value: "questionType", label: "系统字段 / questionType" },
    { value: "difficulty", label: "系统字段 / difficulty" },
    { value: "rawRecord", label: "系统字段 / rawRecord" },
    { value: "manualReviewComment", label: "审核字段 / 人工审核意见" },
    { value: "aiReviewComment", label: "审核字段 / AI 审核意见" },
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
        presetFields: [...defaultAiChatPresetFields],
        enabled: true,
    };
}

export function AiReviewStrategyConsole({
    databaseEnabled,
    currentPlatformRole,
    modelOptions,
    projects,
    datasources,
    strategies,
    chatConfigs,
    adminScopeOptions,
    activeScopeAdminId,
    initialCategory,
}: {
    databaseEnabled: boolean;
    currentPlatformRole: "SUPER_ADMIN" | "PLATFORM_ADMIN" | "USER";
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
        scopeAdminId: string;
        scopeAdminName: string;
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
    adminScopeOptions: Array<{
        id: string;
        name: string;
        username: string | null;
    }>;
    activeScopeAdminId: string | null;
    initialCategory?: string | null;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const toast = useToast();
    const [form, setForm] = useState<StrategyFormState>(
        createDefaultStrategyForm(activeScopeAdminId ?? ""),
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
    const [activeCategory, setActiveCategory] = useState<StrategyCategory>(
        parseStrategyCategory(initialCategory ?? null) ?? "REVIEW",
    );

    type StrategyBucketKey = Exclude<StrategyCategory, "CHAT">;
    const strategiesByCategory = useMemo(() => {
        const buckets: Record<StrategyBucketKey, typeof strategies> = {
            REVIEW: [],
            CLEANING: [],
            EVALUATION: [],
        };
        for (const strategy of strategies) {
            buckets[getStrategyCategory(strategy)].push(strategy);
        }
        return buckets;
    }, [strategies]);

    const visibleStrategies =
        activeCategory === "CHAT"
            ? []
            : strategiesByCategory[activeCategory as StrategyBucketKey];
    const activeCategoryMeta = STRATEGY_CATEGORIES.find(
        (c) => c.value === activeCategory,
    )!;
    const canSelectScope =
        currentPlatformRole === "SUPER_ADMIN" && adminScopeOptions.length > 0;

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
        const activeDatasources = datasources.filter(
            (datasource) =>
                (form.datasourceIds.length
                    ? form.datasourceIds.includes(datasource.id)
                    : true) &&
                (form.projectIds.length
                    ? form.projectIds.includes(datasource.projectId)
                    : true),
        );
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
    }, [datasources, form.datasourceIds, form.projectIds]);

    const totalProjectCount = projects.length;
    const totalDatasourceCount = datasources.length;

    function notifyResult(result: { error?: string; success?: string }) {
        if (result.error) {
            toast.error({
                title: "操作失败",
                description: result.error,
            });
            return false;
        }

        if (result.success) {
            toast.success({
                title: "操作成功",
                description: result.success,
            });
        }

        router.refresh();
        return true;
    }

    function openCreateModal(
        initialToolType: AiReviewAiToolType = "TEXT_QUALITY_CHECK",
    ) {
        setForm(
            createDefaultStrategyForm(
                activeScopeAdminId ?? "",
                initialToolType,
            ),
        );
        setModalOpen(true);
    }

    function openCreateEvaluationModal() {
        setForm(createDefaultEvaluationStrategyForm(activeScopeAdminId ?? ""));
        setModalOpen(true);
    }

    function openEditModal(strategy: (typeof strategies)[number]) {
        setForm(createStrategyFormState(strategy));
        setModalOpen(true);
    }

    function closeModal() {
        setModalOpen(false);
        setForm(createDefaultStrategyForm(activeScopeAdminId ?? ""));
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
            modelCodes: step.modelCodes,
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
            try {
                const result = await saveAiReviewStrategyAction({
                    strategyId: form.strategyId,
                    scopeAdminId: form.scopeAdminId,
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

                if (success) {
                    closeModal();
                }
            } catch (error) {
                toast.error({
                    title: "保存失败",
                    description:
                        error instanceof Error
                            ? error.message
                            : "保存策略时发生未知错误。",
                });
            } finally {
                setSavingId(null);
            }
        });
    }

    function handleScopeChange(scopeAdminId: string) {
        const params = new URLSearchParams(window.location.search);
        params.set("scopeAdminId", scopeAdminId);
        router.replace(`${pathname}?${params.toString()}`);
    }

    function handleCategoryChange(category: StrategyCategory) {
        setActiveCategory(category);

        const params = new URLSearchParams(window.location.search);
        if (category === "REVIEW") {
            params.delete("category");
        } else {
            params.set("category", category);
        }

        router.replace(
            params.size ? `${pathname}?${params.toString()}` : pathname,
            { scroll: false },
        );
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
                            AI 策略
                        </h2>
                        <p
                            className="muted"
                            style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                        >
                            这里维护题目审核、数据清洗与数据评测场景的 AI
                            工具和规则步骤。管理员创建策略，审核员在列表或详情页选择并执行。
                        </p>
                    </div>
                    <Space size={12} align="end">
                        {canSelectScope ? (
                            <div style={{ minWidth: 280 }}>
                                <div className="field-label">管理员域</div>
                                <Select
                                    size="large"
                                    value={activeScopeAdminId ?? undefined}
                                    options={adminScopeOptions.map((admin) => ({
                                        value: admin.id,
                                        label: `${admin.name}${
                                            admin.username
                                                ? ` (${admin.username})`
                                                : ""
                                        }`,
                                    }))}
                                    onChange={handleScopeChange}
                                    style={{ width: "100%", marginTop: 8 }}
                                />
                            </div>
                        ) : null}
                        <Button
                            type="primary"
                            icon={
                                activeCategory === "CHAT" ? (
                                    <MessageSquare size={16} />
                                ) : activeCategory === "CLEANING" ? (
                                    <Sparkles size={16} />
                                ) : (
                                    <Plus size={16} />
                                )
                            }
                            onClick={() => {
                                if (activeCategory === "CHAT") {
                                    openCreateChatModal();
                                } else if (activeCategory === "EVALUATION") {
                                    openCreateEvaluationModal();
                                } else if (activeCategoryMeta.defaultTool) {
                                    openCreateModal(activeCategoryMeta.defaultTool);
                                }
                            }}
                        >
                            {activeCategoryMeta.createButtonLabel}
                        </Button>
                    </Space>
                </div>

                <div className="strategy-tabs" role="tablist">
                    {STRATEGY_CATEGORIES.map((cat) => {
                        const count =
                            cat.value === "CHAT"
                                ? chatConfigs.length
                                : strategiesByCategory[
                                      cat.value as Exclude<
                                          StrategyCategory,
                                          "CHAT"
                                      >
                                  ].length;
                        const isActive = cat.value === activeCategory;
                        return (
                            <button
                                key={cat.value}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => handleCategoryChange(cat.value)}
                                className={`strategy-tab${
                                    isActive ? " strategy-tab-active" : ""
                                }`}
                            >
                                <span className="strategy-tab-label">
                                    {cat.label}
                                </span>
                                <span className="strategy-tab-count">{count}</span>
                            </button>
                        );
                    })}
                </div>

                <p
                    className="muted"
                    style={{ margin: "12px 0 16px", fontSize: 13 }}
                >
                    {activeCategoryMeta.description}
                </p>

                {!databaseEnabled ? (
                    <Empty
                        description={
                            activeCategory === "CHAT"
                                ? "当前未配置数据库，无法保存对话配置。"
                                : "当前未配置数据库，无法保存 AI 策略。"
                        }
                    />
                ) : activeCategory === "CHAT" ? (
                    !chatConfigs.length ? (
                        <Empty description="当前还没有 AI 对话配置，点击右上角创建。" />
                    ) : (
                        <div className="strategy-row-list">
                            {chatConfigs.map((config) => (
                                <article
                                    key={config.id}
                                    className="strategy-row"
                                >
                                    <div className="strategy-row-main">
                                        <div className="strategy-row-identity">
                                            <MessageSquare
                                                size={16}
                                                className="strategy-row-icon"
                                            />
                                            <h3 className="strategy-row-name">
                                                {config.name}
                                            </h3>
                                            <Tag
                                                color={
                                                    config.enabled
                                                        ? "success"
                                                        : "default"
                                                }
                                            >
                                                {config.enabled
                                                    ? "启用中"
                                                    : "已停用"}
                                            </Tag>
                                        </div>

                                        {config.systemPrompt ? (
                                            <p className="strategy-row-desc">
                                                {config.systemPrompt}
                                            </p>
                                        ) : null}

                                        <div className="strategy-row-meta">
                                            <span className="strategy-row-meta-item">
                                                <span className="strategy-row-meta-key">
                                                    模型
                                                </span>
                                                <span className="strategy-row-meta-value">
                                                    {config.modelCodes.join("、")}
                                                </span>
                                            </span>
                                            <span
                                                className="strategy-row-meta-divider"
                                                aria-hidden
                                            >
                                                ·
                                            </span>
                                            <span className="strategy-row-meta-item">
                                                <span className="strategy-row-meta-key">
                                                    预设字段
                                                </span>
                                                <span className="strategy-row-meta-value">
                                                    {config.presetFields.length
                                                        ? `${config.presetFields.length} 个`
                                                        : "无"}
                                                </span>
                                            </span>
                                            <span
                                                className="strategy-row-meta-divider"
                                                aria-hidden
                                            >
                                                ·
                                            </span>
                                            <span className="strategy-row-meta-item">
                                                <span className="strategy-row-meta-key">
                                                    更新
                                                </span>
                                                <span className="strategy-row-meta-value">
                                                    {new Date(
                                                        config.updatedAt,
                                                    ).toLocaleString("zh-CN")}
                                                </span>
                                            </span>
                                        </div>
                                    </div>

                                    <div className="strategy-row-actions">
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
                                    </div>
                                </article>
                            ))}
                        </div>
                    )
                ) : !visibleStrategies.length ? (
                    <Empty
                        description={`当前还没有${activeCategoryMeta.label}，点击右上角创建。`}
                    />
                ) : (
                    <div className="strategy-row-list">
                        {visibleStrategies.map((strategy) => {
                            const aiStepCount = strategy.definition.steps.filter(
                                (step) => step.kind === "AI_TOOL",
                            ).length;
                            const ruleStepCount =
                                strategy.definition.steps.filter(
                                    (step) => step.kind === "RULE",
                                ).length;
                            return (
                                <article
                                    key={strategy.id}
                                    className="strategy-row"
                                >
                                    <div className="strategy-row-main">
                                        <div className="strategy-row-identity">
                                            <h3 className="strategy-row-name">
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
                                            <p className="strategy-row-desc">
                                                {strategy.description}
                                            </p>
                                        ) : null}

                                        <div className="strategy-row-meta">
                                            <span className="strategy-row-meta-item">
                                                <span className="strategy-row-meta-key">
                                                    步骤
                                                </span>
                                                <span className="strategy-row-meta-value">
                                                    {strategy.definition.steps.length}{" "}
                                                    (AI {aiStepCount} / 规则{" "}
                                                    {ruleStepCount})
                                                </span>
                                            </span>
                                            <span
                                                className="strategy-row-meta-divider"
                                                aria-hidden
                                            >
                                                ·
                                            </span>
                                            <span className="strategy-row-meta-item">
                                                <span className="strategy-row-meta-key">
                                                    适用项目
                                                </span>
                                                <span className="strategy-row-meta-value">
                                                    {summarizeScope(
                                                        strategy.projectIds.length,
                                                        totalProjectCount,
                                                        "全部",
                                                    )}
                                                </span>
                                            </span>
                                            <span
                                                className="strategy-row-meta-divider"
                                                aria-hidden
                                            >
                                                ·
                                            </span>
                                            <span className="strategy-row-meta-item">
                                                <span className="strategy-row-meta-key">
                                                    数据源
                                                </span>
                                                <span className="strategy-row-meta-value">
                                                    {summarizeScope(
                                                        strategy.datasourceIds
                                                            .length,
                                                        totalDatasourceCount,
                                                        "全部",
                                                    )}
                                                </span>
                                            </span>
                                            <span
                                                className="strategy-row-meta-divider"
                                                aria-hidden
                                            >
                                                ·
                                            </span>
                                            <span className="strategy-row-meta-item">
                                                <span className="strategy-row-meta-key">
                                                    维护人
                                                </span>
                                                <span className="strategy-row-meta-value">
                                                    {strategy.createdByName}
                                                </span>
                                            </span>
                                            <span
                                                className="strategy-row-meta-divider"
                                                aria-hidden
                                            >
                                                ·
                                            </span>
                                            <span className="strategy-row-meta-item">
                                                <span className="strategy-row-meta-key">
                                                    更新
                                                </span>
                                                <span className="strategy-row-meta-value">
                                                    {new Date(
                                                        strategy.updatedAt,
                                                    ).toLocaleString("zh-CN")}
                                                </span>
                                            </span>
                                        </div>

                                        {strategy.definition.steps.length ? (
                                            <div className="strategy-row-steps">
                                                {strategy.definition.steps
                                                    .slice(0, 4)
                                                    .map((step, index) => (
                                                        <span
                                                            key={step.id}
                                                            className="strategy-row-step"
                                                        >
                                                            <span className="strategy-row-step-index">
                                                                {index + 1}
                                                            </span>
                                                            <span className="strategy-row-step-name">
                                                                {step.name}
                                                            </span>
                                                        </span>
                                                    ))}
                                                {strategy.definition.steps.length >
                                                4 ? (
                                                    <span className="strategy-row-step strategy-row-step-more">
                                                        +
                                                        {strategy.definition.steps
                                                            .length - 4}
                                                    </span>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="strategy-row-actions">
                                        <Button
                                            icon={<PencilLine size={16} />}
                                            onClick={() =>
                                                openEditModal(strategy)
                                            }
                                        >
                                            编辑
                                        </Button>
                                        <Popconfirm
                                            title="删除 AI 策略"
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
                                    </div>
                                </article>
                            );
                        })}
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
                title={form.strategyId ? "编辑 AI 策略" : "新建 AI 策略"}
                open={modalOpen}
                onCancel={closeModal}
                width={920}
                footer={null}
                destroyOnHidden
                wrapClassName="strategy-modal-wrap"
            >
                <form onSubmit={handleSave} className="strategy-form-shell">
                    {canSelectScope ? (
                        <div style={{ marginBottom: 20 }}>
                            <label className="field-label">所属管理员域</label>
                            <Select
                                size="large"
                                value={form.scopeAdminId || undefined}
                                options={adminScopeOptions.map((admin) => ({
                                    value: admin.id,
                                    label: `${admin.name}${
                                        admin.username
                                            ? ` (${admin.username})`
                                            : ""
                                    }`,
                                }))}
                                onChange={(value) =>
                                    setForm((current) => ({
                                        ...current,
                                        scopeAdminId: value,
                                    }))
                                }
                                style={{ width: "100%", marginTop: 8 }}
                            />
                        </div>
                    ) : null}
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
                            placeholder="简要说明该策略的适用数据源、处理目标和触发标准。"
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
                                maxTagCount="responsive"
                                maxTagTextLength={18}
                                popupMatchSelectWidth
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
                                                value,
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
                                className="strategy-scope-select"
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
                                maxTagCount="responsive"
                                maxTagTextLength={18}
                                popupMatchSelectWidth
                                onChange={(value) =>
                                    setForm((current) => {
                                        const allowedFields =
                                            getDatasourceFieldSet(
                                                datasources,
                                                current.projectIds,
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
                                className="strategy-scope-select"
                            />
                        </div>
                    </div>

                    <div className="strategy-switch-row">
                        <div>
                            <div style={{ fontWeight: 600 }}>启用策略</div>
                            <div className="muted" style={{ marginTop: 4 }}>
                                停用后列表和详情页不会再展示该策略。
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
                                                            mode="multiple"
                                                            value={
                                                                step.modelCodes
                                                                    .length
                                                                    ? step.modelCodes
                                                                    : step.modelCode
                                                                      ? [
                                                                            step.modelCode,
                                                                        ]
                                                                      : []
                                                            }
                                                            onChange={(value) =>
                                                                updateStep(
                                                                    step.id,
                                                                    (
                                                                        currentStep,
                                                                    ) => ({
                                                                        ...(currentStep as AiReviewAiToolStep),
                                                                        modelCodes:
                                                                            Array.isArray(
                                                                                value,
                                                                            )
                                                                                ? value
                                                                                : [],
                                                                        modelCode:
                                                                            Array.isArray(
                                                                                value,
                                                                            )
                                                                                ? (value[0] ??
                                                                                  "")
                                                                                : "",
                                                                    }),
                                                                )
                                                            }
                                                            options={
                                                                modelSelectOptions
                                                            }
                                                            placeholder="请选择模型"
                                                            maxTagCount="responsive"
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
                                                {getStructuredOutputContract(
                                                    step.toolType,
                                                ) ? (
                                                    <div style={{ marginTop: 16 }}>
                                                        <label className="field-label">
                                                            结构化返回
                                                        </label>
                                                        <pre
                                                            style={{
                                                                margin: 0,
                                                                overflowX: "auto",
                                                                border:
                                                                    "1px solid var(--color-border)",
                                                                borderRadius: 8,
                                                                background:
                                                                    "var(--color-muted)",
                                                                padding: 12,
                                                                fontSize: 12,
                                                                lineHeight: 1.6,
                                                                color:
                                                                    "var(--color-foreground)",
                                                            }}
                                                        >
                                                            {getStructuredOutputContract(
                                                                step.toolType,
                                                            )}
                                                        </pre>
                                                    </div>
                                                ) : null}
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
