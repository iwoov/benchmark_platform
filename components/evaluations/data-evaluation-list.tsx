"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Play } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty";
import { Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MultiSelect } from "@/components/ui/multi-select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import type {
    DataEvaluationModelColumn,
    DataEvaluationQuestionRow,
    DataEvaluationResult,
} from "@/lib/evaluations/data-evaluations";

type ProjectOption = {
    id: string;
    name: string;
    code: string;
};

type BatchRunResponse = {
    success?: string;
    error?: string;
    summary?: {
        createdCount: number;
        createdItemCount: number;
        skippedSuccessfulCount: number;
        skippedUnavailableCount: number;
        skippedActiveCount: number;
        skippedInaccessibleCount: number;
        failedCount: number;
    };
};

function resultBadge(result: DataEvaluationResult | null) {
    if (!result) {
        return <Badge variant="outline">未评测</Badge>;
    }

    if (result.status === "SUCCESS") {
        const correctness =
            result.isCorrect === true
                ? { label: "正确", variant: "success" as const }
                : result.isCorrect === false
                  ? { label: "错误", variant: "destructive" as const }
                  : { label: "无法判断", variant: "outline" as const };

        return <Badge variant={correctness.variant}>{correctness.label}</Badge>;
    }

    if (result.status === "FAILED") {
        return (
            <span className="inline-flex flex-col gap-1">
                <Badge variant="destructive">失败</Badge>
                {result.errorMessage ? (
                    <span className="line-clamp-2 max-w-56 text-xs leading-5 text-muted-foreground">
                        {result.errorMessage}
                    </span>
                ) : null}
            </span>
        );
    }

    return <Badge variant="warning">{result.status}</Badge>;
}

function buildPageHref(basePath: string, projectId: string, page: number) {
    const params = new URLSearchParams();
    if (projectId) {
        params.set("projectId", projectId);
    }
    params.set("page", String(page));
    return `${basePath}?${params.toString()}`;
}

function buildDetailHref(
    basePath: string,
    rowId: string,
    projectId: string,
    page: number,
    pageSize: number,
) {
    const params = new URLSearchParams();
    if (projectId) {
        params.set("projectId", projectId);
    }
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return `${basePath}/${rowId}?${params.toString()}`;
}

export function DataEvaluationList({
    projects,
    selectedProjectId,
    rows,
    modelColumns,
    page,
    pageSize,
    total,
    basePath,
}: {
    projects: ProjectOption[];
    selectedProjectId: string;
    rows: DataEvaluationQuestionRow[];
    modelColumns: DataEvaluationModelColumn[];
    page: number;
    pageSize: number;
    total: number;
    basePath: string;
}) {
    const router = useRouter();
    const toast = useToast();
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>(
        [],
    );
    const [batchModalOpen, setBatchModalOpen] = useState(false);
    const [selectedColumnCodes, setSelectedColumnCodes] = useState<string[]>([]);
    const [skipSuccessful, setSkipSuccessful] = useState(true);
    const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
    const selectedQuestionIdSet = useMemo(
        () => new Set(selectedQuestionIds),
        [selectedQuestionIds],
    );
    const selectedRows = useMemo(
        () => rows.filter((row) => selectedQuestionIdSet.has(row.id)),
        [rows, selectedQuestionIdSet],
    );
    const allVisibleSelected =
        rows.length > 0 && rows.every((row) => selectedQuestionIdSet.has(row.id));
    const someVisibleSelected =
        selectedQuestionIds.length > 0 && !allVisibleSelected;
    const modelOptions = useMemo(
        () =>
            modelColumns.map((model) => ({
                value: model.code,
                label: model.label,
            })),
        [modelColumns],
    );

    useEffect(() => {
        setSelectedQuestionIds((previous) =>
            previous.filter((questionId) =>
                rows.some((row) => row.id === questionId),
            ),
        );
    }, [rows]);

    useEffect(() => {
        setSelectedColumnCodes((previous) => {
            const validCodes = new Set(modelColumns.map((model) => model.code));
            const next = previous.filter((code) => validCodes.has(code));

            return next.length ? next : modelColumns.map((model) => model.code);
        });
    }, [modelColumns]);

    const toggleAllVisible = (checked: boolean) => {
        setSelectedQuestionIds(checked ? rows.map((row) => row.id) : []);
    };

    const toggleRow = (questionId: string, checked: boolean) => {
        setSelectedQuestionIds((previous) =>
            checked
                ? [...new Set([...previous, questionId])]
                : previous.filter((id) => id !== questionId),
        );
    };

    const submitBatchRun = async () => {
        if (!selectedRows.length) {
            toast.warning({
                title: "未选择题目",
                description: "请先勾选要运行的题目。",
            });
            return;
        }

        if (!selectedColumnCodes.length) {
            toast.warning({
                title: "未选择模型",
                description: "请至少选择 1 个评测模型。",
            });
            return;
        }

        setIsSubmittingBatch(true);

        try {
            const response = await fetch("/api/data-evaluations/batch-runs", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    projectId: selectedProjectId,
                    questionIds: selectedRows.map((row) => row.id),
                    columnCodes: selectedColumnCodes,
                    skipSuccessful,
                }),
            });
            const payload = (await response
                .json()
                .catch(() => ({}))) as BatchRunResponse;

            if (!response.ok) {
                throw new Error(payload.error ?? "创建数据评测批量任务失败。");
            }

            const summary = payload.summary;
            const description = summary
                ? [
                      `新建 ${summary.createdCount} 个批量任务`,
                      `执行项 ${summary.createdItemCount}`,
                      `跳过成功 ${summary.skippedSuccessfulCount}`,
                      `跳过排队/运行中 ${summary.skippedActiveCount}`,
                      summary.failedCount ? `失败 ${summary.failedCount}` : null,
                  ]
                      .filter(Boolean)
                      .join("，")
                : (payload.success ?? "后台 worker 会按模型配置执行。");

            toast.success({
                title: summary?.createdCount ? "批量任务已提交" : "没有新任务",
                description,
            });
            setBatchModalOpen(false);
            setSelectedQuestionIds([]);
            router.refresh();
        } catch (error) {
            toast.error({
                title: "创建批量任务失败",
                description:
                    error instanceof Error
                        ? error.message
                        : "创建数据评测批量任务失败。",
            });
        } finally {
            setIsSubmittingBatch(false);
        }
    };

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow="Data Evaluation"
                title="数据评测"
                description="只展示已通过的题目，右侧按 AI 策略中的评测策略展示最新评测结果。"
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="w-full max-w-xs">
                    <Select
                        aria-label="选择项目"
                        value={selectedProjectId}
                        onChange={(event) => {
                            setSelectedQuestionIds([]);
                            const params = new URLSearchParams();
                            if (event.target.value) {
                                params.set("projectId", event.target.value);
                            }
                            router.push(
                                params.size
                                    ? `${basePath}?${params.toString()}`
                                    : basePath,
                            );
                        }}
                    >
                        {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                                {project.name}
                            </option>
                        ))}
                    </Select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {selectedQuestionIds.length ? (
                        <Badge variant="info">
                            已选 {selectedQuestionIds.length} 题
                        </Badge>
                    ) : null}
                    <Button
                        type="button"
                        variant="default"
                        leftIcon={<Play size={16} />}
                        disabled={
                            !selectedQuestionIds.length || !modelColumns.length
                        }
                        onClick={() => setBatchModalOpen(true)}
                    >
                        批量运行
                    </Button>
                    {selectedQuestionIds.length ? (
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setSelectedQuestionIds([])}
                        >
                            清空勾选
                        </Button>
                    ) : null}
                </div>
            </div>

            {!projects.length ? (
                <EmptyState
                    icon={<BarChart3 size={22} />}
                    title="暂无可评测项目"
                    description="当前账号没有可审核项目，无法查看数据评测。"
                />
            ) : !modelColumns.length ? (
                <EmptyState
                    icon={<BarChart3 size={22} />}
                    title="暂无评测模型"
                    description="请先在管理员侧的 AI 策略中创建或启用评测策略。"
                />
            ) : rows.length ? (
                <div className="rounded-lg border border-border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12">
                                    <Checkbox
                                        checked={allVisibleSelected}
                                        aria-checked={
                                            someVisibleSelected
                                                ? "mixed"
                                                : allVisibleSelected
                                        }
                                        aria-label="选择当前页题目"
                                        onChange={(event) =>
                                            toggleAllVisible(
                                                event.target.checked,
                                            )
                                        }
                                    />
                                </TableHead>
                                <TableHead className="min-w-72 normal-case">
                                    question_id
                                </TableHead>
                                <TableHead className="min-w-40 normal-case">
                                    primary
                                </TableHead>
                                {modelColumns.map((model) => (
                                    <TableHead
                                        key={model.code}
                                        className="min-w-56 normal-case"
                                    >
                                        {model.label}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => {
                                const detailHref = buildDetailHref(
                                    basePath,
                                    row.id,
                                    selectedProjectId,
                                    page,
                                    pageSize,
                                );

                                return (
                                    <TableRow
                                        key={row.id}
                                        role="link"
                                        tabIndex={0}
                                        className="cursor-pointer"
                                        onClick={() => router.push(detailHref)}
                                        onKeyDown={(event) => {
                                            if (
                                                event.key === "Enter" ||
                                                event.key === " "
                                            ) {
                                                event.preventDefault();
                                                router.push(detailHref);
                                            }
                                        }}
                                    >
                                        <TableCell
                                            onClick={(event) =>
                                                event.stopPropagation()
                                            }
                                            onKeyDown={(event) =>
                                                event.stopPropagation()
                                            }
                                        >
                                            <Checkbox
                                                checked={selectedQuestionIdSet.has(
                                                    row.id,
                                                )}
                                                aria-label={`选择题目 ${row.sourceQuestionId}`}
                                                onChange={(event) =>
                                                    toggleRow(
                                                        row.id,
                                                        event.target.checked,
                                                    )
                                                }
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Link
                                                href={detailHref}
                                                className="font-medium text-primary hover:underline"
                                                onClick={(event) =>
                                                    event.stopPropagation()
                                                }
                                            >
                                                {row.sourceQuestionId}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{row.primary ?? "-"}</TableCell>
                                        {modelColumns.map((model) => (
                                            <TableCell key={model.code}>
                                                {resultBadge(
                                                    row.results[model.code],
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                <EmptyState
                    icon={<BarChart3 size={22} />}
                    title="暂无已通过题目"
                    description="当前项目还没有状态为通过的最新题目。"
                />
            )}

            {totalPages > 1 ? (
                <div className="flex items-center justify-end gap-2">
                    <Link
                        href={buildPageHref(
                            basePath,
                            selectedProjectId,
                            Math.max(1, page - 1),
                        )}
                        aria-disabled={page <= 1}
                        className={cn(
                            "inline-flex h-8 items-center justify-center rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-muted",
                            page <= 1 && "pointer-events-none opacity-50",
                        )}
                    >
                        上一页
                    </Link>
                    <span className="text-sm text-muted-foreground">
                        {page} / {totalPages}
                    </span>
                    <Link
                        href={buildPageHref(
                            basePath,
                            selectedProjectId,
                            Math.min(totalPages, page + 1),
                        )}
                        aria-disabled={page >= totalPages}
                        className={cn(
                            "inline-flex h-8 items-center justify-center rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-muted",
                            page >= totalPages && "pointer-events-none opacity-50",
                        )}
                    >
                        下一页
                    </Link>
                </div>
            ) : null}

            <Modal
                open={batchModalOpen}
                onOpenChange={setBatchModalOpen}
                title="批量运行数据评测"
                description={`已选择 ${selectedRows.length} 道题目`}
                width={560}
                footer={
                    <>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setBatchModalOpen(false)}
                            disabled={isSubmittingBatch}
                        >
                            取消
                        </Button>
                        <Button
                            type="button"
                            leftIcon={<Play size={16} />}
                            loading={isSubmittingBatch}
                            disabled={
                                !selectedRows.length ||
                                !selectedColumnCodes.length
                            }
                            onClick={submitBatchRun}
                        >
                            创建后台任务
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="grid gap-2">
                        <label
                            htmlFor="batch-run-models"
                            className="text-sm font-medium text-foreground"
                        >
                            运行模型
                        </label>
                        <MultiSelect
                            id="batch-run-models"
                            options={modelOptions}
                            value={selectedColumnCodes}
                            onChange={setSelectedColumnCodes}
                            placeholder="请选择模型"
                            disabled={isSubmittingBatch}
                        />
                        <p className="text-xs text-muted-foreground">
                            将为所选题目和模型创建后台队列任务。
                        </p>
                    </div>

                    <div className="rounded-md border border-border bg-muted/30 p-3">
                        <Checkbox
                            checked={skipSuccessful}
                            disabled={isSubmittingBatch}
                            label="跳过已成功模型"
                            onChange={(event) =>
                                setSkipSuccessful(event.target.checked)
                            }
                        />
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            开启后，已有成功结果的题目模型组合不会重复进入队列。
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="info">
                            题目 {selectedRows.length}
                        </Badge>
                        <Badge variant="outline">
                            模型 {selectedColumnCodes.length}
                        </Badge>
                        <Badge variant="outline">
                            预计执行项{" "}
                            {selectedRows.length * selectedColumnCodes.length}
                        </Badge>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
