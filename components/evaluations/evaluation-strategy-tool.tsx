"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PencilLine, Plus, Save, Trash2 } from "lucide-react";
import {
    deleteAiReviewStrategyAction,
    saveAiReviewStrategyAction,
} from "@/app/actions/ai-review-strategies";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
    aiReviewDefaultPrompts,
    type AiReviewAiToolStep,
    type AiReviewStrategyDefinition,
    type AiReviewStrategyStep,
} from "@/lib/ai/review-strategy-schema";

type EvaluationStrategy = {
    id: string;
    scopeAdminId: string;
    code: string;
    name: string;
    description: string | null;
    enabled: boolean;
    projectIds: string[];
    datasourceIds: string[];
    definition: AiReviewStrategyDefinition;
    updatedAt: string;
};

type FormState = {
    strategyId?: string;
    scopeAdminId: string;
    name: string;
    code: string;
    description: string;
    enabled: boolean;
    projectIds: string[];
    modelCodes: string[];
    promptTemplate: string;
};

function makeDefaultForm(scopeAdminId: string): FormState {
    return {
        scopeAdminId,
        name: "数据难度评测",
        code: `data_eval_${Date.now().toString(36)}`,
        description: "对已通过题目进行模型评测。",
        enabled: true,
        projectIds: [],
        modelCodes: [],
        promptTemplate: aiReviewDefaultPrompts.DIFFICULTY_EVALUATION,
    };
}

function isEvaluationStep(
    step: AiReviewStrategyStep,
): step is AiReviewAiToolStep {
    return (
        step.kind === "AI_TOOL" && step.toolType === "DIFFICULTY_EVALUATION"
    );
}

function getEvaluationSteps(definition: AiReviewStrategyDefinition) {
    return definition.steps.filter(
        (step): step is AiReviewAiToolStep => isEvaluationStep(step),
    );
}

function formFromStrategy(strategy: EvaluationStrategy): FormState {
    const steps = getEvaluationSteps(strategy.definition);

    return {
        strategyId: strategy.id,
        scopeAdminId: strategy.scopeAdminId,
        name: strategy.name,
        code: strategy.code,
        description: strategy.description ?? "",
        enabled: strategy.enabled,
        projectIds: strategy.projectIds,
        modelCodes: [...new Set(steps.map((step) => step.modelCode))],
        promptTemplate:
            steps.find((step) => step.promptTemplate)?.promptTemplate ??
            aiReviewDefaultPrompts.DIFFICULTY_EVALUATION,
    };
}

function toggleValue(values: string[], value: string, checked: boolean) {
    if (checked) {
        return values.includes(value) ? values : [...values, value];
    }
    return values.filter((item) => item !== value);
}

function buildDefinition(form: FormState): AiReviewStrategyDefinition {
    return {
        version: 1,
        steps: form.modelCodes.map((modelCode, index) => ({
            id: `eval_${index + 1}`,
            name: `难度评测 / ${modelCode}`,
            enabled: true,
            kind: "AI_TOOL",
            toolType: "DIFFICULTY_EVALUATION",
            modelCode,
            fieldKeys: ["title", "content", "answer", "analysis"],
            promptTemplate: form.promptTemplate,
            runCount: 1,
            sourceStepId: undefined,
        })),
    };
}

export function EvaluationStrategyTool({
    databaseEnabled,
    modelOptions,
    projects,
    strategies,
    activeScopeAdminId,
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
    strategies: EvaluationStrategy[];
    activeScopeAdminId: string | null;
}) {
    const router = useRouter();
    const toast = useToast();
    const [isPending, startTransition] = useTransition();
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(
        makeDefaultForm(activeScopeAdminId ?? ""),
    );
    const modelLabelMap = useMemo(
        () => new Map(modelOptions.map((model) => [model.code, model.label])),
        [modelOptions],
    );

    function notify(result: { error?: string; success?: string }) {
        if (result.error) {
            toast.error({
                title: "操作失败",
                description: result.error,
            });
            return false;
        }

        toast.success({
            title: "操作成功",
            description: result.success ?? "已保存。",
        });
        router.refresh();
        return true;
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!form.modelCodes.length) {
            toast.warning({
                title: "请选择模型",
                description: "评测策略至少需要勾选一个模型。",
            });
            return;
        }

        startTransition(async () => {
            const result = await saveAiReviewStrategyAction({
                strategyId: form.strategyId,
                scopeAdminId: form.scopeAdminId || undefined,
                payload: {
                    name: form.name,
                    code: form.code,
                    description: form.description,
                    enabled: form.enabled,
                    projectIds: form.projectIds,
                    datasourceIds: [],
                    definition: buildDefinition(form),
                },
            });

            if (notify(result)) {
                setForm(makeDefaultForm(activeScopeAdminId ?? ""));
            }
        });
    }

    function handleDelete(strategyId: string) {
        setDeletingId(strategyId);
        startTransition(async () => {
            const result = await deleteAiReviewStrategyAction({ strategyId });
            notify(result);
            setDeletingId(null);
        });
    }

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow="Evaluation Strategy"
                title="评测策略工具"
                description="为数据评测单独维护策略：勾选参与评测的模型，并统一配置评测提示词。"
            />

            {!databaseEnabled ? (
                <EmptyState
                    title="数据库未启用"
                    description="当前未配置 DATABASE_URL，无法维护评测策略。"
                />
            ) : (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1fr)]">
                    <Card>
                        <CardHeader>
                            <CardTitle>已有评测策略</CardTitle>
                            <CardDescription>
                                这里只显示包含难度评测步骤的 AI 策略。
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {strategies.length ? (
                                strategies.map((strategy) => {
                                    const steps = getEvaluationSteps(
                                        strategy.definition,
                                    );
                                    const modelCodes = [
                                        ...new Set(
                                            steps.map((step) => step.modelCode),
                                        ),
                                    ];

                                    return (
                                        <div
                                            key={strategy.id}
                                            className="rounded-lg border border-border p-4"
                                        >
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <h2 className="truncate text-sm font-semibold text-foreground">
                                                            {strategy.name}
                                                        </h2>
                                                        <Badge
                                                            variant={
                                                                strategy.enabled
                                                                    ? "success"
                                                                    : "outline"
                                                            }
                                                            size="sm"
                                                        >
                                                            {strategy.enabled
                                                                ? "启用"
                                                                : "停用"}
                                                        </Badge>
                                                    </div>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        {strategy.code}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        size="sm"
                                                        leftIcon={
                                                            <PencilLine size={14} />
                                                        }
                                                        onClick={() =>
                                                            setForm(
                                                                formFromStrategy(
                                                                    strategy,
                                                                ),
                                                            )
                                                        }
                                                    >
                                                        编辑
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        size="sm"
                                                        loading={
                                                            deletingId ===
                                                            strategy.id
                                                        }
                                                        leftIcon={
                                                            <Trash2 size={14} />
                                                        }
                                                        onClick={() =>
                                                            handleDelete(
                                                                strategy.id,
                                                            )
                                                        }
                                                    >
                                                        删除
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {modelCodes.map((modelCode) => (
                                                    <Badge
                                                        key={modelCode}
                                                        variant="primary"
                                                    >
                                                        {modelLabelMap.get(
                                                            modelCode,
                                                        ) ?? modelCode}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <EmptyState
                                    title="暂无评测策略"
                                    description="先在右侧勾选模型并保存一个评测策略。"
                                />
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {form.strategyId ? "编辑策略" : "新建策略"}
                            </CardTitle>
                            <CardDescription>
                                保存后，数据评测列表会用这里勾选的模型作为表头。
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form className="space-y-5" onSubmit={handleSubmit}>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="eval-name" required>
                                            策略名称
                                        </Label>
                                        <Input
                                            id="eval-name"
                                            value={form.name}
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    name: event.target.value,
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="eval-code" required>
                                            策略编码
                                        </Label>
                                        <Input
                                            id="eval-code"
                                            value={form.code}
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    code: event.target.value,
                                                }))
                                            }
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="eval-desc">描述</Label>
                                    <Input
                                        id="eval-desc"
                                        value={form.description}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                description: event.target.value,
                                            }))
                                        }
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>适用项目</Label>
                                    <div className="grid gap-2 md:grid-cols-2">
                                        {projects.map((project) => (
                                            <Checkbox
                                                key={project.id}
                                                checked={form.projectIds.includes(
                                                    project.id,
                                                )}
                                                label={`${project.name} (${project.code})`}
                                                onChange={(event) =>
                                                    setForm((current) => ({
                                                        ...current,
                                                        projectIds: toggleValue(
                                                            current.projectIds,
                                                            project.id,
                                                            event.target.checked,
                                                        ),
                                                    }))
                                                }
                                            />
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        不勾选项目时，策略默认适用于全部项目。
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label required>评测模型</Label>
                                    <div className="grid gap-2 md:grid-cols-2">
                                        {modelOptions.map((model) => (
                                            <Checkbox
                                                key={model.code}
                                                checked={form.modelCodes.includes(
                                                    model.code,
                                                )}
                                                label={`${model.label} · ${model.protocol}`}
                                                onChange={(event) =>
                                                    setForm((current) => ({
                                                        ...current,
                                                        modelCodes: toggleValue(
                                                            current.modelCodes,
                                                            model.code,
                                                            event.target.checked,
                                                        ),
                                                    }))
                                                }
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="eval-prompt" required>
                                        评测提示词
                                    </Label>
                                    <Textarea
                                        id="eval-prompt"
                                        value={form.promptTemplate}
                                        rows={9}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                promptTemplate:
                                                    event.target.value,
                                            }))
                                        }
                                    />
                                </div>

                                <Checkbox
                                    checked={form.enabled}
                                    label="启用策略"
                                    onChange={(event) =>
                                        setForm((current) => ({
                                            ...current,
                                            enabled: event.target.checked,
                                        }))
                                    }
                                />

                                <div className="flex flex-wrap justify-end gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        leftIcon={<Plus size={16} />}
                                        onClick={() =>
                                            setForm(
                                                makeDefaultForm(
                                                    activeScopeAdminId ?? "",
                                                ),
                                            )
                                        }
                                    >
                                        新建
                                    </Button>
                                    <Button
                                        type="submit"
                                        loading={isPending}
                                        leftIcon={<Save size={16} />}
                                    >
                                        保存策略
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
