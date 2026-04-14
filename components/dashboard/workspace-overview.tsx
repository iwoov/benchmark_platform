"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Segmented, Tag } from "antd";
import {
    ClipboardCheck,
    FolderKanban,
    Layers3,
    PencilLine,
    RefreshCw,
    ScanSearch,
} from "lucide-react";
import type {
    ReviewerPriorityProject,
    WorkspaceOverviewData,
    WorkspaceOverviewRole,
} from "@/lib/dashboard/overview";
import { PersistedReviewListLink } from "@/components/reviews/persisted-review-list-link";

const STORAGE_KEY = "workspace-overview-role";
const rolePreferenceListeners = new Set<() => void>();

function emitRolePreferenceChange() {
    for (const listener of rolePreferenceListeners) {
        listener();
    }
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

    if (value === "AUTHOR" || value === "REVIEWER") {
        return value;
    }

    return null;
}

function formatDateTime(value: string | null) {
    if (!value) {
        return "暂无记录";
    }

    return new Date(value).toLocaleString("zh-CN");
}

function getBatchStatusMeta(
    status: ReviewerPriorityProject["latestBatchStatus"],
) {
    switch (status) {
        case "RUNNING":
            return { label: "运行中", color: "processing" as const };
        case "SUCCESS":
            return { label: "成功", color: "success" as const };
        case "FAILED":
            return { label: "失败", color: "error" as const };
        case "PENDING":
            return { label: "排队中", color: "default" as const };
        case "CANCELLED":
            return { label: "已取消", color: "default" as const };
        case "CANCEL_REQUESTED":
            return { label: "取消中", color: "warning" as const };
        default:
            return { label: "暂无批量任务", color: "default" as const };
    }
}

export function WorkspaceOverview({
    data,
}: {
    data: WorkspaceOverviewData;
}) {
    const storedRole = useSyncExternalStore(
        subscribeRolePreference,
        getStoredRolePreference,
        () => null,
    );
    const activeRole =
        storedRole && data.availableRoles.includes(storedRole)
            ? storedRole
            : data.defaultRole;

    const roleOptions = data.availableRoles.map((role) => ({
        label: role === "AUTHOR" ? "AUTHOR" : "REVIEWER",
        value: role,
    }));
    const authorData = activeRole === "AUTHOR" ? data.author : null;
    const reviewerData = activeRole === "REVIEWER" ? data.reviewer : null;

    function handleRoleChange(value: string | number) {
        const nextRole = value as WorkspaceOverviewRole;
        window.localStorage.setItem(STORAGE_KEY, nextRole);
        emitRolePreferenceChange();
    }

    return (
        <>
            {data.availableRoles.length > 1 ? (
                <section className="content-surface">
                    <div className="overview-switch-row">
                        <div>
                            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                                工作角色
                            </h2>
                            <div className="muted" style={{ marginTop: 8 }}>
                                首页按当前工作重心切换，默认优先审核视图。
                            </div>
                        </div>
                        <Segmented
                            options={roleOptions}
                            value={activeRole}
                            onChange={handleRoleChange}
                        />
                    </div>
                </section>
            ) : null}

            {authorData ? <AuthorOverviewView data={authorData} /> : null}
            {reviewerData ? <ReviewerOverviewView data={reviewerData} /> : null}

            {!authorData && !reviewerData ? (
                <section className="content-surface">
                    <div className="overview-empty-state">
                        当前还没有可展示的工作角色。
                    </div>
                </section>
            ) : null}
        </>
    );
}

function AuthorOverviewView({
    data,
}: {
    data: NonNullable<WorkspaceOverviewData["author"]>;
}) {
    return (
        <>
            <section className="overview-metric-rail">
                <div className="overview-metric-tile">
                    <div className="overview-metric-icon">
                        <FolderKanban size={18} />
                    </div>
                    <div>
                        <div className="overview-metric-label">可出题项目</div>
                        <div className="stat-value">{data.projectCount}</div>
                        <div className="overview-metric-note">项目范围</div>
                    </div>
                </div>
                <div className="overview-metric-tile">
                    <div className="overview-metric-icon">
                        <PencilLine size={18} />
                    </div>
                    <div>
                        <div className="overview-metric-label">草稿题目</div>
                        <div className="stat-value">
                            {data.questionStatuses.DRAFT}
                        </div>
                        <div className="overview-metric-note">待完善</div>
                    </div>
                </div>
                <div className="overview-metric-tile">
                    <div className="overview-metric-icon">
                        <ClipboardCheck size={18} />
                    </div>
                    <div>
                        <div className="overview-metric-label">已提交</div>
                        <div className="stat-value">
                            {data.questionStatuses.SUBMITTED}
                        </div>
                        <div className="overview-metric-note">待进入审核</div>
                    </div>
                </div>
                <div className="overview-metric-tile">
                    <div className="overview-metric-icon">
                        <RefreshCw size={18} />
                    </div>
                    <div>
                        <div className="overview-metric-label">近 7 天更新</div>
                        <div className="stat-value">{data.updatedQuestions7d}</div>
                        <div className="overview-metric-note">
                            退回修改含在项目列表
                        </div>
                    </div>
                </div>
            </section>

            <section className="overview-two-column">
                <div className="content-surface">
                    <div className="section-head">
                        <div>
                            <h2
                                style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}
                            >
                                项目动态
                            </h2>
                            <div className="muted" style={{ marginTop: 8 }}>
                                优先看最近有更新的项目，以及需要继续补充的题目。
                            </div>
                        </div>
                    </div>

                    {data.projects.length ? (
                        <div className="overview-detail-list">
                            {data.projects.map((project) => (
                                <Link
                                    key={project.projectId}
                                    href={project.href}
                                    className="overview-detail-item"
                                >
                                    <div className="overview-detail-main">
                                        <div className="overview-item-title">
                                            {project.projectName}
                                        </div>
                                        <div className="overview-item-meta">
                                            {project.projectCode} · 最近更新{" "}
                                            {formatDateTime(project.lastActivityAt)}
                                        </div>
                                    </div>
                                    <div className="overview-inline-metrics">
                                        <span>题目 {project.questionCount}</span>
                                        <span>草稿 {project.draftCount}</span>
                                        <span>驳回 {project.rejectedCount}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="overview-empty-state">
                            当前没有可出题项目数据。
                        </div>
                    )}
                </div>

                <section className="content-surface">
                    <div className="section-head">
                        <div>
                            <h2
                                style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}
                            >
                                快捷入口
                            </h2>
                        </div>
                    </div>

                    <div className="overview-link-grid">
                        <Link href="/workspace/projects" className="overview-link-chip">
                            <FolderKanban size={16} />
                            <span>我的项目</span>
                        </Link>
                        <Link
                            href="/workspace/submissions"
                            className="overview-link-chip"
                        >
                            <PencilLine size={16} />
                            <span>出题任务</span>
                        </Link>
                    </div>

                    <div className="overview-side-note">
                        题目当前只支持按项目维度聚合，尚未区分到个人名下待办。
                    </div>
                </section>
            </section>
        </>
    );
}

function ReviewerOverviewView({
    data,
}: {
    data: NonNullable<WorkspaceOverviewData["reviewer"]>;
}) {
    return (
        <>
            <section className="overview-metric-rail overview-metric-rail-wide">
                <div className="overview-metric-tile">
                    <div className="overview-metric-icon">
                        <FolderKanban size={18} />
                    </div>
                    <div>
                        <div className="overview-metric-label">可审核项目</div>
                        <div className="stat-value">{data.projectCount}</div>
                        <div className="overview-metric-note">项目范围</div>
                    </div>
                </div>
                <div className="overview-metric-tile">
                    <div className="overview-metric-icon">
                        <ScanSearch size={18} />
                    </div>
                    <div>
                        <div className="overview-metric-label">待处理题目</div>
                        <div className="stat-value">
                            {data.pendingQuestionCount}
                        </div>
                        <div className="overview-metric-note">
                            SUBMITTED + UNDER_REVIEW
                        </div>
                    </div>
                </div>
                <div className="overview-metric-tile">
                    <div className="overview-metric-icon">
                        <ClipboardCheck size={18} />
                    </div>
                    <div>
                        <div className="overview-metric-label">我近 7 天完成</div>
                        <div className="stat-value">
                            {data.myCompletedReviews7d}
                        </div>
                        <div className="overview-metric-note">人工审核</div>
                    </div>
                </div>
                <div className="overview-metric-tile">
                    <div className="overview-metric-icon">
                        <Layers3 size={18} />
                    </div>
                    <div>
                        <div className="overview-metric-label">运行中批量任务</div>
                        <div className="stat-value">{data.runningBatchCount}</div>
                        <div className="overview-metric-note">实时占用</div>
                    </div>
                </div>
                <div className="overview-metric-tile">
                    <div className="overview-metric-icon">
                        <RefreshCw size={18} />
                    </div>
                    <div>
                        <div className="overview-metric-label">近 7 天失败批量</div>
                        <div className="stat-value">{data.failedBatchCount7d}</div>
                        <div className="overview-metric-note">需要排查</div>
                    </div>
                </div>
            </section>

            <section className="overview-two-column">
                <div className="content-surface">
                    <div className="section-head">
                        <div>
                            <h2
                                style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}
                            >
                                审核优先队列
                            </h2>
                            <div className="muted" style={{ marginTop: 8 }}>
                                先看待处理量更高、最近批量运行异常的项目。
                            </div>
                        </div>
                    </div>

                    {data.projects.length ? (
                        <div className="overview-detail-list">
                            {data.projects.map((project) => {
                                const batchStatus = getBatchStatusMeta(
                                    project.latestBatchStatus,
                                );

                                return (
                                    <Link
                                        key={project.projectId}
                                        href={project.href}
                                        className="overview-detail-item"
                                    >
                                        <div className="overview-detail-main">
                                            <div className="overview-item-title">
                                                {project.projectName}
                                            </div>
                                            <div className="overview-item-meta">
                                                {project.projectCode} · 最近批量任务{" "}
                                                {formatDateTime(
                                                    project.latestBatchCreatedAt,
                                                )}
                                            </div>
                                        </div>
                                        <div className="overview-detail-tags">
                                            <Tag color={batchStatus.color}>
                                                {batchStatus.label}
                                            </Tag>
                                            <span>
                                                待处理 {project.pendingQuestionCount}
                                            </span>
                                            <span>
                                                近 7 天完成 {project.completedReviews7d}
                                            </span>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="overview-empty-state">
                            当前没有审核项目数据。
                        </div>
                    )}
                </div>

                <section className="content-surface">
                    <div className="section-head">
                        <div>
                            <h2
                                style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}
                            >
                                快捷入口
                            </h2>
                        </div>
                    </div>

                    <div className="overview-link-grid">
                        <PersistedReviewListLink
                            href="/workspace/reviews"
                            listPath="/workspace/reviews"
                            className="overview-link-chip"
                        >
                            <ScanSearch size={16} />
                            <span>审核任务</span>
                        </PersistedReviewListLink>
                        <Link
                            href="/workspace/review-batches"
                            className="overview-link-chip"
                        >
                            <Layers3 size={16} />
                            <span>批量任务</span>
                        </Link>
                    </div>

                    <div className="overview-side-note">
                        “我近 7 天完成”只统计你本人提交的人工审核记录。
                    </div>
                </section>
            </section>
        </>
    );
}
