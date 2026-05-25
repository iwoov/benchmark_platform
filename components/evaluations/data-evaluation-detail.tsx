import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import type {
    DataEvaluationModelColumn,
    DataEvaluationQuestionDetail,
    DataEvaluationResult,
} from "@/lib/evaluations/data-evaluations";

function formatResultStatus(result: DataEvaluationResult | null) {
    if (!result) {
        return <Badge variant="outline">未评测</Badge>;
    }

    if (result.status === "SUCCESS") {
        return <Badge variant="success">完成</Badge>;
    }

    if (result.status === "FAILED") {
        return <Badge variant="destructive">失败</Badge>;
    }

    return <Badge variant="warning">{result.status}</Badge>;
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

export function DataEvaluationDetail({
    question,
    modelColumns,
    results,
    listPath,
}: {
    question: DataEvaluationQuestionDetail;
    modelColumns: DataEvaluationModelColumn[];
    results: Record<string, DataEvaluationResult | null>;
    listPath: string;
}) {
    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow="Data Evaluation"
                title="数据评测详情"
                description={`${question.project.name} / ${question.datasource.name}`}
                action={
                    <Link
                        href={listPath}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-muted"
                    >
                        <ArrowLeft size={16} />
                        返回列表
                    </Link>
                }
            />

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
                <Card>
                    <CardHeader>
                        <CardTitle>{question.title}</CardTitle>
                        <CardDescription>
                            {question.externalRecordId}
                            {question.questionType ? ` · ${question.questionType}` : ""}
                            {question.difficulty ? ` · ${question.difficulty}` : ""}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FieldBlock label="题干" value={question.content} />
                        <FieldBlock label="答案" value={question.answer} />
                        <FieldBlock label="解析" value={question.analysis} />
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
                            const result = results[model.code] ?? null;

                            return (
                                <Card key={model.code}>
                                    <CardHeader className="flex-row items-start justify-between gap-3">
                                        <div>
                                            <CardTitle>{model.label}</CardTitle>
                                            <CardDescription>
                                                {result?.strategyName ??
                                                    "尚未产生评测结果"}
                                            </CardDescription>
                                        </div>
                                        {formatResultStatus(result)}
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {result ? (
                                            <>
                                                <div className="flex flex-wrap gap-2">
                                                    {result.difficultyLevel ? (
                                                        <Badge variant="primary">
                                                            {result.difficultyLevel}
                                                        </Badge>
                                                    ) : null}
                                                    {typeof result.score ===
                                                    "number" ? (
                                                        <Badge variant="info">
                                                            分值 {result.score}
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                                {result.summary ? (
                                                    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                                                        {result.summary}
                                                    </p>
                                                ) : null}
                                                {result.evidence.length ? (
                                                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                                                        {result.evidence.map(
                                                            (item, index) => (
                                                                <li key={index}>
                                                                    {item}
                                                                </li>
                                                            ),
                                                        )}
                                                    </ul>
                                                ) : null}
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
        </div>
    );
}
