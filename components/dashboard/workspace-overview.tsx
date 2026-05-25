"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
    ClipboardCheck,
    FolderKanban,
    Layers3,
    PencilLine,
    RefreshCw,
    ScanSearch,
    Sparkles,
} from "lucide-react";
import type {
    ReviewerPriorityProject,
    WorkspaceOverviewData,
    WorkspaceOverviewRole,
} from "@/lib/dashboard/overview";
import { PersistedReviewListLink } from "@/components/reviews/persisted-review-list-link";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";

const STORAGE_KEY = "workspace-overview-role";
const rolePreferenceListeners = new Set<() => void>();

function emitRolePreferenceChange() {
    for (const listener of rolePreferenceListeners) listener();
}

function subscribeRolePreference(listener: () => void) {
    rolePreferenceListeners.add(listener);
    window.addEventListener("storage", listener);
    return () => {
        rolePreferenceListeners.delete(listener);
        window.removeEventListener("storage", listener);
    };
}

function getStoredRolePreference() {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "AUTHOR" || value === "REVIEWER") return value;
    return null;
}

function formatDateTime(value: string | null) {
    if (!value) return "暂无记录";
    return new Date(value).toLocaleString("zh-CN");
}

function getBatchStatusMeta(
    status: ReviewerPriorityProject["latestBatchStatus"],
): { label: string; variant: BadgeVariant } {
    switch (status) {
        case "RUNNING":
            return { label: "运行中", variant: "primary" };
        case "SUCCESS":
            return { label: "成功", variant: "success" };
        case "FAILED":
            return { label: "失败", variant: "destructive" };
        case "PENDING":
            return { label: "排队中", variant: "default" };
        case "CANCELLED":
            return { label: "已取消", variant: "default" };
        case "CANCEL_REQUESTED":
            return { label: "取消中", variant: "warning" };
        default:
            return { label: "暂无批量任务", variant: "outline" };
    }
}

export function WorkspaceOverview({ data }: { data: WorkspaceOverviewData }) {
    const storedRole = useSyncExternalStore(
        subscribeRolePreference,
        getStoredRolePreference,
        () => null,
    );
    const activeRole =
        storedRole && data.availableRoles.includes(storedRole) ? storedRole : data.defaultRole;

    const roleOptions = data.availableRoles.map((role) => ({
        label: role === "AUTHOR" ? "AUTHOR" : "REVIEWER",
        value: role,
    }));
    const authorData = activeRole === "AUTHOR" ? data.author : null;
    const reviewerData = activeRole === "REVIEWER" ? data.reviewer : null;

    function handleRoleChange(value: WorkspaceOverviewRole) {
        window.localStorage.setItem(STORAGE_KEY, value);
        emitRolePreferenceChange();
    }

    return (
        <div className="space-y-6">
            {data.availableRoles.length > 1 && (
                <Card>
                    <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h2 className="text-base font-semibold tracking-tight">工作角色</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                首页按当前工作重心切换，默认优先审核视图。
                            </p>
                        </div>
                        <Segmented
                            options={roleOptions}
                            value={activeRole}
                            onChange={handleRoleChange}
                        />
                    </CardContent>
                </Card>
            )}

            {authorData && <AuthorOverviewView data={authorData} />}
            {reviewerData && <ReviewerOverviewView data={reviewerData} />}

            {!authorData && !reviewerData && (
                <Card>
                    <CardContent className="text-sm text-muted-foreground">
                        当前还没有可展示的工作角色。
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

type MetricTone = "primary" | "info" | "warning" | "success" | "destructive";

const toneClasses: Record<MetricTone, string> = {
    primary: "bg-primary-soft text-primary",
    info: "bg-info-soft text-info",
    warning: "bg-warning-soft text-warning",
    success: "bg-success-soft text-success",
    destructive: "bg-destructive-soft text-destructive",
};

function MetricTile({
    icon: Icon,
    label,
    value,
    note,
    tone = "primary",
}: {
    icon: React.ComponentType<{ size?: number }>;
    label: string;
    value: string | number;
    note: string;
    tone?: MetricTone;
}) {
    return (
        <Card>
            <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {label}
                    </span>
                    <span
                        className={`grid h-9 w-9 place-items-center rounded-lg ${toneClasses[tone]}`}
                    >
                        <Icon size={18} />
                    </span>
                </div>
                <div className="font-mono text-xl font-semibold tracking-tight text-foreground">
                    {value}
                </div>
                <p className="text-xs text-muted-foreground">{note}</p>
            </CardContent>
        </Card>
    );
}

function AuthorOverviewView({ data }: { data: NonNullable<WorkspaceOverviewData["author"]> }) {
    return (
        <div className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile icon={FolderKanban} label="可出题项目" value={data.projectCount} note="项目范围" />
                <MetricTile
                    icon={PencilLine}
                    label="草稿题目"
                    value={data.questionStatuses.DRAFT}
                    note="待完善"
                    tone="warning"
                />
                <MetricTile
                    icon={ClipboardCheck}
                    label="已提交"
                    value={data.questionStatuses.SUBMITTED}
                    note="待进入审核"
                    tone="info"
                />
                <MetricTile
                    icon={RefreshCw}
                    label="近 7 天更新"
                    value={data.updatedQuestions7d}
                    note="退回修改含在项目列表"
                    tone="success"
                />
            </section>

            <section className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
                <Card>
                    <CardContent className="space-y-4">
                        <div>
                            <h3 className="text-base font-semibold tracking-tight">项目动态</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                优先看最近有更新的项目，以及需要继续补充的题目。
                            </p>
                        </div>
                        {data.projects.length ? (
                            <div className="divide-y divide-border/60">
                                {data.projects.map((project) => (
                                    <Link
                                        key={project.projectId}
                                        href={project.href}
                                        className="flex flex-col gap-2 py-3 text-sm transition-colors hover:bg-muted/30 md:flex-row md:items-center md:justify-between"
                                    >
                                        <div>
                                            <div className="font-medium text-foreground">
                                                {project.projectName}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {project.projectCode} · 最近更新{" "}
                                                {formatDateTime(project.lastActivityAt)}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                            <span>题目 {project.questionCount}</span>
                                            <span>草稿 {project.draftCount}</span>
                                            <span>驳回 {project.rejectedCount}</span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p className="py-4 text-sm text-muted-foreground">
                                当前没有可出题项目数据。
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="space-y-4">
                        <h3 className="text-base font-semibold tracking-tight">快捷入口</h3>
                        <div className="flex flex-wrap gap-2">
                            <Link
                                href="/workspace/projects"
                                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
                            >
                                <FolderKanban size={14} />
                                我的项目
                            </Link>
                            <Link
                                href="/workspace/submissions"
                                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
                            >
                                <PencilLine size={14} />
                                出题任务
                            </Link>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            题目当前只支持按项目维度聚合，尚未区分到个人名下待办。
                        </p>
                    </CardContent>
                </Card>
            </section>
        </div>
    );
}

function ReviewerOverviewView({ data }: { data: NonNullable<WorkspaceOverviewData["reviewer"]> }) {
    return (
        <div className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <MetricTile icon={FolderKanban} label="可审核项目" value={data.projectCount} note="项目范围" />
                <MetricTile
                    icon={ScanSearch}
                    label="待处理题目"
                    value={data.pendingQuestionCount}
                    note="SUBMITTED + UNDER_REVIEW"
                    tone="warning"
                />
                <MetricTile
                    icon={ClipboardCheck}
                    label="我近 7 天完成"
                    value={data.myCompletedReviews7d}
                    note="人工审核"
                    tone="success"
                />
                <MetricTile
                    icon={Layers3}
                    label="运行中批量任务"
                    value={data.runningBatchCount}
                    note="实时占用"
                    tone="info"
                />
                <MetricTile
                    icon={RefreshCw}
                    label="近 7 天失败批量"
                    value={data.failedBatchCount7d}
                    note="需要排查"
                    tone="destructive"
                />
            </section>

            <section className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
                <Card>
                    <CardContent className="space-y-4">
                        <div>
                            <h3 className="text-base font-semibold tracking-tight">审核优先队列</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                先看待处理量更高、最近批量运行异常的项目。
                            </p>
                        </div>
                        {data.projects.length ? (
                            <div className="divide-y divide-border/60">
                                {data.projects.map((project) => {
                                    const batchStatus = getBatchStatusMeta(project.latestBatchStatus);
                                    return (
                                        <Link
                                            key={project.projectId}
                                            href={project.href}
                                            className="flex flex-col gap-2 py-3 text-sm transition-colors hover:bg-muted/30 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div>
                                                <div className="font-medium text-foreground">
                                                    {project.projectName}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {project.projectCode} · 最近批量任务{" "}
                                                    {formatDateTime(project.latestBatchCreatedAt)}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                                <Badge variant={batchStatus.variant} size="sm" dot>
                                                    {batchStatus.label}
                                                </Badge>
                                                <span>待处理 {project.pendingQuestionCount}</span>
                                                <span>近 7 天完成 {project.completedReviews7d}</span>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="py-4 text-sm text-muted-foreground">
                                当前没有审核项目数据。
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="space-y-4">
                        <h3 className="text-base font-semibold tracking-tight">快捷入口</h3>
                        <div className="flex flex-wrap gap-2">
                            <PersistedReviewListLink
                                href="/workspace/reviews"
                                listPath="/workspace/reviews"
                                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
                            >
                                <ScanSearch size={14} />
                                数据质检
                            </PersistedReviewListLink>
                            <PersistedReviewListLink
                                href="/workspace/data-cleaning"
                                listPath="/workspace/data-cleaning"
                                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
                            >
                                <Sparkles size={14} />
                                数据清洗
                            </PersistedReviewListLink>
                            <Link
                                href="/workspace/review-batches"
                                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
                            >
                                <Layers3 size={14} />
                                批量任务
                            </Link>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            &quot;我近 7 天完成&quot;只统计你本人提交的人工审核记录。
                        </p>
                    </CardContent>
                </Card>
            </section>
        </div>
    );
}
