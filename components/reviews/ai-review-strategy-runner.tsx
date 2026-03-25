"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Empty, Select, Space, Tag } from "antd";
import { Bot, Play, RefreshCcw } from "lucide-react";
import { runAiReviewStrategyAction } from "@/app/actions/ai-review-strategies";

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
    status: "SUCCESS" | "FAILED";
    stepResults: Array<{
        stepId: string;
        stepName: string;
        stepKind: "AI_TOOL" | "RULE";
        stepType: string;
        status: "SUCCESS" | "FAILED" | "SKIPPED";
        summary: string;
        outcomeLabel?: string;
        items: Array<{
            index: number;
            status: "SUCCESS" | "FAILED";
            sourceStepId?: string;
            output?: unknown;
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
};

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
    runs: Array<{
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
    }>;
}) {
    const router = useRouter();
    const { notification } = App.useApp();
    const [selectedStrategyId, setSelectedStrategyId] = useState(
        strategies[0]?.id ?? "",
    );
    const [isRunning, startRunning] = useTransition();
    const effectiveSelectedStrategyId = strategies.some(
        (strategy) => strategy.id === selectedStrategyId,
    )
        ? selectedStrategyId
        : (strategies[0]?.id ?? "");

    function runStrategy() {
        if (!effectiveSelectedStrategyId) {
            notification.warning({
                message: "请选择策略",
                description: "请先选择一条可执行的 AI 审核策略。",
                placement: "topRight",
            });
            return;
        }

        startRunning(async () => {
            const result = await runAiReviewStrategyAction({
                strategyId: effectiveSelectedStrategyId,
                questionId,
            });

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
                                onClick={() => router.refresh()}
                            >
                                刷新结果
                            </Button>
                            <Button
                                type="primary"
                                icon={<Play size={16} />}
                                loading={isRunning}
                                onClick={runStrategy}
                            >
                                执行策略
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

                    {runs.length ? (
                        <div className="strategy-run-stack">
                            {runs.map((run) => (
                                <div key={run.id} className="strategy-run-card">
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
                                                <Tag>{run.strategy.code}</Tag>
                                                <Tag
                                                    color={
                                                        run.status === "SUCCESS"
                                                            ? "success"
                                                            : "error"
                                                    }
                                                >
                                                    {run.status === "SUCCESS"
                                                        ? "执行成功"
                                                        : "执行失败"}
                                                </Tag>
                                            </div>
                                            <div
                                                className="muted"
                                                style={{ marginTop: 8 }}
                                            >
                                                执行人：{run.triggeredByName} ·
                                                发起时间{" "}
                                                {new Date(
                                                    run.createdAt,
                                                ).toLocaleString("zh-CN")}
                                            </div>
                                        </div>
                                    </div>

                                    {run.parsedResult?.finalRecommendation ? (
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

                                    {run.errorMessage ? (
                                        <div className="strategy-run-error">
                                            {run.errorMessage}
                                        </div>
                                    ) : null}

                                    {run.parsedResult?.stepResults?.length ? (
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
                                                                {step.stepName}
                                                                <Tag>
                                                                    {
                                                                        step.stepType
                                                                    }
                                                                </Tag>
                                                                <Tag
                                                                    color={
                                                                        step.status ===
                                                                        "SUCCESS"
                                                                            ? "success"
                                                                            : step.status ===
                                                                                "FAILED"
                                                                              ? "error"
                                                                              : "default"
                                                                    }
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
                                                                {step.summary}
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
                                                        </div>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty description="当前题目还没有执行过 AI 审核策略。" />
                    )}
                </div>
            )}
        </section>
    );
}
