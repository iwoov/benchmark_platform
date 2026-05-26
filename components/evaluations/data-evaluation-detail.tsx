"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    BarChart3,
    ChevronLeft,
    ChevronRight,
    Eye,
    Play,
    RefreshCcw,
} from "lucide-react";
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
import { EmptyState } from "@/components/ui/empty";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type {
    DataEvaluationModelColumn,
    DataEvaluationQuestionDetail,
    DataEvaluationQuestionNavigation,
    DataEvaluationResult,
    DataEvaluationRunState,
} from "@/lib/evaluations/data-evaluations";

function isActiveRunState(state: DataEvaluationRunState | null | undefined) {
    return state?.itemStatus === "PENDING" || state?.itemStatus === "RUNNING";
}

function formatRunStateStatus(state: DataEvaluationRunState | null | undefined) {
    if (!state) {
        return null;
    }

    if (state.itemStatus === "PENDING") {
        return <Badge variant="info">排队中</Badge>;
    }

    if (state.itemStatus === "RUNNING") {
        return <Badge variant="warning">运行中</Badge>;
    }

    if (state.itemStatus === "FAILED") {
        return <Badge variant="destructive">运行失败</Badge>;
    }

    return null;
}

function formatResultStatus(
    result: DataEvaluationResult | null,
    runState?: DataEvaluationRunState | null,
) {
    const stateStatus = formatRunStateStatus(runState);

    if (stateStatus) {
        return stateStatus;
    }

    if (!result) {
        return <Badge variant="outline">未评测</Badge>;
    }

    if (result.status === "SUCCESS") {
        if (result.isCorrect === true) {
            return <Badge variant="success">正确</Badge>;
        }

        if (result.isCorrect === false) {
            return <Badge variant="destructive">错误</Badge>;
        }

        return <Badge variant="outline">无法判断</Badge>;
    }

    if (result.status === "FAILED") {
        return <Badge variant="destructive">失败</Badge>;
    }

    return <Badge variant="warning">{result.status}</Badge>;
}

function formatConfidence(value: number | null) {
    if (typeof value !== "number") {
        return null;
    }

    return `${Math.round(value * 100)}%`;
}

function correctnessBadge(result: DataEvaluationResult) {
    if (result.isCorrect === true) {
        return <Badge variant="success">正确</Badge>;
    }

    if (result.isCorrect === false) {
        return <Badge variant="destructive">错误</Badge>;
    }

    return <Badge variant="outline">无法判断</Badge>;
}

function renderJudgeResultBadges(result: DataEvaluationResult) {
    const confidence = formatConfidence(result.confidence);

    return (
        <div className="flex flex-wrap gap-2">
            {correctnessBadge(result)}
            {result.matchLevel ? (
                <Badge variant="outline">{result.matchLevel}</Badge>
            ) : null}
            {confidence ? (
                <Badge variant="outline">置信度 {confidence}</Badge>
            ) : null}
            {typeof result.score === "number" ? (
                <Badge variant="info">分值 {result.score}</Badge>
            ) : null}
        </div>
    );
}

function formatJson(value: unknown) {
    try {
        return JSON.stringify(value ?? null, null, 2);
    } catch {
        return String(value);
    }
}

function renderAnswerText(result: DataEvaluationResult) {
    return result.answer ?? result.normalizedAnswer ?? "";
}

function getOrderedRawFieldEntries(question: DataEvaluationQuestionDetail) {
    const keys = [
        ...question.rawFieldOrder,
        ...Object.keys(question.rawRecord).filter(
            (key) => !question.rawFieldOrder.includes(key),
        ),
    ];

    return keys
        .map((key) => ({
            key,
            value: question.rawRecord[key],
        }))
        .filter((entry) => entry.value !== undefined && entry.value !== "");
}

function FieldBlock({
    label,
    value,
}: {
    label: string;
    value: string | null | undefined;
}) {
    if (!value) {
        return null;
    }

    return (
        <div className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
            </div>
            <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/25 px-3 py-2 text-sm leading-6">
                {value}
            </div>
        </div>
    );
}

type EvaluationRunsResponse = {
    results?: Record<string, DataEvaluationResult | null>;
    runStates?: Record<string, DataEvaluationRunState | null>;
    error?: string;
    success?: string;
};

export function DataEvaluationDetail({
    question,
    modelColumns,
    results,
    listPath,
    navigation,
}: {
    question: DataEvaluationQuestionDetail;
    modelColumns: DataEvaluationModelColumn[];
    results: Record<string, DataEvaluationResult | null>;
    listPath: string;
    navigation: DataEvaluationQuestionNavigation;
}) {
    const router = useRouter();
    const toast = useToast();
    const [currentResults, setCurrentResults] = useState(results);
    const [runStates, setRunStates] = useState<
        Record<string, DataEvaluationRunState | null>
    >({});
    const [submittingColumnCode, setSubmittingColumnCode] = useState<
        string | null
    >(null);
    const [rawResponseModal, setRawResponseModal] = useState<{
        title: string;
        payload: unknown;
    } | null>(null);
    const [isNavigatingList, startNavigatingList] = useTransition();
    const detailBasePath = listPath.split("?")[0];
    const listQuery = listPath.includes("?")
        ? listPath.slice(listPath.indexOf("?"))
        : "";
    const activeColumnCodes = useMemo(
        () =>
            modelColumns
                .filter((model) => isActiveRunState(runStates[model.code]))
                .map((model) => model.code),
        [modelColumns, runStates],
    );
    const pollRuns = useCallback(async () => {
        if (!modelColumns.length) {
            return;
        }

        const response = await fetch(
            `/api/data-evaluations/runs?questionId=${encodeURIComponent(
                question.id,
            )}`,
            {
                cache: "no-store",
            },
        );
        const payload = (await response
            .json()
            .catch(() => ({}))) as EvaluationRunsResponse;

        if (!response.ok) {
            throw new Error(payload.error ?? "获取数据评测状态失败。");
        }

        if (payload.results) {
            setCurrentResults(payload.results);
        }

        if (payload.runStates) {
            setRunStates(payload.runStates);
        }
    }, [modelColumns.length, question.id]);

    useEffect(() => {
        let cancelled = false;

        const tick = async () => {
            try {
                await pollRuns();
            } catch {
                if (!cancelled) {
                    // Keep the page usable during transient polling failures.
                }
            }
        };

        void tick();
        const interval = window.setInterval(() => {
            void tick();
        }, activeColumnCodes.length ? 3000 : 8000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [activeColumnCodes.length, pollRuns]);

    const submitRun = async (model: DataEvaluationModelColumn) => {
        setSubmittingColumnCode(model.code);
        setRunStates((previous) => ({
            ...previous,
            [model.code]: {
                columnCode: model.code,
                batchRunId: "",
                itemStatus: "PENDING",
                batchStatus: "PENDING",
                errorMessage: null,
                updatedAt: new Date().toISOString(),
            },
        }));

        try {
            const response = await fetch("/api/data-evaluations/runs", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    questionId: question.id,
                    columnCode: model.code,
                }),
            });
            const payload = (await response
                .json()
                .catch(() => ({}))) as EvaluationRunsResponse;

            if (!response.ok) {
                throw new Error(payload.error ?? "创建数据评测任务失败。");
            }

            if (payload.runStates) {
                setRunStates(payload.runStates);
            }

            toast.success({
                title: "任务已提交",
                description:
                    payload.success ?? "后台 worker 会按评测配置执行。",
            });
            await pollRuns();
        } catch (error) {
            setRunStates((previous) => ({
                ...previous,
                [model.code]: previous[model.code]?.batchRunId
                    ? (previous[model.code] ?? null)
                    : null,
            }));
            toast.error({
                title: "提交失败",
                description:
                    error instanceof Error
                        ? error.message
                        : "创建数据评测任务失败。",
            });
        } finally {
            setSubmittingColumnCode(null);
        }
    };

    const goToQuestion = (questionId: string | null) => {
        if (!questionId) {
            return;
        }

        router.push(`${detailBasePath}/${questionId}${listQuery}`);
    };

    const goBackToList = () => {
        startNavigatingList(() => {
            router.push(listPath);
        });
    };

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow="Data Evaluation"
                title="数据评测详情"
                description={`${question.project.name} / ${question.datasource.name}`}
                action={
                    <>
                        <Button
                            type="button"
                            variant="secondary"
                            leftIcon={<ArrowLeft size={16} />}
                            loading={isNavigatingList}
                            onClick={goBackToList}
                        >
                            返回列表
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            aria-label="上一题"
                            disabled={!navigation.previousQuestionId}
                            onClick={() =>
                                goToQuestion(navigation.previousQuestionId)
                            }
                        >
                            <ChevronLeft size={16} />
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            aria-label="下一题"
                            disabled={!navigation.nextQuestionId}
                            onClick={() =>
                                goToQuestion(navigation.nextQuestionId)
                            }
                        >
                            <ChevronRight size={16} />
                        </Button>
                    </>
                }
            />

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {question.rawRecord.question_id ??
                                question.externalRecordId}
                        </CardTitle>
                        <CardDescription>
                            原始字段 · {question.datasource.name}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {getOrderedRawFieldEntries(question).map((field) => (
                            <FieldBlock
                                key={field.key}
                                label={field.key}
                                value={field.value}
                            />
                        ))}
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    {!modelColumns.length ? (
                        <EmptyState
                            icon={<BarChart3 size={22} />}
                            title="暂无评测模型"
                            description="当前题目没有匹配到启用的评测策略。"
                        />
                    ) : (
                        modelColumns.map((model) => {
                            const result = currentResults[model.code] ?? null;
                            const runState = runStates[model.code] ?? null;
                            const isActive = isActiveRunState(runState);
                            const isSubmitting =
                                submittingColumnCode === model.code;
                            const answerText = result
                                ? renderAnswerText(result)
                                : "";
                            const hasJudgeResult = Boolean(
                                result &&
                                    (result.judgeModelCode ||
                                        result.judgeModelLabel ||
                                        result.matchLevel ||
                                        typeof result.confidence === "number" ||
                                        typeof result.score === "number" ||
                                        result.isCorrect !== null),
                            );

                            return (
                                <Card key={model.code}>
                                    <CardHeader className="flex-row items-start justify-between gap-3">
                                        <div>
                                            <CardTitle>{model.label}</CardTitle>
                                            <CardDescription>
                                                {result?.strategyName ??
                                                    model.strategyName}
                                            </CardDescription>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            {formatResultStatus(result, runState)}
                                            {result?.rawResponse ? (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="secondary"
                                                    leftIcon={<Eye size={14} />}
                                                    onClick={() =>
                                                        setRawResponseModal({
                                                            title: `${model.label} 原始响应`,
                                                            payload:
                                                                result.rawResponse,
                                                        })
                                                    }
                                                >
                                                    查看原始响应
                                                </Button>
                                            ) : null}
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={
                                                    result ? "secondary" : "default"
                                                }
                                                leftIcon={
                                                    isActive || isSubmitting ? (
                                                        <RefreshCcw
                                                            size={14}
                                                            className="animate-spin"
                                                        />
                                                    ) : (
                                                        <Play size={14} />
                                                    )
                                                }
                                                loading={isSubmitting}
                                                disabled={isActive}
                                                onClick={() => void submitRun(model)}
                                            >
                                                {isActive
                                                    ? "运行中"
                                                    : result
                                                      ? "重新运行"
                                                      : "运行"}
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {runState?.errorMessage ? (
                                            <p className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
                                                {runState.errorMessage}
                                            </p>
                                        ) : null}
                                        {result ? (
                                            <>
                                                <div className="flex flex-wrap gap-2">
                                                    {result.answerModelLabel ? (
                                                        <Badge variant="primary">
                                                            作答 {result.answerModelLabel}
                                                        </Badge>
                                                    ) : null}
                                                    {result.judgeModelLabel ? (
                                                        <Badge variant="info">
                                                            判题 {result.judgeModelLabel}
                                                        </Badge>
                                                    ) : null}
                                                    {result.matchLevel ? (
                                                        <Badge variant="outline">
                                                            {result.matchLevel}
                                                        </Badge>
                                                    ) : null}
                                                    {formatConfidence(
                                                        result.confidence,
                                                    ) ? (
                                                        <Badge variant="outline">
                                                            置信度{" "}
                                                            {formatConfidence(
                                                                result.confidence,
                                                            )}
                                                        </Badge>
                                                    ) : null}
                                                    {result.difficultyLevel ? (
                                                        <Badge variant="primary">
                                                            难度 {result.difficultyLevel}
                                                        </Badge>
                                                    ) : null}
                                                    {typeof result.score ===
                                                    "number" ? (
                                                        <Badge variant="info">
                                                            分值 {result.score}
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <div className="space-y-2 rounded-md border border-border bg-muted/25 p-3">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                                                作答结果
                                                            </div>
                                                            {result.answerModelLabel ? (
                                                                <Badge variant="primary">
                                                                    {
                                                                        result.answerModelLabel
                                                                    }
                                                                </Badge>
                                                            ) : null}
                                                        </div>
                                                        {answerText ? (
                                                            <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                                                                {answerText}
                                                            </div>
                                                        ) : (
                                                            <p className="text-sm text-muted-foreground">
                                                                暂无答案内容。
                                                            </p>
                                                        )}
                                                    </div>

                                                    {hasJudgeResult ? (
                                                        <div className="space-y-2 rounded-md border border-border bg-muted/25 p-3">
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                                                    评判结果
                                                                </div>
                                                            </div>
                                                            {renderJudgeResultBadges(
                                                                result,
                                                            )}
                                                        </div>
                                                    ) : null}
                                                </div>
                                                {result.errorMessage ? (
                                                    <p className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
                                                        {result.errorMessage}
                                                    </p>
                                                ) : null}
                                            </>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">
                                                该模型还没有最新评测结果。
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })
                    )}
                </div>
            </div>

            <Modal
                open={Boolean(rawResponseModal)}
                onOpenChange={(open) => {
                    if (!open) {
                        setRawResponseModal(null);
                    }
                }}
                title={rawResponseModal?.title ?? "原始响应"}
                width={840}
            >
                <pre className="max-h-[70vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs leading-5 text-foreground">
                    {formatJson(rawResponseModal?.payload)}
                </pre>
            </Modal>
        </div>
    );
}
