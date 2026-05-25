import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
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

function resultBadge(result: DataEvaluationResult | null) {
    if (!result) {
        return <Badge variant="outline">未评测</Badge>;
    }

    if (result.status === "SUCCESS") {
        return (
            <span className="inline-flex flex-col gap-1">
                <Badge variant="success">
                    {result.difficultyLevel ?? "完成"}
                    {typeof result.score === "number" ? ` · ${result.score}` : ""}
                </Badge>
                {result.summary ? (
                    <span className="line-clamp-2 max-w-56 text-xs leading-5 text-muted-foreground">
                        {result.summary}
                    </span>
                ) : null}
            </span>
        );
    }

    if (result.status === "FAILED") {
        return <Badge variant="destructive">失败</Badge>;
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
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow="Data Evaluation"
                title="数据评测"
                description="只展示已通过的题目，右侧按评测策略中勾选的模型展示最新评测结果。"
            />

            <div className="flex flex-wrap items-center gap-2">
                {projects.map((project) => (
                    <Link
                        key={project.id}
                        href={`${basePath}?projectId=${project.id}`}
                        className={cn(
                            "inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium shadow-xs transition-colors",
                            project.id === selectedProjectId
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "border border-border bg-card text-foreground hover:bg-muted",
                        )}
                    >
                        {project.name}
                    </Link>
                ))}
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
                    description="请先在管理员侧的评测策略工具中勾选模型并保存策略。"
                />
            ) : rows.length ? (
                <div className="rounded-lg border border-border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-80">题目</TableHead>
                                <TableHead>数据源</TableHead>
                                <TableHead>题型</TableHead>
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
                            {rows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <Link
                                            href={`${basePath}/${row.id}?projectId=${selectedProjectId}&page=${page}`}
                                            className="font-medium text-primary hover:underline"
                                        >
                                            {row.title}
                                        </Link>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {row.externalRecordId}
                                        </div>
                                    </TableCell>
                                    <TableCell>{row.datasourceName}</TableCell>
                                    <TableCell>
                                        {row.questionType ?? "未标注"}
                                    </TableCell>
                                    {modelColumns.map((model) => (
                                        <TableCell key={model.code}>
                                            {resultBadge(row.results[model.code])}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
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
        </div>
    );
}
