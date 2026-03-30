"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Empty, Select, Space, Tag } from "antd";
import { Bot, Play, RefreshCcw } from "lucide-react";
import {
    runAiReviewStrategyAction,
    retryAiReviewStrategyRunItemAction,
} from "@/app/actions/ai-review-strategies";

type StrategyRunResult = {
    version: 1;
    strategy: {
        id: string;
        code: string;
        name: string;
    };
    question: {
        id: string;
        title: string;
        projectName: string;
        projectCode: string;
        datasourceName: string;
    };
    status: "RUNNING" | "SUCCESS" | "FAILED";
    stepResults: Array<{
        stepId: string;
        stepName: string;
        stepKind: "AI_TOOL" | "RULE";
        stepType: string;
        status: "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
        summary: string;
        outcomeLabel?: string;
        items: Array<{
            index: number;
            status: "SUCCESS" | "FAILED";
            sourceStepId?: string;
            promptInput?: unknown;
            requestMeta?: {
                modelCode: string;
                protocol?: string | null;
                reasoningLevel?: string | null;
                providerCode?: string | null;
                providerName?: string | null;
                endpointCode?: string | null;
                endpointLabel?: string | null;
                baseUrl?: string | null;
            };
            output?: unknown;
            rawResponse?: unknown;
            derived?: Record<string, unknown>;
            error?: string;
        }>;
        metrics?: Record<string, unknown>;
        error?: string;
    }>;
    finalRecommendation: {
        decision?: "PASS" | "NEEDS_REVISION" | "REJECT";
        riskLevel?: string;
        summary: string;
    } | null;
    reviewPersistence: {
        status: "SAVED" | "SKIPPED" | "FAILED";
        message: string;
        reviewId?: string;
        decision?: "PASS" | "NEEDS_REVISION" | "REJECT";
        comment?: string;
        questionStatus?: "APPROVED" | "REJECTED";
    } | null;
};

type RunnerRun = {
    id: string;
    status: string;
    errorMessage: string | null;
    createdAt: string;
    finishedAt: string | null;
    strategy: {
        id: string;
        name: string;
        code: string;
    };
    triggeredByName: string;
    parsedResult: StrategyRunResult | null;
};

function formatJson(value: unknown) {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function areRunsEqual(left: unknown, right: unknown) {
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}

export function AiReviewStrategyRunner({
    questionId,
    strategies,
    runs,
}: {
    questionId: string;
    strategies: Array<{
        id: string;
        name: string;
        code: string;
        description: string | null;
        stepCount: number;
        datasourceIds: string[];
    }>;
    runs: RunnerRun[];
}) {
    const router = useRouter();
    const { notification } = App.useApp();
    const notificationRef = useRef(notification);
    const [selectedStrategyId, setSelectedStrategyId] = useState(
        strategies[0]?.id ?? "",
    );
    const [liveRuns, setLiveRuns] = useState(runs);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pollingEnabled, setPollingEnabled] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [retryingKeys, setRetryingKeys] = useState<Record<string, boolean>>(
        {},
    );
    const [, startRetryTransition] = useTransition();
    const effectiveSelectedStrategyId = strategies.some(
        (strategy) => strategy.id === selectedStrategyId,
    )
        ? selectedStrategyId
        : (strategies[0]?.id ?? "");
    const hasActiveRun = liveRuns.some(
        (run) => run.status === "RUNNING" || run.status === "PENDING",
    );

    useEffect(() => {
        notificationRef.current = notification;
    }, [notification]);

    useEffect(() => {
        setLiveRuns((current) =>
            areRunsEqual(current, runs) ? current : runs,
        );
    }, [runs]);

    useEffect(() => {
        if (!pollingEnabled && !hasActiveRun) {
            return;
        }

        let disposed = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        async function loop() {
            try {
                const response = await fetch(
                    `/api/ai-review-strategy-runs?questionId=${questionId}`,
                    {
                        cache: "no-store",
                    },
                );
                const payload = (await response.json().catch(() => null)) as {
                    error?: string;
                    runs?: typeof runs;
                } | null;

                if (!response.ok) {
                    throw new Error(payload?.error ?? "获取运行状态失败。");
                }

                if (!disposed && payload?.runs) {
                    setLiveRuns(payload.runs);
                }
            } catch (error) {
                if (!disposed) {
                    notificationRef.current.error({
                        message: "获取运行状态失败",
                        description:
                            error instanceof Error
                                ? error.message
                                : "请稍后再试。",
                        placement: "topRight",
                    });
                }
            } finally {
                if (!disposed) {
                    timer = setTimeout(loop, 1500);
                }
            }
        }

        timer = setTimeout(loop, 400);

        return () => {
            disposed = true;
            if (timer) {
                clearTimeout(timer);
            }
        };
    }, [hasActiveRun, pollingEnabled, questionId]);

    async function refreshRuns(manual = false) {
        if (manual) {
            setIsRefreshing(true);
        }

        try {
            const response = await fetch(
                `/api/ai-review-strategy-runs?questionId=${questionId}`,
                {
                    cache: "no-store",
                },
            );
            const payload = (await response.json().catch(() => null)) as {
                error?: string;
                runs?: typeof runs;
            } | null;

            if (!response.ok) {
                throw new Error(payload?.error ?? "获取运行状态失败。");
            }

            setLiveRuns((current) =>
                areRunsEqual(current, payload?.runs ?? [])
                    ? current
                    : (payload?.runs ?? []),
            );
        } catch (error) {
            notification.error({
                message: "刷新结果失败",
                description:
                    error instanceof Error ? error.message : "请稍后再试。",
                placement: "topRight",
            });
        } finally {
            if (manual) {
                setIsRefreshing(false);
            }
        }
    }

    function getRunStatusMeta(status: string) {
        if (status === "SUCCESS") {
            return { color: "success" as const, label: "执行成功" };
        }

        if (status === "FAILED") {
            return { color: "error" as const, label: "执行失败" };
        }

        return { color: "processing" as const, label: "执行中" };
    }

    function getStepStatusColor(status: string) {
        if (status === "SUCCESS") {
            return "success";
        }

        if (status === "FAILED") {
            return "error";
        }

        if (status === "RUNNING") {
            return "processing";
        }

        return "default";
    }

    function buildRetryKey(runId: string, stepId: string, itemIndex: number) {
        return `${runId}:${stepId}:${itemIndex}`;
    }

    function replaceRun(run: RunnerRun) {
        setLiveRuns((current) =>
            current.map((item) => (item.id === run.id ? run : item)),
        );
    }

    async function runStrategy() {
        if (!effectiveSelectedStrategyId) {
            notification.warning({
                message: "请选择策略",
                description: "请先选择一条可执行的 AI 审核策略。",
                placement: "topRight",
            });
            return;
        }

        if (isRunning) {
            return;
        }

        setIsRunning(true);
        try {
            setPollingEnabled(true);
            notification.info({
                message: "AI 审核已启动",
                description: "正在持续刷新执行进度，结果会逐步展示。",
                placement: "topRight",
            });
            const result = await runAiReviewStrategyAction({
                strategyId: effectiveSelectedStrategyId,
                questionId,
            });

            await refreshRuns();

            if (result.error) {
                notification.error({
                    message: "AI 审核执行失败",
                    description: result.error,
                    placement: "topRight",
                });
                router.refresh();
                return;
            }

            notification.success({
                message: "AI 审核已完成",
                description: result.success,
                placement: "topRight",
            });
            router.refresh();
        } finally {
            setPollingEnabled(false);
            setIsRunning(false);
        }
    }

    function retryRunItem(runId: string, stepId: string, itemIndex: number) {
        const retryKey = buildRetryKey(runId, stepId, itemIndex);

        if (retryingKeys[retryKey]) {
            return;
        }

        setRetryingKeys((current) => ({
            ...current,
            [retryKey]: true,
        }));

        startRetryTransition(async () => {
            try {
                const result = await retryAiReviewStrategyRunItemAction({
                    runId,
                    stepId,
                    itemIndex,
                });

                if (result.error) {
                    notification.error({
                        message: "重试失败",
                        description: result.error,
                        placement: "topRight",
                    });
                    return;
                }

                if (result.run) {
                    replaceRun(result.run);
                } else {
                    await refreshRuns();
                }

                notification.success({
                    message: "重试成功",
                    description: result.success ?? "失败请求已重新执行。",
                    placement: "topRight",
                });
            } finally {
                setRetryingKeys((current) => {
                    const next = { ...current };
                    delete next[retryKey];
                    return next;
                });
            }
        });
    }

    return (
        <section className="content-surface">
            <div className="section-head" style={{ marginBottom: 16 }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: 20, lineHeight: 1.1 }}>
                        AI 审核辅助
                    </h3>
                    <p
                        className="muted"
                        style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                    >
                        审核员可选择已配置的审核策略执行。AI
                        只提供结构化建议，最终结论仍由人工确认提交。
                    </p>
                </div>
            </div>

            {!strategies.length ? (
                <Empty description="当前项目没有可用的 AI 审核策略，请联系管理员先创建并绑定策略。" />
            ) : (
                <div style={{ display: "grid", gap: 16 }}>
                    <div className="review-toolbar">
                        <div
                            className="review-toolbar-field"
                            style={{ minWidth: 0, flex: 1 }}
                        >
                            <div className="review-toolbar-label">选择策略</div>
                            <Select
                                value={effectiveSelectedStrategyId}
                                onChange={(value) =>
                                    setSelectedStrategyId(value)
                                }
                                options={strategies.map((strategy) => ({
                                    value: strategy.id,
                                    label: `${strategy.name} · ${strategy.stepCount} 步`,
                                }))}
                                size="large"
                                style={{ width: "100%" }}
                            />
                        </div>
                        <div className="review-toolbar-actions">
                            <Button
                                icon={<RefreshCcw size={16} />}
                                loading={isRefreshing}
                                onClick={() => refreshRuns(true)}
                            >
                                刷新结果
                            </Button>
                            <Button
                                type="primary"
                                icon={<Play size={16} />}
                                loading={isRunning}
                                onClick={runStrategy}
                            >
                                启动运行
                            </Button>
                        </div>
                    </div>

                    {strategies
                        .filter(
                            (strategy) =>
                                strategy.id === effectiveSelectedStrategyId,
                        )
                        .map((strategy) => (
                            <div key={strategy.id} className="workspace-tip">
                                <Bot size={18} />
                                <div>
                                    <div style={{ fontWeight: 600 }}>
                                        {strategy.name} ({strategy.code})
                                    </div>
                                    <div
                                        className="muted"
                                        style={{ marginTop: 4 }}
                                    >
                                        {strategy.description ||
                                            "当前策略未填写说明。"}
                                    </div>
                                </div>
                            </div>
                        ))}

                    {liveRuns.length ? (
                        <div className="strategy-run-stack">
                            {liveRuns.map((run) => {
                                const runStatusMeta = getRunStatusMeta(
                                    run.status,
                                );

                                return (
                                    <div
                                        key={run.id}
                                        className="strategy-run-card"
                                    >
                                        <div className="strategy-run-head">
                                            <div>
                                                <div className="strategy-title-row">
                                                    <h4
                                                        style={{
                                                            margin: 0,
                                                            fontSize: 17,
                                                        }}
                                                    >
                                                        {run.strategy.name}
                                                    </h4>
                                                    <Tag>
                                                        {run.strategy.code}
                                                    </Tag>
                                                    <Tag
                                                        color={
                                                            runStatusMeta.color
                                                        }
                                                    >
                                                        {runStatusMeta.label}
                                                    </Tag>
                                                </div>
                                                <div
                                                    className="muted"
                                                    style={{ marginTop: 8 }}
                                                >
                                                    执行人：
                                                    {run.triggeredByName} ·
                                                    发起时间{" "}
                                                    {new Date(
                                                        run.createdAt,
                                                    ).toLocaleString("zh-CN")}
                                                </div>
                                            </div>
                                        </div>

                                        {run.parsedResult
                                            ?.finalRecommendation ? (
                                            <div className="strategy-run-summary">
                                                <div className="strategy-run-summary-title">
                                                    审核建议
                                                </div>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        gap: 8,
                                                        flexWrap: "wrap",
                                                        marginTop: 8,
                                                    }}
                                                >
                                                    {run.parsedResult
                                                        .finalRecommendation
                                                        .decision ? (
                                                        <Tag color="blue">
                                                            {
                                                                run.parsedResult
                                                                    .finalRecommendation
                                                                    .decision
                                                            }
                                                        </Tag>
                                                    ) : null}
                                                    {run.parsedResult
                                                        .finalRecommendation
                                                        .riskLevel ? (
                                                        <Tag color="orange">
                                                            风险{" "}
                                                            {
                                                                run.parsedResult
                                                                    .finalRecommendation
                                                                    .riskLevel
                                                            }
                                                        </Tag>
                                                    ) : null}
                                                </div>
                                                <div
                                                    style={{
                                                        marginTop: 10,
                                                        lineHeight: 1.7,
                                                    }}
                                                >
                                                    {
                                                        run.parsedResult
                                                            .finalRecommendation
                                                            .summary
                                                    }
                                                </div>
                                            </div>
                                        ) : null}

                                        {run.parsedResult?.reviewPersistence ? (
                                            <div className="strategy-run-summary">
                                                <div className="strategy-run-summary-title">
                                                    自动审核回填
                                                </div>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        gap: 8,
                                                        flexWrap: "wrap",
                                                        marginTop: 8,
                                                    }}
                                                >
                                                    <Tag
                                                        color={
                                                            run.parsedResult
                                                                .reviewPersistence
                                                                .status ===
                                                            "SAVED"
                                                                ? "success"
                                                                : run
                                                                        .parsedResult
                                                                        .reviewPersistence
                                                                        .status ===
                                                                    "FAILED"
                                                                  ? "error"
                                                                  : "default"
                                                        }
                                                    >
                                                        {
                                                            run.parsedResult
                                                                .reviewPersistence
                                                                .status
                                                        }
                                                    </Tag>
                                                    {run.parsedResult
                                                        .reviewPersistence
                                                        .decision ? (
                                                        <Tag color="blue">
                                                            {
                                                                run.parsedResult
                                                                    .reviewPersistence
                                                                    .decision
                                                            }
                                                        </Tag>
                                                    ) : null}
                                                    {run.parsedResult
                                                        .reviewPersistence
                                                        .questionStatus ? (
                                                        <Tag color="purple">
                                                            题目状态{" "}
                                                            {
                                                                run.parsedResult
                                                                    .reviewPersistence
                                                                    .questionStatus
                                                            }
                                                        </Tag>
                                                    ) : null}
                                                </div>
                                                <div
                                                    style={{
                                                        marginTop: 10,
                                                        lineHeight: 1.7,
                                                    }}
                                                >
                                                    {
                                                        run.parsedResult
                                                            .reviewPersistence
                                                            .message
                                                    }
                                                </div>
                                                {run.parsedResult
                                                    .reviewPersistence
                                                    .comment ? (
                                                    <pre className="strategy-json-block">
                                                        {
                                                            run.parsedResult
                                                                .reviewPersistence
                                                                .comment
                                                        }
                                                    </pre>
                                                ) : null}
                                            </div>
                                        ) : null}

                                        {run.errorMessage ? (
                                            <div className="strategy-run-error">
                                                {run.errorMessage}
                                            </div>
                                        ) : null}

                                        {run.parsedResult?.stepResults
                                            ?.length ? (
                                            <div className="strategy-step-stack">
                                                {run.parsedResult.stepResults.map(
                                                    (step, index) => (
                                                        <div
                                                            key={`${run.id}-${step.stepId}`}
                                                            className="strategy-step-preview"
                                                        >
                                                            <div className="strategy-step-index">
                                                                {index + 1}
                                                            </div>
                                                            <div
                                                                style={{
                                                                    minWidth: 0,
                                                                    flex: 1,
                                                                }}
                                                            >
                                                                <div className="strategy-step-title">
                                                                    {
                                                                        step.stepName
                                                                    }
                                                                    <Tag>
                                                                        {
                                                                            step.stepType
                                                                        }
                                                                    </Tag>
                                                                    <Tag
                                                                        color={getStepStatusColor(
                                                                            step.status,
                                                                        )}
                                                                    >
                                                                        {
                                                                            step.status
                                                                        }
                                                                    </Tag>
                                                                    {step.outcomeLabel ? (
                                                                        <Tag color="gold">
                                                                            {
                                                                                step.outcomeLabel
                                                                            }
                                                                        </Tag>
                                                                    ) : null}
                                                                </div>
                                                                <div className="muted strategy-step-copy">
                                                                    {
                                                                        step.summary
                                                                    }
                                                                </div>
                                                                {step.metrics ? (
                                                                    <div
                                                                        className="strategy-tag-wrap"
                                                                        style={{
                                                                            marginTop: 8,
                                                                        }}
                                                                    >
                                                                        {Object.entries(
                                                                            step.metrics,
                                                                        ).map(
                                                                            ([
                                                                                key,
                                                                                value,
                                                                            ]) => (
                                                                                <Tag
                                                                                    key={
                                                                                        key
                                                                                    }
                                                                                >
                                                                                    {
                                                                                        key
                                                                                    }

                                                                                    :{" "}
                                                                                    {typeof value ===
                                                                                    "number"
                                                                                        ? value
                                                                                              .toFixed(
                                                                                                  4,
                                                                                              )
                                                                                              .replace(
                                                                                                  /\.?0+$/,
                                                                                                  "",
                                                                                              )
                                                                                        : String(
                                                                                              value,
                                                                                          )}
                                                                                </Tag>
                                                                            ),
                                                                        )}
                                                                    </div>
                                                                ) : null}
                                                                {step.items.some(
                                                                    (item) =>
                                                                        item.error,
                                                                ) ? (
                                                                    <div className="strategy-run-inline-errors">
                                                                        {step.items
                                                                            .filter(
                                                                                (
                                                                                    item,
                                                                                ) =>
                                                                                    item.error,
                                                                            )
                                                                            .map(
                                                                                (
                                                                                    item,
                                                                                ) => (
                                                                                    <div
                                                                                        key={`${step.stepId}-${item.index}`}
                                                                                        className="muted"
                                                                                    >
                                                                                        第{" "}
                                                                                        {
                                                                                            item.index
                                                                                        }{" "}
                                                                                        次执行失败：
                                                                                        {
                                                                                            item.error
                                                                                        }
                                                                                    </div>
                                                                                ),
                                                                            )}
                                                                    </div>
                                                                ) : null}

                                                                {step.items
                                                                    .length ? (
                                                                    <div className="strategy-step-item-list">
                                                                        {step.items.map(
                                                                            (
                                                                                item,
                                                                            ) => (
                                                                                <details
                                                                                    key={`${step.stepId}-${item.index}`}
                                                                                    className="strategy-step-item-detail"
                                                                                >
                                                                                    <summary className="strategy-step-item-summary">
                                                                                        <span>
                                                                                            第{" "}
                                                                                            {
                                                                                                item.index
                                                                                            }{" "}
                                                                                            次
                                                                                        </span>
                                                                                        <Space
                                                                                            size={
                                                                                                8
                                                                                            }
                                                                                        >
                                                                                            <Tag
                                                                                                color={
                                                                                                    item.status ===
                                                                                                    "SUCCESS"
                                                                                                        ? "success"
                                                                                                        : "error"
                                                                                                }
                                                                                            >
                                                                                                {
                                                                                                    item.status
                                                                                                }
                                                                                            </Tag>
                                                                                            {item.status ===
                                                                                                "FAILED" &&
                                                                                            run.status !==
                                                                                                "RUNNING" &&
                                                                                            run.status !==
                                                                                                "PENDING" ? (
                                                                                                <Button
                                                                                                    size="small"
                                                                                                    type="link"
                                                                                                    icon={
                                                                                                        <RefreshCcw
                                                                                                            size={
                                                                                                                14
                                                                                                            }
                                                                                                        />
                                                                                                    }
                                                                                                    loading={
                                                                                                        retryingKeys[
                                                                                                            buildRetryKey(
                                                                                                                run.id,
                                                                                                                step.stepId,
                                                                                                                item.index,
                                                                                                            )
                                                                                                        ]
                                                                                                    }
                                                                                                    onClick={(
                                                                                                        event,
                                                                                                    ) => {
                                                                                                        event.preventDefault();
                                                                                                        event.stopPropagation();
                                                                                                        retryRunItem(
                                                                                                            run.id,
                                                                                                            step.stepId,
                                                                                                            item.index,
                                                                                                        );
                                                                                                    }}
                                                                                                >
                                                                                                    重试这次
                                                                                                </Button>
                                                                                            ) : null}
                                                                                        </Space>
                                                                                    </summary>
                                                                                    <div className="strategy-step-item-body">
                                                                                        {item.requestMeta ? (
                                                                                            <div>
                                                                                                <div className="strategy-run-summary-title">
                                                                                                    调用信息
                                                                                                </div>
                                                                                                <div
                                                                                                    className="strategy-tag-wrap"
                                                                                                    style={{
                                                                                                        marginTop: 10,
                                                                                                    }}
                                                                                                >
                                                                                                    <Tag>
                                                                                                        模型:{" "}
                                                                                                        {
                                                                                                            item
                                                                                                                .requestMeta
                                                                                                                .modelCode
                                                                                                        }
                                                                                                    </Tag>
                                                                                                    {item
                                                                                                        .requestMeta
                                                                                                        .protocol ? (
                                                                                                        <Tag>
                                                                                                            协议:{" "}
                                                                                                            {
                                                                                                                item
                                                                                                                    .requestMeta
                                                                                                                    .protocol
                                                                                                            }
                                                                                                        </Tag>
                                                                                                    ) : null}
                                                                                                    {item
                                                                                                        .requestMeta
                                                                                                        .providerName ? (
                                                                                                        <Tag>
                                                                                                            提供商:{" "}
                                                                                                            {
                                                                                                                item
                                                                                                                    .requestMeta
                                                                                                                    .providerName
                                                                                                            }
                                                                                                        </Tag>
                                                                                                    ) : null}
                                                                                                    {item
                                                                                                        .requestMeta
                                                                                                        .providerCode ? (
                                                                                                        <Tag>
                                                                                                            Provider
                                                                                                            Code:{" "}
                                                                                                            {
                                                                                                                item
                                                                                                                    .requestMeta
                                                                                                                    .providerCode
                                                                                                            }
                                                                                                        </Tag>
                                                                                                    ) : null}
                                                                                                    {item
                                                                                                        .requestMeta
                                                                                                        .endpointLabel ? (
                                                                                                        <Tag>
                                                                                                            路由:{" "}
                                                                                                            {
                                                                                                                item
                                                                                                                    .requestMeta
                                                                                                                    .endpointLabel
                                                                                                            }
                                                                                                        </Tag>
                                                                                                    ) : null}
                                                                                                    {item
                                                                                                        .requestMeta
                                                                                                        .endpointCode ? (
                                                                                                        <Tag>
                                                                                                            Endpoint
                                                                                                            Code:{" "}
                                                                                                            {
                                                                                                                item
                                                                                                                    .requestMeta
                                                                                                                    .endpointCode
                                                                                                            }
                                                                                                        </Tag>
                                                                                                    ) : null}
                                                                                                    {item
                                                                                                        .requestMeta
                                                                                                        .reasoningLevel ? (
                                                                                                        <Tag>
                                                                                                            推理:{" "}
                                                                                                            {
                                                                                                                item
                                                                                                                    .requestMeta
                                                                                                                    .reasoningLevel
                                                                                                            }
                                                                                                        </Tag>
                                                                                                    ) : null}
                                                                                                </div>
                                                                                                {item
                                                                                                    .requestMeta
                                                                                                    .baseUrl ? (
                                                                                                    <pre className="strategy-json-block">
                                                                                                        {
                                                                                                            item
                                                                                                                .requestMeta
                                                                                                                .baseUrl
                                                                                                        }
                                                                                                    </pre>
                                                                                                ) : null}
                                                                                            </div>
                                                                                        ) : null}

                                                                                        {item.derived &&
                                                                                        Object.keys(
                                                                                            item.derived,
                                                                                        )
                                                                                            .length ? (
                                                                                            <div className="strategy-tag-wrap">
                                                                                                {Object.entries(
                                                                                                    item.derived,
                                                                                                ).map(
                                                                                                    ([
                                                                                                        key,
                                                                                                        value,
                                                                                                    ]) => (
                                                                                                        <Tag
                                                                                                            key={
                                                                                                                key
                                                                                                            }
                                                                                                        >
                                                                                                            {
                                                                                                                key
                                                                                                            }

                                                                                                            :{" "}
                                                                                                            {typeof value ===
                                                                                                            "number"
                                                                                                                ? value
                                                                                                                      .toFixed(
                                                                                                                          4,
                                                                                                                      )
                                                                                                                      .replace(
                                                                                                                          /\.?0+$/,
                                                                                                                          "",
                                                                                                                      )
                                                                                                                : String(
                                                                                                                      value,
                                                                                                                  )}
                                                                                                        </Tag>
                                                                                                    ),
                                                                                                )}
                                                                                            </div>
                                                                                        ) : null}

                                                                                        {item.promptInput ? (
                                                                                            <div>
                                                                                                <div className="strategy-run-summary-title">
                                                                                                    请求输入
                                                                                                </div>
                                                                                                <pre className="strategy-json-block">
                                                                                                    {formatJson(
                                                                                                        item.promptInput,
                                                                                                    )}
                                                                                                </pre>
                                                                                            </div>
                                                                                        ) : null}

                                                                                        {item.output ? (
                                                                                            <div>
                                                                                                <div className="strategy-run-summary-title">
                                                                                                    结构化输出
                                                                                                </div>
                                                                                                <pre className="strategy-json-block">
                                                                                                    {formatJson(
                                                                                                        item.output,
                                                                                                    )}
                                                                                                </pre>
                                                                                            </div>
                                                                                        ) : null}

                                                                                        {item.rawResponse ? (
                                                                                            <div>
                                                                                                <div className="strategy-run-summary-title">
                                                                                                    原始响应
                                                                                                </div>
                                                                                                <pre className="strategy-json-block">
                                                                                                    {formatJson(
                                                                                                        item.rawResponse,
                                                                                                    )}
                                                                                                </pre>
                                                                                            </div>
                                                                                        ) : null}

                                                                                        {item.error ? (
                                                                                            <div className="strategy-run-error">
                                                                                                {
                                                                                                    item.error
                                                                                                }
                                                                                            </div>
                                                                                        ) : null}
                                                                                    </div>
                                                                                </details>
                                                                            ),
                                                                        )}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    ),
                                                )}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <Empty description="当前题目还没有执行过 AI 审核策略。" />
                    )}
                </div>
            )}
        </section>
    );
}
