"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Empty, Popconfirm, Select, Space, Tag } from "antd";
import { Bot, RefreshCcw } from "lucide-react";
import {
    cancelAiReviewStrategyBatchRunAction,
    deleteAiReviewStrategyBatchRunAction,
} from "@/app/actions/ai-review-strategies";

type ProjectOption = {
    id: string;
    name: string;
    code: string;
};

type BatchRunView = {
    id: string;
    status:
        | "PENDING"
        | "RUNNING"
        | "SUCCESS"
        | "FAILED"
        | "CANCEL_REQUESTED"
        | "CANCELLED";
    concurrency: number;
    totalCount: number;
    pendingCount: number;
    runningCount: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    errorMessage: string | null;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    createdByName: string;
    strategy: {
        id: string;
        name: string;
        code: string;
    };
    currentItems: Array<{
        questionId: string;
        questionExternalRecordId: string;
        status:
            | "PENDING"
            | "RUNNING"
            | "SUCCESS"
            | "FAILED"
            | "SKIPPED"
            | "CANCELLED";
    }>;
    recentFailures: Array<{
        questionId: string;
        questionExternalRecordId: string;
        errorMessage: string;
    }>;
};

function isActiveBatchRunStatus(status: BatchRunView["status"]) {
    return (
        status === "PENDING" ||
        status === "RUNNING" ||
        status === "CANCEL_REQUESTED"
    );
}

function getBatchRunStatusMeta(status: BatchRunView["status"]) {
    if (status === "SUCCESS") {
        return { color: "success" as const, label: "已完成" };
    }

    if (status === "FAILED") {
        return { color: "error" as const, label: "执行失败" };
    }

    if (status === "CANCELLED") {
        return { color: "default" as const, label: "已取消" };
    }

    if (status === "CANCEL_REQUESTED") {
        return { color: "warning" as const, label: "取消中" };
    }

    return {
        color: "processing" as const,
        label: status === "PENDING" ? "待执行" : "执行中",
    };
}

export function AiReviewBatchRunConsole({
    projects,
    selectedProjectId,
    initialRuns,
    listPath,
}: {
    projects: ProjectOption[];
    selectedProjectId: string;
    initialRuns: BatchRunView[];
    listPath: string;
}) {
    const router = useRouter();
    const { notification } = App.useApp();
    const [runs, setRuns] = useState(initialRuns);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [cancellingBatchRunId, setCancellingBatchRunId] = useState<
        string | null
    >(null);
    const [deletingBatchRunId, setDeletingBatchRunId] = useState<string | null>(
        null,
    );

    useEffect(() => {
        setRuns(initialRuns);
    }, [initialRuns]);

    useEffect(() => {
        if (!selectedProjectId) {
            return;
        }

        let disposed = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        async function loadRuns() {
            try {
                const response = await fetch(
                    `/api/ai-review-strategy-batch-runs?projectId=${selectedProjectId}`,
                    {
                        cache: "no-store",
                    },
                );
                const payload = (await response.json().catch(() => null)) as {
                    error?: string;
                    runs?: BatchRunView[];
                } | null;

                if (!response.ok) {
                    throw new Error(payload?.error ?? "获取批量任务状态失败。");
                }

                if (!disposed) {
                    const nextRuns = payload?.runs ?? [];
                    setRuns(nextRuns);
                    timer = setTimeout(
                        loadRuns,
                        nextRuns.some((run) =>
                            isActiveBatchRunStatus(run.status),
                        )
                            ? 1500
                            : 5000,
                    );
                }
            } catch (error) {
                if (!disposed) {
                    timer = setTimeout(loadRuns, 5000);
                }
            }
        }

        timer = setTimeout(loadRuns, 400);

        return () => {
            disposed = true;
            if (timer) {
                clearTimeout(timer);
            }
        };
    }, [selectedProjectId]);

    async function refreshRuns() {
        setIsRefreshing(true);

        try {
            const response = await fetch(
                `/api/ai-review-strategy-batch-runs?projectId=${selectedProjectId}`,
                {
                    cache: "no-store",
                },
            );
            const payload = (await response.json().catch(() => null)) as {
                error?: string;
                runs?: BatchRunView[];
            } | null;

            if (!response.ok) {
                throw new Error(payload?.error ?? "获取批量任务状态失败。");
            }

            setRuns(payload?.runs ?? []);
        } catch (error) {
            notification.error({
                message: "刷新批量任务失败",
                description:
                    error instanceof Error ? error.message : "请稍后再试。",
                placement: "topRight",
            });
        } finally {
            setIsRefreshing(false);
        }
    }

    async function cancelBatchRun(batchRunId: string) {
        setCancellingBatchRunId(batchRunId);

        try {
            const result = await cancelAiReviewStrategyBatchRunAction({
                batchRunId,
            });

            if (result.error) {
                notification.error({
                    message: "取消批量任务失败",
                    description: result.error,
                    placement: "topRight",
                });
                return;
            }

            notification.success({
                message: "已请求取消批量任务",
                description:
                    result.success ?? "worker 会在安全点停止后续题目执行。",
                placement: "topRight",
            });
            setRuns((current) =>
                current.map((run) =>
                    run.id === batchRunId
                        ? { ...run, status: "CANCEL_REQUESTED" }
                        : run,
                ),
            );
        } finally {
            setCancellingBatchRunId(null);
        }
    }

    async function deleteBatchRun(batchRunId: string) {
        setDeletingBatchRunId(batchRunId);

        try {
            const result = await deleteAiReviewStrategyBatchRunAction({
                batchRunId,
            });

            if (result.error) {
                notification.error({
                    message: "删除批量任务失败",
                    description: result.error,
                    placement: "topRight",
                });
                return;
            }

            notification.success({
                message: "批量任务已删除",
                description: result.success ?? "该任务已从列表移除。",
                placement: "topRight",
            });
            setRuns((current) => current.filter((run) => run.id !== batchRunId));
        } finally {
            setDeletingBatchRunId(null);
        }
    }

    function pushProject(projectId: string) {
        router.push(`${listPath}?projectId=${projectId}`);
    }

    return (
        <section className="content-surface">
            <div className="section-head" style={{ marginBottom: 16 }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: 22, lineHeight: 1.1 }}>
                        批量任务
                    </h3>
                    <p
                        className="muted"
                        style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                    >
                        这里用于查看 AI
                        审核批量任务的执行进度、失败情况和取消状态。列表页只负责勾选并提交任务。
                    </p>
                </div>
                <Space size={8} wrap>
                    <Button
                        icon={<RefreshCcw size={16} />}
                        loading={isRefreshing}
                        onClick={refreshRuns}
                    >
                        刷新
                    </Button>
                </Space>
            </div>

            {!projects.length ? (
                <Empty description="当前没有可查看的项目。" />
            ) : (
                <div style={{ display: "grid", gap: 16 }}>
                    <div className="review-toolbar">
                        <div className="review-toolbar-field">
                            <div className="review-toolbar-label">当前项目</div>
                            <Select
                                value={selectedProjectId}
                                onChange={pushProject}
                                options={projects.map((project) => ({
                                    value: project.id,
                                    label: `${project.name} (${project.code})`,
                                }))}
                                style={{ minWidth: 280 }}
                                size="large"
                            />
                        </div>
                    </div>

                    {!runs.length ? (
                        <Empty description="当前项目还没有批量 AI 审核任务。" />
                    ) : (
                        <div style={{ display: "grid", gap: 12 }}>
                            {runs.map((run) => {
                                const statusMeta = getBatchRunStatusMeta(
                                    run.status,
                                );

                                return (
                                    <div
                                        key={run.id}
                                        className="workspace-tip"
                                        style={{ display: "grid", gap: 10 }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                gap: 12,
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <div>
                                                <div
                                                    style={{ fontWeight: 600 }}
                                                >
                                                    {run.strategy.name} (
                                                    {run.strategy.code})
                                                </div>
                                                <div
                                                    className="muted"
                                                    style={{ marginTop: 4 }}
                                                >
                                                    创建人：{run.createdByName}{" "}
                                                    · 创建时间{" "}
                                                    {new Date(
                                                        run.createdAt,
                                                    ).toLocaleString("zh-CN")}
                                                </div>
                                            </div>
                                            <Space size={8} wrap>
                                                <Tag color={statusMeta.color}>
                                                    {statusMeta.label}
                                                </Tag>
                                                <Tag>
                                                    并发 {run.concurrency}
                                                </Tag>
                                                {isActiveBatchRunStatus(
                                                    run.status,
                                                ) ? (
                                                    <Button
                                                        size="small"
                                                        danger
                                                        loading={
                                                            cancellingBatchRunId ===
                                                            run.id
                                                        }
                                                        onClick={() =>
                                                            cancelBatchRun(
                                                                run.id,
                                                            )
                                                        }
                                                    >
                                                        取消
                                                    </Button>
                                                ) : null}
                                                <Popconfirm
                                                    title="删除批量任务"
                                                    description="删除后不可恢复，确定继续吗？"
                                                    okText="删除"
                                                    cancelText="取消"
                                                    okButtonProps={{
                                                        danger: true,
                                                        loading:
                                                            deletingBatchRunId ===
                                                            run.id,
                                                    }}
                                                    onConfirm={() =>
                                                        deleteBatchRun(run.id)
                                                    }
                                                >
                                                    <Button
                                                        size="small"
                                                        danger
                                                        loading={
                                                            deletingBatchRunId ===
                                                            run.id
                                                        }
                                                    >
                                                        删除
                                                    </Button>
                                                </Popconfirm>
                                            </Space>
                                        </div>

                                        <div
                                            style={{
                                                display: "flex",
                                                gap: 8,
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <Tag>总数 {run.totalCount}</Tag>
                                            <Tag>待执行 {run.pendingCount}</Tag>
                                            <Tag color="processing">
                                                运行中 {run.runningCount}
                                            </Tag>
                                            <Tag color="success">
                                                成功 {run.successCount}
                                            </Tag>
                                            <Tag color="error">
                                                失败 {run.failedCount}
                                            </Tag>
                                            <Tag>跳过 {run.skippedCount}</Tag>
                                        </div>

                                        {run.currentItems.length ? (
                                            <div className="muted">
                                                <Bot
                                                    size={14}
                                                    style={{
                                                        marginRight: 6,
                                                        verticalAlign:
                                                            "text-bottom",
                                                    }}
                                                />
                                                当前处理：
                                                {run.currentItems
                                                    .map(
                                                        (item) =>
                                                            item.questionExternalRecordId,
                                                    )
                                                    .join("；")}
                                            </div>
                                        ) : null}

                                        {run.recentFailures.length ? (
                                            <div
                                                style={{
                                                    display: "grid",
                                                    gap: 4,
                                                }}
                                            >
                                                {run.recentFailures.map(
                                                    (item) => (
                                                        <div
                                                            key={`${run.id}-${item.questionId}`}
                                                            className="muted"
                                                        >
                                                            {
                                                                item.questionExternalRecordId
                                                            }
                                                            ：
                                                            {item.errorMessage}
                                                        </div>
                                                    ),
                                                )}
                                            </div>
                                        ) : null}

                                        {run.errorMessage ? (
                                            <div className="strategy-run-error">
                                                {run.errorMessage}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
