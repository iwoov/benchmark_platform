"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Empty, Modal, Select, Space, Tag } from "antd";
import { Bot, ChevronDown, Code, Play, RefreshCcw } from "lucide-react";
import {
    runAiReviewStrategyAction,
    retryAiReviewStrategyRunItemAction,
} from "@/app/actions/ai-review-strategies";
import type { AiReviewStrategyRetryStateView } from "@/lib/ai/review-strategy-batches";

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
        decision?: "PASS" | "REJECT";
        riskLevel?: string;
        summary: string;
    } | null;
    reviewPersistence: {
        status: "SAVED" | "SKIPPED" | "FAILED";
        message: string;
        reviewId?: string;
        decision?: "PASS" | "REJECT";
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

type RetryState = AiReviewStrategyRetryStateView;

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

type RawDataModalState = {
    title: string;
    promptInput: unknown;
    output: unknown;
    rawResponse: unknown;
} | null;

function getSeverityColor(severity: string) {
    if (severity === "HIGH") return "error";
    if (severity === "MEDIUM") return "warning";
    return "default";
}

function getPassedColor(passed: boolean) {
    return passed ? "success" : "error";
}

function getDecisionColor(decision: string) {
    if (decision === "PASS") return "success";
    if (decision === "REJECT") return "error";
    return "warning";
}

function getMatchLevelColor(level: string) {
    if (level === "EXACT" || level === "SEMANTIC_MATCH") return "success";
    if (level === "PARTIAL_MATCH") return "warning";
    if (level === "MISMATCH") return "error";
    return "default";
}

function RenderStringList({
    label,
    items,
    color,
}: {
    label: string;
    items: string[];
    color?: string;
}) {
    if (!items.length) return null;

    return (
        <div style={{ marginTop: 8 }}>
            <div
                style={{
                    fontSize: 12,
                    fontWeight: 600,
                    marginBottom: 4,
                    color: "var(--color-text-secondary)",
                }}
            >
                {label}
            </div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
                {items.map((item, index) => (
                    <li
                        key={index}
                        style={{
                            lineHeight: 1.7,
                            fontSize: 13,
                            color: color ?? undefined,
                        }}
                    >
                        {item}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function getStepItemInlineTags(
    stepType: string,
    output: unknown,
): Array<{ label: string; color: string }> {
    if (!output || typeof output !== "object") return [];
    const data = output as Record<string, unknown>;

    switch (stepType) {
        case "COMPREHENSIVE_CHECK":
            return [
                {
                    label: data.passed ? "通过" : "未通过",
                    color: data.passed ? "success" : "error",
                },
            ];

        case "QUESTION_COMPLETENESS_CHECK":
            return [
                {
                    label: data.passed ? "完整" : "不完整",
                    color: data.passed ? "success" : "error",
                },
            ];

        case "TEXT_QUALITY_CHECK":
            return [
                {
                    label: data.passed ? "通过" : "未通过",
                    color: data.passed ? "success" : "error",
                },
                ...(data.severity
                    ? [
                          {
                              label: String(data.severity),
                              color: getSeverityColor(String(data.severity)),
                          },
                      ]
                    : []),
            ];

        case "TRANSLATE_TO_CHINESE":
            return data.sourceLanguage
                ? [
                      {
                          label: `源语言: ${String(data.sourceLanguage)}`,
                          color: "default",
                      },
                  ]
                : [];

        case "AI_SOLVE_QUESTION": {
            const tags: Array<{ label: string; color: string }> = [];
            const answer = data.normalizedAnswer ?? data.answer;
            if (answer) {
                tags.push({
                    label: `答案: ${String(answer)}`,
                    color: "blue",
                });
            }
            if (typeof data.confidence === "number") {
                tags.push({
                    label: `置信度: ${(data.confidence * 100).toFixed(0)}%`,
                    color:
                        data.confidence >= 0.8
                            ? "success"
                            : data.confidence >= 0.5
                              ? "warning"
                              : "error",
                });
            }
            return tags;
        }

        case "ANSWER_MATCH_CHECK":
            return [
                {
                    label: String(data.matchLevel ?? ""),
                    color: getMatchLevelColor(String(data.matchLevel ?? "")),
                },
                {
                    label: data.isConsistent ? "一致" : "不一致",
                    color: data.isConsistent ? "success" : "error",
                },
            ];

        case "REASONING_COMPARE":
            return [
                {
                    label: data.isConsistent ? "推理一致" : "推理不一致",
                    color: data.isConsistent ? "success" : "error",
                },
                ...(data.riskLevel
                    ? [
                          {
                              label: `风险: ${String(data.riskLevel)}`,
                              color: getSeverityColor(String(data.riskLevel)),
                          },
                      ]
                    : []),
            ];

        case "DIFFICULTY_EVALUATION":
            return [
                ...(data.difficultyLevel
                    ? [
                          {
                              label: `难度: ${String(data.difficultyLevel)}`,
                              color: "blue",
                          },
                      ]
                    : []),
                ...(typeof data.score === "number"
                    ? [{ label: `${data.score}/5`, color: "default" }]
                    : []),
            ];

        case "REVIEW_SUMMARY":
            return [
                ...(data.recommendedDecision
                    ? [
                          {
                              label: String(data.recommendedDecision),
                              color: getDecisionColor(
                                  String(data.recommendedDecision),
                              ),
                          },
                      ]
                    : []),
                ...(data.riskLevel
                    ? [
                          {
                              label: `风险: ${String(data.riskLevel)}`,
                              color: getSeverityColor(String(data.riskLevel)),
                          },
                      ]
                    : []),
            ];

        default:
            return [];
    }
}

function renderStepItemOutput(stepType: string, output: unknown) {
    if (!output || typeof output !== "object") return null;
    const data = output as Record<string, unknown>;

    switch (stepType) {
        case "COMPREHENSIVE_CHECK":
            return (
                <div className="step-output-rendered">
                    <div className="step-output-row">
                        <Tag color={getPassedColor(data.passed as boolean)}>
                            {data.passed ? "通过" : "未通过"}
                        </Tag>
                    </div>
                    <div className="step-output-summary">
                        {String(data.summary ?? "")}
                    </div>
                    {Array.isArray(data.issues) && data.issues.length > 0 ? (
                        <div style={{ marginTop: 8 }}>
                            <div className="step-output-section-label">
                                问题
                            </div>
                            {(
                                data.issues as Array<Record<string, unknown>>
                            ).map((issue, i) => (
                                <div key={i} className="step-output-issue">
                                    <div className="step-output-issue-head">
                                        <Tag
                                            color={getSeverityColor(
                                                String(issue.severity ?? ""),
                                            )}
                                        >
                                            {String(issue.severity ?? "")}
                                        </Tag>
                                        <span style={{ fontWeight: 600 }}>
                                            {String(issue.title ?? "")}
                                        </span>
                                        <span
                                            className="muted"
                                            style={{ fontSize: 12 }}
                                        >
                                            [{String(issue.category ?? "")}
                                            &middot; {String(issue.field ?? "")}
                                            ]
                                        </span>
                                    </div>
                                    <div className="step-output-issue-detail">
                                        {String(issue.detail ?? "")}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    <RenderStringList
                        label="警告"
                        items={(data.warnings as string[]) ?? []}
                    />
                    <RenderStringList
                        label="建议"
                        items={(data.suggestions as string[]) ?? []}
                    />
                </div>
            );

        case "QUESTION_COMPLETENESS_CHECK":
            return (
                <div className="step-output-rendered">
                    <div className="step-output-row">
                        <Tag color={getPassedColor(data.passed as boolean)}>
                            {data.passed ? "完整" : "不完整"}
                        </Tag>
                    </div>
                    <div className="step-output-summary">
                        {String(data.summary ?? "")}
                    </div>
                    <RenderStringList
                        label="缺失字段"
                        items={(data.missingFields as string[]) ?? []}
                    />
                    <RenderStringList
                        label="警告"
                        items={(data.warnings as string[]) ?? []}
                    />
                </div>
            );

        case "TEXT_QUALITY_CHECK":
            return (
                <div className="step-output-rendered">
                    <div className="step-output-row">
                        <Tag color={getPassedColor(data.passed as boolean)}>
                            {data.passed ? "通过" : "未通过"}
                        </Tag>
                        <Tag
                            color={getSeverityColor(
                                String(data.severity ?? ""),
                            )}
                        >
                            严重程度: {String(data.severity ?? "")}
                        </Tag>
                    </div>
                    <div className="step-output-summary">
                        {String(data.summary ?? "")}
                    </div>
                    {Array.isArray(data.issues) && data.issues.length > 0 ? (
                        <div style={{ marginTop: 8 }}>
                            <div className="step-output-section-label">
                                问题
                            </div>
                            {(
                                data.issues as Array<Record<string, unknown>>
                            ).map((issue, i) => (
                                <div key={i} className="step-output-issue">
                                    <div className="step-output-issue-head">
                                        <Tag>{String(issue.type ?? "")}</Tag>
                                        <span
                                            className="muted"
                                            style={{ fontSize: 12 }}
                                        >
                                            字段: {String(issue.field ?? "")}
                                        </span>
                                    </div>
                                    <div className="step-output-issue-detail">
                                        {String(issue.content ?? "")}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    <RenderStringList
                        label="建议"
                        items={(data.suggestions as string[]) ?? []}
                    />
                </div>
            );

        case "TRANSLATE_TO_CHINESE":
            return (
                <div className="step-output-rendered">
                    {data.sourceLanguage ? (
                        <div className="step-output-row">
                            <Tag>源语言: {String(data.sourceLanguage)}</Tag>
                        </div>
                    ) : null}
                    <div className="step-output-summary">
                        {String(data.summary ?? "")}
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <div className="step-output-section-label">
                            翻译结果
                        </div>
                        <div
                            style={{
                                background: "var(--color-surface-2, #f5f5f5)",
                                padding: "10px 14px",
                                borderRadius: 6,
                                lineHeight: 1.7,
                                whiteSpace: "pre-wrap",
                            }}
                        >
                            {String(data.translatedText ?? "")}
                        </div>
                    </div>
                </div>
            );

        case "AI_SOLVE_QUESTION":
            return (
                <div className="step-output-rendered">
                    <div className="step-output-row">
                        <Tag color="blue">
                            答案:{" "}
                            {String(data.normalizedAnswer ?? data.answer ?? "")}
                        </Tag>
                        {typeof data.confidence === "number" ? (
                            <Tag
                                color={
                                    data.confidence >= 0.8
                                        ? "success"
                                        : data.confidence >= 0.5
                                          ? "warning"
                                          : "error"
                                }
                            >
                                置信度: {(data.confidence * 100).toFixed(0)}%
                            </Tag>
                        ) : null}
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <div className="step-output-section-label">
                            推理过程
                        </div>
                        <div
                            style={{
                                background: "var(--color-surface-2, #f5f5f5)",
                                padding: "10px 14px",
                                borderRadius: 6,
                                lineHeight: 1.7,
                                whiteSpace: "pre-wrap",
                                fontSize: 13,
                            }}
                        >
                            {String(data.reasoning ?? "")}
                        </div>
                    </div>
                </div>
            );

        case "ANSWER_MATCH_CHECK":
            return (
                <div className="step-output-rendered">
                    <div className="step-output-row">
                        <Tag
                            color={getMatchLevelColor(
                                String(data.matchLevel ?? ""),
                            )}
                        >
                            匹配: {String(data.matchLevel ?? "")}
                        </Tag>
                        <Tag color={data.isConsistent ? "success" : "error"}>
                            {data.isConsistent ? "一致" : "不一致"}
                        </Tag>
                    </div>
                    <div className="step-output-summary">
                        {String(data.summary ?? "")}
                    </div>
                    {data.difference ? (
                        <div style={{ marginTop: 8 }}>
                            <div className="step-output-section-label">
                                差异说明
                            </div>
                            <div className="step-output-issue-detail">
                                {String(data.difference)}
                            </div>
                        </div>
                    ) : null}
                </div>
            );

        case "REASONING_COMPARE":
            return (
                <div className="step-output-rendered">
                    <div className="step-output-row">
                        <Tag color={data.isConsistent ? "success" : "error"}>
                            {data.isConsistent ? "推理一致" : "推理不一致"}
                        </Tag>
                        <Tag
                            color={getSeverityColor(
                                String(data.riskLevel ?? ""),
                            )}
                        >
                            风险: {String(data.riskLevel ?? "")}
                        </Tag>
                    </div>
                    <div className="step-output-summary">
                        {String(data.summary ?? "")}
                    </div>
                    <RenderStringList
                        label="缺失要点"
                        items={(data.missingPoints as string[]) ?? []}
                    />
                </div>
            );

        case "DIFFICULTY_EVALUATION":
            return (
                <div className="step-output-rendered">
                    <div className="step-output-row">
                        <Tag color="blue">
                            难度: {String(data.difficultyLevel ?? "")}
                        </Tag>
                        {typeof data.score === "number" ? (
                            <Tag>评分: {data.score}/5</Tag>
                        ) : null}
                    </div>
                    <div className="step-output-summary">
                        {String(data.summary ?? "")}
                    </div>
                    <RenderStringList
                        label="依据"
                        items={(data.evidence as string[]) ?? []}
                    />
                </div>
            );

        case "REVIEW_SUMMARY":
            return (
                <div className="step-output-rendered">
                    <div className="step-output-row">
                        {data.recommendedDecision ? (
                            <Tag
                                color={getDecisionColor(
                                    String(data.recommendedDecision),
                                )}
                            >
                                建议: {String(data.recommendedDecision)}
                            </Tag>
                        ) : null}
                        {data.riskLevel ? (
                            <Tag
                                color={getSeverityColor(String(data.riskLevel))}
                            >
                                风险: {String(data.riskLevel)}
                            </Tag>
                        ) : null}
                    </div>
                    <div className="step-output-summary">
                        {String(data.summary ?? "")}
                    </div>
                    <RenderStringList
                        label="关键问题"
                        items={(data.keyIssues as string[]) ?? []}
                    />
                </div>
            );

        default:
            return (
                <pre className="strategy-json-block">{formatJson(output)}</pre>
            );
    }
}

const CORE_STEP_TYPES = new Set([
    "COMPREHENSIVE_CHECK",
    "AI_SOLVE_QUESTION",
    "REVIEW_SUMMARY",
]);

function isCoreStep(stepType: string) {
    return CORE_STEP_TYPES.has(stepType);
}

export function AiReviewStrategyRunner({
    questionId,
    strategies,
    runs,
    retryStates,
    hideHeader,
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
    retryStates: RetryState[];
    hideHeader?: boolean;
}) {
    const router = useRouter();
    const { notification } = App.useApp();
    const notificationRef = useRef(notification);
    const [selectedStrategyId, setSelectedStrategyId] = useState(
        strategies[0]?.id ?? "",
    );
    const [liveRuns, setLiveRuns] = useState(runs);
    const [liveRetryStates, setLiveRetryStates] = useState(retryStates);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pollingEnabled, setPollingEnabled] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [retryingKeys, setRetryingKeys] = useState<Record<string, boolean>>(
        {},
    );
    const [rawDataModal, setRawDataModal] = useState<RawDataModalState>(null);
    const [, startRetryTransition] = useTransition();
    const effectiveSelectedStrategyId = strategies.some(
        (strategy) => strategy.id === selectedStrategyId,
    )
        ? selectedStrategyId
        : (strategies[0]?.id ?? "");
    const hasActiveRun = liveRuns.some(
        (run) => run.status === "RUNNING" || run.status === "PENDING",
    );
    const hasActiveRetry = liveRetryStates.some(
        (state) => state.status === "RUNNING" || state.status === "PENDING",
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
        setLiveRetryStates((current) =>
            areRunsEqual(current, retryStates) ? current : retryStates,
        );
    }, [retryStates]);

    useEffect(() => {
        if (!hasActiveRun && !hasActiveRetry) {
            setPollingEnabled(false);
        }
    }, [hasActiveRetry, hasActiveRun]);

    useEffect(() => {
        if (!pollingEnabled && !hasActiveRun && !hasActiveRetry) {
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
                    retryStates?: RetryState[];
                } | null;

                if (!response.ok) {
                    throw new Error(payload?.error ?? "获取运行状态失败。");
                }

                if (!disposed && payload?.runs) {
                    setLiveRuns(payload.runs);
                }

                if (!disposed) {
                    setLiveRetryStates(payload?.retryStates ?? []);
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
    }, [hasActiveRetry, hasActiveRun, pollingEnabled, questionId]);

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
                retryStates?: RetryState[];
            } | null;

            if (!response.ok) {
                throw new Error(payload?.error ?? "获取运行状态失败。");
            }

            setLiveRuns((current) =>
                areRunsEqual(current, payload?.runs ?? [])
                    ? current
                    : (payload?.runs ?? []),
            );
            setLiveRetryStates((current) =>
                areRunsEqual(current, payload?.retryStates ?? [])
                    ? current
                    : (payload?.retryStates ?? []),
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

    function buildRetryKey(runId: string, stepId: string, itemIndex: number) {
        return `${runId}:${stepId}:${itemIndex}`;
    }

    function getRetryState(runId: string, stepId: string, itemIndex: number) {
        const key = buildRetryKey(runId, stepId, itemIndex);
        return liveRetryStates.find((state) => state.key === key) ?? null;
    }

    function getRetryStateMeta(state: RetryState | null) {
        if (!state) {
            return null;
        }

        if (state.status === "PENDING") {
            return { color: "processing" as const, label: "已排队重试" };
        }

        if (state.status === "RUNNING") {
            return { color: "processing" as const, label: "重试执行中" };
        }

        if (state.status === "FAILED") {
            return { color: "error" as const, label: "最近重试失败" };
        }

        if (state.status === "SUCCESS") {
            return { color: "success" as const, label: "最近重试成功" };
        }

        return null;
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
        setLiveRetryStates((current) => {
            const next = current.filter((item) => item.key !== retryKey);
            next.unshift({
                key: retryKey,
                runId,
                stepId,
                itemIndex,
                batchRunId: "",
                status: "PENDING",
                errorMessage: null,
                updatedAt: new Date().toISOString(),
            });
            return next;
        });

        startRetryTransition(async () => {
            try {
                setPollingEnabled(true);
                const result = await retryAiReviewStrategyRunItemAction({
                    runId,
                    stepId,
                    itemIndex,
                });

                if (result.error) {
                    setLiveRetryStates((current) =>
                        current.filter((item) => item.key !== retryKey),
                    );
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
                    message: "已提交后台重试",
                    description: result.success ?? "后台任务已创建。",
                    placement: "topRight",
                });
                await refreshRuns();
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
            {!hideHeader && (
                <div className="section-head" style={{ marginBottom: 16 }}>
                    <div>
                        <h3
                            style={{ margin: 0, fontSize: 20, lineHeight: 1.1 }}
                        >
                            AI 审核辅助
                        </h3>
                    </div>
                </div>
            )}

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
                                            <div className="strategy-title-row">
                                                <h4
                                                    style={{
                                                        margin: 0,
                                                        fontSize: 17,
                                                    }}
                                                >
                                                    {run.strategy.name}
                                                </h4>
                                                <Tag
                                                    color={runStatusMeta.color}
                                                >
                                                    {runStatusMeta.label}
                                                </Tag>
                                            </div>
                                        </div>

                                        {run.errorMessage ? (
                                            <div className="strategy-run-error">
                                                {run.errorMessage}
                                            </div>
                                        ) : null}

                                        {run.parsedResult?.stepResults?.length
                                            ? (() => {
                                                  const coreSteps =
                                                      run.parsedResult.stepResults.filter(
                                                          (s) =>
                                                              isCoreStep(
                                                                  s.stepType,
                                                              ),
                                                      );
                                                  const otherSteps =
                                                      run.parsedResult.stepResults.filter(
                                                          (s) =>
                                                              !isCoreStep(
                                                                  s.stepType,
                                                              ),
                                                      );

                                                  return (
                                                      <>
                                                          {/* 核心步骤：全面检查、AI 解题、审核总结 */}
                                                          <div className="strategy-step-stack">
                                                              {coreSteps.map(
                                                                  (
                                                                      step,
                                                                      index,
                                                                  ) => (
                                                                      <div
                                                                          key={`${run.id}-${step.stepId}`}
                                                                          className="strategy-step-preview"
                                                                      >
                                                                          <div className="strategy-step-index">
                                                                              {index +
                                                                                  1}
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
                                                                                  {step.status ===
                                                                                  "FAILED" ? (
                                                                                      <Tag color="error">
                                                                                          {
                                                                                              step.status
                                                                                          }
                                                                                      </Tag>
                                                                                  ) : null}
                                                                                  {step.outcomeLabel ? (
                                                                                      <Tag color="gold">
                                                                                          {
                                                                                              step.outcomeLabel
                                                                                          }
                                                                                      </Tag>
                                                                                  ) : null}
                                                                              </div>
                                                                              {step.items.some(
                                                                                  (
                                                                                      item,
                                                                                  ) =>
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
                                                                              {step
                                                                                  .items
                                                                                  .length ? (
                                                                                  <div className="strategy-step-item-list">
                                                                                      {step.items.map(
                                                                                          (
                                                                                              item,
                                                                                          ) => {
                                                                                              const retryState =
                                                                                                  getRetryState(
                                                                                                      run.id,
                                                                                                      step.stepId,
                                                                                                      item.index,
                                                                                                  );
                                                                                              const retryMeta =
                                                                                                  getRetryStateMeta(
                                                                                                      retryState,
                                                                                                  );
                                                                                              const inlineTags =
                                                                                                  getStepItemInlineTags(
                                                                                                      step.stepType,
                                                                                                      item.output,
                                                                                                  );
                                                                                              const hasDetail =
                                                                                                  !!item.output ||
                                                                                                  !!item.error;

                                                                                              return (
                                                                                                  <details
                                                                                                      key={`${step.stepId}-${item.index}`}
                                                                                                      className="strategy-step-item-card strategy-step-item-collapsible"
                                                                                                  >
                                                                                                      <summary className="strategy-step-item-head strategy-step-item-toggle">
                                                                                                          <div className="strategy-step-item-head-left">
                                                                                                              {hasDetail ? (
                                                                                                                  <ChevronDown
                                                                                                                      size={
                                                                                                                          14
                                                                                                                      }
                                                                                                                      className="strategy-step-item-chevron"
                                                                                                                  />
                                                                                                              ) : null}
                                                                                                              <span>
                                                                                                                  第{" "}
                                                                                                                  {
                                                                                                                      item.index
                                                                                                                  }{" "}
                                                                                                                  次
                                                                                                              </span>
                                                                                                              {item.status ===
                                                                                                              "FAILED" ? (
                                                                                                                  <Tag color="error">
                                                                                                                      FAILED
                                                                                                                  </Tag>
                                                                                                              ) : null}
                                                                                                              {retryMeta ? (
                                                                                                                  <Tag
                                                                                                                      color={
                                                                                                                          retryMeta.color
                                                                                                                      }
                                                                                                                  >
                                                                                                                      {
                                                                                                                          retryMeta.label
                                                                                                                      }
                                                                                                                  </Tag>
                                                                                                              ) : null}
                                                                                                          </div>
                                                                                                          <div className="strategy-step-item-head-right">
                                                                                                              {inlineTags.map(
                                                                                                                  (
                                                                                                                      tag,
                                                                                                                      i,
                                                                                                                  ) => (
                                                                                                                      <Tag
                                                                                                                          key={
                                                                                                                              i
                                                                                                                          }
                                                                                                                          color={
                                                                                                                              tag.color
                                                                                                                          }
                                                                                                                      >
                                                                                                                          {
                                                                                                                              tag.label
                                                                                                                          }
                                                                                                                      </Tag>
                                                                                                                  ),
                                                                                                              )}
                                                                                                              <Space
                                                                                                                  size={
                                                                                                                      4
                                                                                                                  }
                                                                                                                  onClick={(
                                                                                                                      e,
                                                                                                                  ) =>
                                                                                                                      e.stopPropagation()
                                                                                                                  }
                                                                                                              >
                                                                                                                  <Button
                                                                                                                      size="small"
                                                                                                                      type="text"
                                                                                                                      icon={
                                                                                                                          <Code
                                                                                                                              size={
                                                                                                                                  14
                                                                                                                              }
                                                                                                                          />
                                                                                                                      }
                                                                                                                      onClick={() =>
                                                                                                                          setRawDataModal(
                                                                                                                              {
                                                                                                                                  title: `${step.stepName} · 第 ${item.index} 次 · 原始数据`,
                                                                                                                                  promptInput:
                                                                                                                                      item.promptInput,
                                                                                                                                  output: item.output,
                                                                                                                                  rawResponse:
                                                                                                                                      item.rawResponse,
                                                                                                                              },
                                                                                                                          )
                                                                                                                      }
                                                                                                                  >
                                                                                                                      原始数据
                                                                                                                  </Button>
                                                                                                                  {run.status !==
                                                                                                                      "RUNNING" &&
                                                                                                                  run.status !==
                                                                                                                      "PENDING" ? (
                                                                                                                      <Button
                                                                                                                          size="small"
                                                                                                                          type="text"
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
                                                                                                                          disabled={
                                                                                                                              retryState?.status ===
                                                                                                                                  "PENDING" ||
                                                                                                                              retryState?.status ===
                                                                                                                                  "RUNNING"
                                                                                                                          }
                                                                                                                          onClick={() =>
                                                                                                                              retryRunItem(
                                                                                                                                  run.id,
                                                                                                                                  step.stepId,
                                                                                                                                  item.index,
                                                                                                                              )
                                                                                                                          }
                                                                                                                      >
                                                                                                                          {retryState?.status ===
                                                                                                                          "PENDING"
                                                                                                                              ? "排队中"
                                                                                                                              : retryState?.status ===
                                                                                                                                  "RUNNING"
                                                                                                                                ? "重试中"
                                                                                                                                : "重试"}
                                                                                                                      </Button>
                                                                                                                  ) : null}
                                                                                                              </Space>
                                                                                                          </div>
                                                                                                      </summary>
                                                                                                      {hasDetail ? (
                                                                                                          <div className="strategy-step-item-body-inner">
                                                                                                              {item.output
                                                                                                                  ? renderStepItemOutput(
                                                                                                                        step.stepType,
                                                                                                                        item.output,
                                                                                                                    )
                                                                                                                  : null}
                                                                                                              {item.error ? (
                                                                                                                  <div className="strategy-run-error">
                                                                                                                      {
                                                                                                                          item.error
                                                                                                                      }
                                                                                                                  </div>
                                                                                                              ) : null}
                                                                                                              {retryState?.status ===
                                                                                                                  "FAILED" &&
                                                                                                              retryState.errorMessage ? (
                                                                                                                  <div className="strategy-run-error">
                                                                                                                      {
                                                                                                                          retryState.errorMessage
                                                                                                                      }
                                                                                                                  </div>
                                                                                                              ) : null}
                                                                                                          </div>
                                                                                                      ) : null}
                                                                                                  </details>
                                                                                              );
                                                                                          },
                                                                                      )}
                                                                                  </div>
                                                                              ) : null}
                                                                          </div>
                                                                      </div>
                                                                  ),
                                                              )}
                                                          </div>

                                                          {/* 其他步骤：折叠显示 */}
                                                          {otherSteps.length >
                                                          0 ? (
                                                              <details
                                                                  className="strategy-step-preview"
                                                                  style={{
                                                                      marginTop: 12,
                                                                  }}
                                                              >
                                                                  <summary
                                                                      className="strategy-step-title"
                                                                      style={{
                                                                          cursor: "pointer",
                                                                          padding:
                                                                              "8px 12px",
                                                                      }}
                                                                  >
                                                                      <ChevronDown
                                                                          size={
                                                                              14
                                                                          }
                                                                          className="strategy-step-item-chevron"
                                                                          style={{
                                                                              marginRight: 6,
                                                                          }}
                                                                      />
                                                                      其他步骤 (
                                                                      {
                                                                          otherSteps.length
                                                                      }
                                                                      )
                                                                  </summary>
                                                                  <div
                                                                      className="strategy-step-stack"
                                                                      style={{
                                                                          marginTop: 8,
                                                                      }}
                                                                  >
                                                                      {otherSteps.map(
                                                                          (
                                                                              step,
                                                                              index,
                                                                          ) => (
                                                                              <div
                                                                                  key={`${run.id}-${step.stepId}`}
                                                                                  className="strategy-step-preview"
                                                                              >
                                                                                  <div className="strategy-step-index">
                                                                                      {index +
                                                                                          1}
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
                                                                                          {step.status ===
                                                                                          "FAILED" ? (
                                                                                              <Tag color="error">
                                                                                                  {
                                                                                                      step.status
                                                                                                  }
                                                                                              </Tag>
                                                                                          ) : null}
                                                                                          {step.outcomeLabel ? (
                                                                                              <Tag color="gold">
                                                                                                  {
                                                                                                      step.outcomeLabel
                                                                                                  }
                                                                                              </Tag>
                                                                                          ) : null}
                                                                                      </div>
                                                                                      {step.items.some(
                                                                                          (
                                                                                              item,
                                                                                          ) =>
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
                                                                                      {step
                                                                                          .items
                                                                                          .length ? (
                                                                                          <div className="strategy-step-item-list">
                                                                                              {step.items.map(
                                                                                                  (
                                                                                                      item,
                                                                                                  ) => {
                                                                                                      const retryState =
                                                                                                          getRetryState(
                                                                                                              run.id,
                                                                                                              step.stepId,
                                                                                                              item.index,
                                                                                                          );
                                                                                                      const retryMeta =
                                                                                                          getRetryStateMeta(
                                                                                                              retryState,
                                                                                                          );
                                                                                                      const inlineTags =
                                                                                                          getStepItemInlineTags(
                                                                                                              step.stepType,
                                                                                                              item.output,
                                                                                                          );
                                                                                                      const hasDetail =
                                                                                                          !!item.output ||
                                                                                                          !!item.error;

                                                                                                      return (
                                                                                                          <details
                                                                                                              key={`${step.stepId}-${item.index}`}
                                                                                                              className="strategy-step-item-card strategy-step-item-collapsible"
                                                                                                          >
                                                                                                              <summary className="strategy-step-item-head strategy-step-item-toggle">
                                                                                                                  <div className="strategy-step-item-head-left">
                                                                                                                      {hasDetail ? (
                                                                                                                          <ChevronDown
                                                                                                                              size={
                                                                                                                                  14
                                                                                                                              }
                                                                                                                              className="strategy-step-item-chevron"
                                                                                                                          />
                                                                                                                      ) : null}
                                                                                                                      <span>
                                                                                                                          第{" "}
                                                                                                                          {
                                                                                                                              item.index
                                                                                                                          }{" "}
                                                                                                                          次
                                                                                                                      </span>
                                                                                                                      {item.status ===
                                                                                                                      "FAILED" ? (
                                                                                                                          <Tag color="error">
                                                                                                                              FAILED
                                                                                                                          </Tag>
                                                                                                                      ) : null}
                                                                                                                      {retryMeta ? (
                                                                                                                          <Tag
                                                                                                                              color={
                                                                                                                                  retryMeta.color
                                                                                                                              }
                                                                                                                          >
                                                                                                                              {
                                                                                                                                  retryMeta.label
                                                                                                                              }
                                                                                                                          </Tag>
                                                                                                                      ) : null}
                                                                                                                  </div>
                                                                                                                  <div className="strategy-step-item-head-right">
                                                                                                                      {inlineTags.map(
                                                                                                                          (
                                                                                                                              tag,
                                                                                                                              i,
                                                                                                                          ) => (
                                                                                                                              <Tag
                                                                                                                                  key={
                                                                                                                                      i
                                                                                                                                  }
                                                                                                                                  color={
                                                                                                                                      tag.color
                                                                                                                                  }
                                                                                                                              >
                                                                                                                                  {
                                                                                                                                      tag.label
                                                                                                                                  }
                                                                                                                              </Tag>
                                                                                                                          ),
                                                                                                                      )}
                                                                                                                      <Space
                                                                                                                          size={
                                                                                                                              4
                                                                                                                          }
                                                                                                                          onClick={(
                                                                                                                              e,
                                                                                                                          ) =>
                                                                                                                              e.stopPropagation()
                                                                                                                          }
                                                                                                                      >
                                                                                                                          <Button
                                                                                                                              size="small"
                                                                                                                              type="text"
                                                                                                                              icon={
                                                                                                                                  <Code
                                                                                                                                      size={
                                                                                                                                          14
                                                                                                                                      }
                                                                                                                                  />
                                                                                                                              }
                                                                                                                              onClick={() =>
                                                                                                                                  setRawDataModal(
                                                                                                                                      {
                                                                                                                                          title: `${step.stepName} · 第 ${item.index} 次 · 原始数据`,
                                                                                                                                          promptInput:
                                                                                                                                              item.promptInput,
                                                                                                                                          output: item.output,
                                                                                                                                          rawResponse:
                                                                                                                                              item.rawResponse,
                                                                                                                                      },
                                                                                                                                  )
                                                                                                                              }
                                                                                                                          >
                                                                                                                              原始数据
                                                                                                                          </Button>
                                                                                                                          {run.status !==
                                                                                                                              "RUNNING" &&
                                                                                                                          run.status !==
                                                                                                                              "PENDING" ? (
                                                                                                                              <Button
                                                                                                                                  size="small"
                                                                                                                                  type="text"
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
                                                                                                                                  disabled={
                                                                                                                                      retryState?.status ===
                                                                                                                                          "PENDING" ||
                                                                                                                                      retryState?.status ===
                                                                                                                                          "RUNNING"
                                                                                                                                  }
                                                                                                                                  onClick={() =>
                                                                                                                                      retryRunItem(
                                                                                                                                          run.id,
                                                                                                                                          step.stepId,
                                                                                                                                          item.index,
                                                                                                                                      )
                                                                                                                                  }
                                                                                                                              >
                                                                                                                                  {retryState?.status ===
                                                                                                                                  "PENDING"
                                                                                                                                      ? "排队中"
                                                                                                                                      : retryState?.status ===
                                                                                                                                          "RUNNING"
                                                                                                                                        ? "重试中"
                                                                                                                                        : "重试"}
                                                                                                                              </Button>
                                                                                                                          ) : null}
                                                                                                                      </Space>
                                                                                                                  </div>
                                                                                                              </summary>
                                                                                                              {hasDetail ? (
                                                                                                                  <div className="strategy-step-item-body-inner">
                                                                                                                      {item.output
                                                                                                                          ? renderStepItemOutput(
                                                                                                                                step.stepType,
                                                                                                                                item.output,
                                                                                                                            )
                                                                                                                          : null}
                                                                                                                      {item.error ? (
                                                                                                                          <div className="strategy-run-error">
                                                                                                                              {
                                                                                                                                  item.error
                                                                                                                              }
                                                                                                                          </div>
                                                                                                                      ) : null}
                                                                                                                      {retryState?.status ===
                                                                                                                          "FAILED" &&
                                                                                                                      retryState.errorMessage ? (
                                                                                                                          <div className="strategy-run-error">
                                                                                                                              {
                                                                                                                                  retryState.errorMessage
                                                                                                                              }
                                                                                                                          </div>
                                                                                                                      ) : null}
                                                                                                                  </div>
                                                                                                              ) : null}
                                                                                                          </details>
                                                                                                      );
                                                                                                  },
                                                                                              )}
                                                                                          </div>
                                                                                      ) : null}
                                                                                  </div>
                                                                              </div>
                                                                          ),
                                                                      )}
                                                                  </div>
                                                              </details>
                                                          ) : null}
                                                      </>
                                                  );
                                              })()
                                            : null}

                                        {/* 审核建议：简洁一行 */}
                                        {run.parsedResult
                                            ?.finalRecommendation ? (
                                            <div
                                                style={{
                                                    marginTop: 16,
                                                    padding: "10px 14px",
                                                    background:
                                                        "var(--color-surface-2, #f5f5f5)",
                                                    borderRadius: 6,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        gap: 8,
                                                        flexWrap: "wrap",
                                                        alignItems: "center",
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            fontWeight: 600,
                                                            fontSize: 13,
                                                        }}
                                                    >
                                                        审核建议
                                                    </span>
                                                    {run.parsedResult
                                                        .finalRecommendation
                                                        .decision ? (
                                                        <Tag
                                                            color={getDecisionColor(
                                                                run.parsedResult
                                                                    .finalRecommendation
                                                                    .decision,
                                                            )}
                                                        >
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
                                                        <Tag
                                                            color={getSeverityColor(
                                                                run.parsedResult
                                                                    .finalRecommendation
                                                                    .riskLevel,
                                                            )}
                                                        >
                                                            风险:{" "}
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
                                                        marginTop: 6,
                                                        lineHeight: 1.6,
                                                        fontSize: 13,
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

                                        {/* 审核回填：简洁一行 */}
                                        {run.parsedResult?.reviewPersistence ? (
                                            <div
                                                style={{
                                                    marginTop: 8,
                                                    padding: "10px 14px",
                                                    background:
                                                        "var(--color-surface-2, #f5f5f5)",
                                                    borderRadius: 6,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        gap: 8,
                                                        flexWrap: "wrap",
                                                        alignItems: "center",
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            fontWeight: 600,
                                                            fontSize: 13,
                                                        }}
                                                    >
                                                        审核回填
                                                    </span>
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
                                                        {run.parsedResult
                                                            .reviewPersistence
                                                            .status === "SAVED"
                                                            ? "已保存"
                                                            : run.parsedResult
                                                                    .reviewPersistence
                                                                    .status ===
                                                                "FAILED"
                                                              ? "保存失败"
                                                              : "已跳过"}
                                                    </Tag>
                                                    {run.parsedResult
                                                        .reviewPersistence
                                                        .decision ? (
                                                        <Tag
                                                            color={getDecisionColor(
                                                                run.parsedResult
                                                                    .reviewPersistence
                                                                    .decision,
                                                            )}
                                                        >
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
                                                        marginTop: 6,
                                                        lineHeight: 1.6,
                                                        fontSize: 13,
                                                        color: "var(--color-text-secondary)",
                                                    }}
                                                >
                                                    {
                                                        run.parsedResult
                                                            .reviewPersistence
                                                            .message
                                                    }
                                                </div>
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

            <Modal
                title={rawDataModal?.title ?? "原始数据"}
                open={!!rawDataModal}
                onCancel={() => setRawDataModal(null)}
                footer={null}
                width={800}
                styles={{ body: { maxHeight: "70vh", overflow: "auto" } }}
            >
                {rawDataModal ? (
                    <div style={{ display: "grid", gap: 16 }}>
                        <div>
                            <div className="step-output-section-label">
                                请求输入 (promptInput)
                            </div>
                            <pre className="strategy-json-block">
                                {formatJson(rawDataModal.promptInput)}
                            </pre>
                        </div>
                        <div>
                            <div className="step-output-section-label">
                                输出 (output)
                            </div>
                            <pre className="strategy-json-block">
                                {formatJson(rawDataModal.output)}
                            </pre>
                        </div>
                        <div>
                            <div className="step-output-section-label">
                                原始响应 (rawResponse)
                            </div>
                            <pre className="strategy-json-block">
                                {formatJson(rawDataModal.rawResponse)}
                            </pre>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </section>
    );
}
