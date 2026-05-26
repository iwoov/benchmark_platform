"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Edit3, Play, RefreshCw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MultiSelect } from "@/components/ui/multi-select";
import { Popconfirm } from "@/components/ui/popconfirm";
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
    failures?: Array<{
        questionId: string;
        columnCode: string;
        message: string;
    }>;
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

type QuestionOperationResponse = {
    success?: string;
    error?: string;
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

function stringifyRawValue(value: unknown) {
    if (typeof value === "string") {
        return value;
    }

    return JSON.stringify(value, null, 2);
}

function parseEditedRawValue(originalValue: unknown, input: string) {
    if (typeof originalValue === "string") {
        return input;
    }

    try {
        return JSON.parse(input);
    } catch {
        return input;
    }
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
    const [batchConcurrency, setBatchConcurrency] = useState(1);
    const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
    const [editingRow, setEditingRow] =
        useState<DataEvaluationQuestionRow | null>(null);
    const [editingFieldKey, setEditingFieldKey] = useState("");
    const [editingFieldValue, setEditingFieldValue] = useState("");
    const [isSavingField, setIsSavingField] = useState(false);
    const [updatingRow, setUpdatingRow] =
        useState<DataEvaluationQuestionRow | null>(null);
    const [replacementFile, setReplacementFile] = useState<File | null>(null);
    const [isReplacingRecord, setIsReplacingRecord] = useState(false);
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
    const editingFieldKeys = useMemo(
        () => (editingRow ? Object.keys(editingRow.rawRecord) : []),
        [editingRow],
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
                    concurrency: Math.min(
                        2,
                        Math.max(1, Math.floor(batchConcurrency || 1)),
                    ),
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
                      payload.failures?.[0]?.message
                          ? `原因：${payload.failures[0].message}`
                          : null,
                  ]
                      .filter(Boolean)
                      .join("，")
                : (payload.success ?? "后台 worker 会按模型配置执行。");

            if (summary?.failedCount && !summary.createdCount) {
                toast.error({
                    title: "批量任务创建失败",
                    description,
                });
            } else if (summary?.failedCount) {
                toast.warning({
                    title: "部分批量任务已提交",
                    description,
                });
                setBatchModalOpen(false);
                setSelectedQuestionIds([]);
                router.refresh();
            } else {
                toast.success({
                    title: summary?.createdCount
                        ? "批量任务已提交"
                        : "没有新任务",
                    description,
                });
                setBatchModalOpen(false);
                setSelectedQuestionIds([]);
                router.refresh();
            }
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

    const openEditModal = (row: DataEvaluationQuestionRow) => {
        const fieldKeys = Object.keys(row.rawRecord);
        const fieldKey = fieldKeys[0] ?? "";

        setEditingRow(row);
        setEditingFieldKey(fieldKey);
        setEditingFieldValue(stringifyRawValue(row.rawRecord[fieldKey]));
    };

    const updateEditingField = (fieldKey: string) => {
        setEditingFieldKey(fieldKey);
        setEditingFieldValue(
            stringifyRawValue(editingRow?.rawRecord[fieldKey]),
        );
    };

    const submitFieldEdit = async () => {
        if (!editingRow || !editingFieldKey) {
            return;
        }

        setIsSavingField(true);

        try {
            const response = await fetch(
                `/api/data-evaluations/questions/${encodeURIComponent(
                    editingRow.id,
                )}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        fieldKey: editingFieldKey,
                        value: parseEditedRawValue(
                            editingRow.rawRecord[editingFieldKey],
                            editingFieldValue,
                        ),
                    }),
                },
            );
            const payload = (await response
                .json()
                .catch(() => ({}))) as QuestionOperationResponse;

            if (!response.ok) {
                throw new Error(payload.error ?? "字段更新失败。");
            }

            toast.success({
                title: "字段已更新",
                description: payload.success ?? "题目字段已保存。",
            });
            setEditingRow(null);
            router.refresh();
        } catch (error) {
            toast.error({
                title: "字段更新失败",
                description:
                    error instanceof Error ? error.message : "字段更新失败。",
            });
        } finally {
            setIsSavingField(false);
        }
    };

    const submitRecordReplacement = async () => {
        if (!updatingRow || !replacementFile) {
            return;
        }

        setIsReplacingRecord(true);

        try {
            const formData = new FormData();
            formData.set("file", replacementFile);

            const response = await fetch(
                `/api/data-evaluations/questions/${encodeURIComponent(
                    updatingRow.id,
                )}`,
                {
                    method: "PUT",
                    body: formData,
                },
            );
            const payload = (await response
                .json()
                .catch(() => ({}))) as QuestionOperationResponse;

            if (!response.ok) {
                throw new Error(payload.error ?? "原始记录覆盖失败。");
            }

            toast.success({
                title: "原始记录已覆盖",
                description: payload.success ?? "题目原始记录已更新。",
            });
            setUpdatingRow(null);
            setReplacementFile(null);
            router.refresh();
        } catch (error) {
            toast.error({
                title: "原始记录覆盖失败",
                description:
                    error instanceof Error
                        ? error.message
                        : "原始记录覆盖失败。",
            });
        } finally {
            setIsReplacingRecord(false);
        }
    };

    const deleteQuestion = async (row: DataEvaluationQuestionRow) => {
        const response = await fetch(
            `/api/data-evaluations/questions/${encodeURIComponent(row.id)}`,
            {
                method: "DELETE",
            },
        );
        const payload = (await response
            .json()
            .catch(() => ({}))) as QuestionOperationResponse;

        if (!response.ok) {
            toast.error({
                title: "删除失败",
                description: payload.error ?? "题目删除失败。",
            });
            return;
        }

        toast.success({
            title: "题目已删除",
            description: payload.success ?? "该条数据已删除。",
        });
        setSelectedQuestionIds((previous) =>
            previous.filter((questionId) => questionId !== row.id),
        );
        router.refresh();
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
                                <TableHead className="sticky right-0 min-w-40 bg-muted/95 text-right">
                                    操作
                                </TableHead>
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
                                                prefetch={false}
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
                                        <TableCell
                                            className="sticky right-0 bg-card text-right shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]"
                                            onClick={(event) =>
                                                event.stopPropagation()
                                            }
                                            onKeyDown={(event) =>
                                                event.stopPropagation()
                                            }
                                        >
                                            {row.canManage ? (
                                                <div className="inline-flex items-center gap-1">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        title="编辑字段"
                                                        aria-label="编辑字段"
                                                        onClick={() =>
                                                            openEditModal(row)
                                                        }
                                                    >
                                                        <Edit3 size={15} />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        title="JSON 覆盖"
                                                        aria-label="JSON 覆盖"
                                                        onClick={() => {
                                                            setUpdatingRow(row);
                                                            setReplacementFile(
                                                                null,
                                                            );
                                                        }}
                                                    >
                                                        <RefreshCw size={15} />
                                                    </Button>
                                                    <Popconfirm
                                                        title="删除题目"
                                                        description="删除后该题目的评测结果和运行记录会一并删除。"
                                                        confirmText="删除"
                                                        tone="destructive"
                                                        onConfirm={() =>
                                                            deleteQuestion(row)
                                                        }
                                                    >
                                                        {(open) => (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                title="删除"
                                                                aria-label="删除"
                                                                onClick={open}
                                                            >
                                                                <Trash2
                                                                    size={15}
                                                                />
                                                            </Button>
                                                        )}
                                                    </Popconfirm>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">
                                                    -
                                                </span>
                                            )}
                                        </TableCell>
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
                        prefetch={false}
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
                        prefetch={false}
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

                    <div className="grid gap-2">
                        <label
                            htmlFor="batch-run-concurrency"
                            className="text-sm font-medium text-foreground"
                        >
                            并发数
                        </label>
                        <Input
                            id="batch-run-concurrency"
                            type="number"
                            min={1}
                            max={2}
                            step={1}
                            value={batchConcurrency}
                            disabled={isSubmittingBatch}
                            onChange={(event) =>
                                setBatchConcurrency(
                                    Math.min(
                                        2,
                                        Math.max(
                                            1,
                                            Math.floor(
                                                Number(event.target.value) || 1,
                                            ),
                                        ),
                                    ),
                                )
                            }
                        />
                        <p className="text-xs leading-5 text-muted-foreground">
                            同一批量任务最多同时执行 2 个评测项。
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
                        <Badge variant="outline">
                            并发 {batchConcurrency}
                        </Badge>
                    </div>
                </div>
            </Modal>

            <Modal
                open={Boolean(editingRow)}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditingRow(null);
                    }
                }}
                title="编辑字段"
                description={editingRow?.sourceQuestionId}
                width={640}
                footer={
                    <>
                        <Button
                            type="button"
                            variant="secondary"
                            disabled={isSavingField}
                            onClick={() => setEditingRow(null)}
                        >
                            取消
                        </Button>
                        <Button
                            type="button"
                            leftIcon={<Edit3 size={16} />}
                            loading={isSavingField}
                            disabled={!editingFieldKey}
                            onClick={submitFieldEdit}
                        >
                            保存
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="edit-field-key">字段</Label>
                        <Select
                            id="edit-field-key"
                            value={editingFieldKey}
                            disabled={isSavingField}
                            onChange={(event) =>
                                updateEditingField(event.target.value)
                            }
                        >
                            {editingFieldKeys.map((fieldKey) => (
                                <option key={fieldKey} value={fieldKey}>
                                    {fieldKey}
                                </option>
                            ))}
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="edit-field-value">值</Label>
                        <Textarea
                            id="edit-field-value"
                            value={editingFieldValue}
                            disabled={isSavingField}
                            className="min-h-44 font-mono text-xs"
                            onChange={(event) =>
                                setEditingFieldValue(event.target.value)
                            }
                        />
                    </div>
                </div>
            </Modal>

            <Modal
                open={Boolean(updatingRow)}
                onOpenChange={(open) => {
                    if (!open) {
                        setUpdatingRow(null);
                        setReplacementFile(null);
                    }
                }}
                title="JSON 覆盖"
                description={updatingRow?.sourceQuestionId}
                width={560}
                footer={
                    <>
                        <Button
                            type="button"
                            variant="secondary"
                            disabled={isReplacingRecord}
                            onClick={() => {
                                setUpdatingRow(null);
                                setReplacementFile(null);
                            }}
                        >
                            取消
                        </Button>
                        <Button
                            type="button"
                            leftIcon={<RefreshCw size={16} />}
                            loading={isReplacingRecord}
                            disabled={!replacementFile}
                            onClick={submitRecordReplacement}
                        >
                            覆盖
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="replace-json-file">JSON 文件</Label>
                        <Input
                            id="replace-json-file"
                            type="file"
                            accept="application/json,.json"
                            disabled={isReplacingRecord}
                            onChange={(event) =>
                                setReplacementFile(
                                    event.target.files?.[0] ?? null,
                                )
                            }
                        />
                    </div>
                    {updatingRow ? (
                        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                            当前字段数 {Object.keys(updatingRow.rawRecord).length}
                        </div>
                    ) : null}
                </div>
            </Modal>
        </div>
    );
}
