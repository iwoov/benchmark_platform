import {
    Prisma,
    BatchRunStatus,
    DataSourceStatus,
    PlatformRole,
    ProjectStatus,
    QuestionStatus,
    ReviewDecision,
    RunStatus,
    SyncStatus,
    UserStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getWorkspaceContext } from "@/lib/workspace/context";

const LAST_7_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_QUESTION_STATUSES = [
    QuestionStatus.SUBMITTED,
    QuestionStatus.UNDER_REVIEW,
] as const;

export type OverviewQuestionStatus =
    | "DRAFT"
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "APPROVED"
    | "REJECTED";

export type StatusCountMap = Record<OverviewQuestionStatus, number>;

export type RecentBatchIssue = {
    id: string;
    projectId: string;
    projectName: string;
    projectCode: string;
    strategyName: string;
    status: "FAILED" | "CANCELLED" | "CANCEL_REQUESTED";
    createdAt: string;
    errorMessage: string | null;
    href: string;
};

export type RecentSyncIssue = {
    id: string;
    projectId: string;
    projectName: string;
    projectCode: string;
    datasourceName: string;
    createdAt: string;
    action: string;
    errorMessage: string | null;
    href: string;
};

export type RiskProject = {
    projectId: string;
    projectName: string;
    projectCode: string;
    pendingQuestionCount: number;
    failedSyncCount7d: number;
    failedBatchCount7d: number;
    href: string;
};

export type ReviewerPriorityProject = {
    projectId: string;
    projectName: string;
    projectCode: string;
    pendingQuestionCount: number;
    completedReviews7d: number;
    latestBatchStatus:
        | "PENDING"
        | "RUNNING"
        | "SUCCESS"
        | "FAILED"
        | "CANCEL_REQUESTED"
        | "CANCELLED"
        | null;
    latestBatchCreatedAt: string | null;
    href: string;
};

export type AuthorProjectSummary = {
    projectId: string;
    projectName: string;
    projectCode: string;
    questionCount: number;
    draftCount: number;
    rejectedCount: number;
    lastActivityAt: string;
    href: string;
};

export type SuperAdminOverviewData = {
    role: "SUPER_ADMIN";
    scale: {
        activeUsers: number;
        activeProjects: number;
        activeDatasources: number;
        newProjects7d: number;
        newDatasources7d: number;
    };
    aiResources: {
        providerCount: number;
        endpointCount: number;
        modelCount: number;
        enabledStrategyCount: number;
    };
    aiRuns: {
        total7d: number;
        success7d: number;
        failed7d: number;
        failureRate7d: number;
    };
    runningBatchCount: number;
    failedBatchCount7d: number;
    failedSyncCount7d: number;
    recentFailedBatches: RecentBatchIssue[];
    recentFailedSyncs: RecentSyncIssue[];
};

export type PlatformAdminOverviewData = {
    role: "PLATFORM_ADMIN";
    scale: {
        activeProjects: number;
        activeExperts: number;
        activeDatasources: number;
        importedDatasources7d: number;
    };
    questionStatuses: StatusCountMap;
    pendingQuestionCount: number;
    completedReviews7d: number;
    needsRevisionReviews7d: number;
    syncSummary7d: {
        successCount: number;
        failedCount: number;
    };
    recentFailedSyncs: RecentSyncIssue[];
    riskProjects: RiskProject[];
};

export type AdminOverviewData =
    | SuperAdminOverviewData
    | PlatformAdminOverviewData;

export type WorkspaceOverviewRole = "AUTHOR" | "REVIEWER";

export type AuthorOverviewData = {
    projectCount: number;
    questionStatuses: Pick<StatusCountMap, "DRAFT" | "SUBMITTED" | "REJECTED">;
    updatedQuestions7d: number;
    projects: AuthorProjectSummary[];
};

export type ReviewerOverviewData = {
    projectCount: number;
    pendingQuestionCount: number;
    myCompletedReviews7d: number;
    runningBatchCount: number;
    failedBatchCount7d: number;
    projects: ReviewerPriorityProject[];
};

export type WorkspaceOverviewData = {
    availableRoles: WorkspaceOverviewRole[];
    defaultRole: WorkspaceOverviewRole;
    author: AuthorOverviewData | null;
    reviewer: ReviewerOverviewData | null;
};

function getWindowStart() {
    return new Date(Date.now() - LAST_7_DAYS_IN_MS);
}

function emptyStatusCounts(): StatusCountMap {
    return {
        DRAFT: 0,
        SUBMITTED: 0,
        UNDER_REVIEW: 0,
        APPROVED: 0,
        REJECTED: 0,
    };
}

function applyQuestionStatusCounts(
    base: StatusCountMap,
    rows: Array<{ status: QuestionStatus; _count: { _all: number } }>,
) {
    for (const row of rows) {
        if (row.status in base) {
            base[row.status as OverviewQuestionStatus] = row._count._all;
        }
    }

    return base;
}

function mapCountRows(
    rows: Array<{ projectId: string; _count: { _all: number } }>,
) {
    return new Map(rows.map((row) => [row.projectId, row._count._all]));
}

function calculateFailureRate(total: number, failed: number) {
    if (!total) {
        return 0;
    }

    return Number(((failed / total) * 100).toFixed(1));
}

function emptySuperAdminOverview(): SuperAdminOverviewData {
    return {
        role: "SUPER_ADMIN",
        scale: {
            activeUsers: 0,
            activeProjects: 0,
            activeDatasources: 0,
            newProjects7d: 0,
            newDatasources7d: 0,
        },
        aiResources: {
            providerCount: 0,
            endpointCount: 0,
            modelCount: 0,
            enabledStrategyCount: 0,
        },
        aiRuns: {
            total7d: 0,
            success7d: 0,
            failed7d: 0,
            failureRate7d: 0,
        },
        runningBatchCount: 0,
        failedBatchCount7d: 0,
        failedSyncCount7d: 0,
        recentFailedBatches: [],
        recentFailedSyncs: [],
    };
}

function emptyPlatformAdminOverview(): PlatformAdminOverviewData {
    return {
        role: "PLATFORM_ADMIN",
        scale: {
            activeProjects: 0,
            activeExperts: 0,
            activeDatasources: 0,
            importedDatasources7d: 0,
        },
        questionStatuses: emptyStatusCounts(),
        pendingQuestionCount: 0,
        completedReviews7d: 0,
        needsRevisionReviews7d: 0,
        syncSummary7d: {
            successCount: 0,
            failedCount: 0,
        },
        recentFailedSyncs: [],
        riskProjects: [],
    };
}

function isDatabaseUnavailableError(error: unknown) {
    if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P1001"
    ) {
        return true;
    }

    return (
        error instanceof Error &&
        error.message.includes("Can't reach database server")
    );
}

function toRecentBatchIssueStatus(
    status: BatchRunStatus,
): RecentBatchIssue["status"] {
    if (status === BatchRunStatus.FAILED) {
        return "FAILED";
    }

    if (status === BatchRunStatus.CANCELLED) {
        return "CANCELLED";
    }

    return "CANCEL_REQUESTED";
}

export async function getAdminOverview(
    role: "SUPER_ADMIN" | "PLATFORM_ADMIN",
): Promise<AdminOverviewData> {
    if (!process.env.DATABASE_URL) {
        return role === "SUPER_ADMIN"
            ? emptySuperAdminOverview()
            : emptyPlatformAdminOverview();
    }

    try {
        return role === "SUPER_ADMIN"
            ? await getSuperAdminOverview()
            : await getPlatformAdminOverview();
    } catch (error) {
        if (!isDatabaseUnavailableError(error)) {
            throw error;
        }

        console.error("[dashboard] database unavailable while building overview", error);

        return role === "SUPER_ADMIN"
            ? emptySuperAdminOverview()
            : emptyPlatformAdminOverview();
    }
}

async function getSuperAdminOverview(): Promise<SuperAdminOverviewData> {
    const windowStart = getWindowStart();
    const [
        activeUsers,
        activeProjects,
        activeDatasources,
        newProjects7d,
        newDatasources7d,
        providerCount,
        endpointCount,
        modelCount,
        enabledStrategyCount,
        totalAiRuns7d,
        successAiRuns7d,
        failedAiRuns7d,
        runningBatchCount,
        failedBatchCount7d,
        failedSyncCount7d,
        recentFailedBatches,
        recentFailedSyncs,
    ] = await Promise.all([
        prisma.user.count({
            where: {
                status: UserStatus.ACTIVE,
            },
        }),
        prisma.project.count({
            where: {
                status: ProjectStatus.ACTIVE,
            },
        }),
        prisma.projectDataSource.count({
            where: {
                status: DataSourceStatus.ACTIVE,
            },
        }),
        prisma.project.count({
            where: {
                createdAt: {
                    gte: windowStart,
                },
            },
        }),
        prisma.projectDataSource.count({
            where: {
                createdAt: {
                    gte: windowStart,
                },
            },
        }),
        prisma.aiProvider.count(),
        prisma.aiProviderEndpoint.count(),
        prisma.aiModel.count(),
        prisma.aiReviewStrategy.count({
            where: {
                enabled: true,
            },
        }),
        prisma.aiReviewStrategyRun.count({
            where: {
                createdAt: {
                    gte: windowStart,
                },
            },
        }),
        prisma.aiReviewStrategyRun.count({
            where: {
                createdAt: {
                    gte: windowStart,
                },
                status: RunStatus.SUCCESS,
            },
        }),
        prisma.aiReviewStrategyRun.count({
            where: {
                createdAt: {
                    gte: windowStart,
                },
                status: RunStatus.FAILED,
            },
        }),
        prisma.aiReviewStrategyBatchRun.count({
            where: {
                status: BatchRunStatus.RUNNING,
            },
        }),
        prisma.aiReviewStrategyBatchRun.count({
            where: {
                createdAt: {
                    gte: windowStart,
                },
                status: BatchRunStatus.FAILED,
            },
        }),
        prisma.syncLog.count({
            where: {
                createdAt: {
                    gte: windowStart,
                },
                status: SyncStatus.FAILED,
            },
        }),
        prisma.aiReviewStrategyBatchRun.findMany({
            where: {
                createdAt: {
                    gte: windowStart,
                },
                status: {
                    in: [
                        BatchRunStatus.FAILED,
                        BatchRunStatus.CANCELLED,
                        BatchRunStatus.CANCEL_REQUESTED,
                    ],
                },
            },
            orderBy: {
                createdAt: "desc",
            },
            take: 5,
            select: {
                id: true,
                status: true,
                createdAt: true,
                errorMessage: true,
                project: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                strategy: {
                    select: {
                        name: true,
                    },
                },
            },
        }),
        prisma.syncLog.findMany({
            where: {
                createdAt: {
                    gte: windowStart,
                },
                status: SyncStatus.FAILED,
            },
            orderBy: {
                createdAt: "desc",
            },
            take: 5,
            select: {
                id: true,
                action: true,
                createdAt: true,
                errorMessage: true,
                project: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                datasource: {
                    select: {
                        name: true,
                    },
                },
            },
        }),
    ]);

    return {
        role: "SUPER_ADMIN",
        scale: {
            activeUsers,
            activeProjects,
            activeDatasources,
            newProjects7d,
            newDatasources7d,
        },
        aiResources: {
            providerCount,
            endpointCount,
            modelCount,
            enabledStrategyCount,
        },
        aiRuns: {
            total7d: totalAiRuns7d,
            success7d: successAiRuns7d,
            failed7d: failedAiRuns7d,
            failureRate7d: calculateFailureRate(totalAiRuns7d, failedAiRuns7d),
        },
        runningBatchCount,
        failedBatchCount7d,
        failedSyncCount7d,
        recentFailedBatches: recentFailedBatches.map((run) => ({
            id: run.id,
            projectId: run.project.id,
            projectName: run.project.name,
            projectCode: run.project.code,
            strategyName: run.strategy.name,
            status: toRecentBatchIssueStatus(run.status),
            createdAt: run.createdAt.toISOString(),
            errorMessage: run.errorMessage,
            href: `/admin/review-batches?projectId=${run.project.id}`,
        })),
        recentFailedSyncs: recentFailedSyncs.map((log) => ({
            id: log.id,
            projectId: log.project.id,
            projectName: log.project.name,
            projectCode: log.project.code,
            datasourceName: log.datasource.name,
            createdAt: log.createdAt.toISOString(),
            action: log.action,
            errorMessage: log.errorMessage,
            href: `/admin/datasources`,
        })),
    };
}

async function getPlatformAdminOverview(): Promise<PlatformAdminOverviewData> {
    const windowStart = getWindowStart();
    const [
        activeProjects,
        activeExperts,
        activeDatasources,
        importedDatasources7d,
        questionStatusRows,
        pendingQuestionCount,
        completedReviews7d,
        needsRevisionReviews7d,
        syncSuccessCount7d,
        syncFailedCount7d,
        recentFailedSyncs,
        activeProjectRows,
        pendingByProjectRows,
        failedSyncByProjectRows,
        failedBatchByProjectRows,
    ] = await Promise.all([
        prisma.project.count({
            where: {
                status: ProjectStatus.ACTIVE,
            },
        }),
        prisma.user.count({
            where: {
                status: UserStatus.ACTIVE,
                platformRole: PlatformRole.USER,
            },
        }),
        prisma.projectDataSource.count({
            where: {
                status: DataSourceStatus.ACTIVE,
            },
        }),
        prisma.projectDataSource.count({
            where: {
                createdAt: {
                    gte: windowStart,
                },
            },
        }),
        prisma.question.groupBy({
            by: ["status"],
            _count: {
                _all: true,
            },
        }),
        prisma.question.count({
            where: {
                status: {
                    in: [...PENDING_QUESTION_STATUSES],
                },
            },
        }),
        prisma.review.count({
            where: {
                createdAt: {
                    gte: windowStart,
                },
            },
        }),
        prisma.review.count({
            where: {
                createdAt: {
                    gte: windowStart,
                },
                decision: ReviewDecision.NEEDS_REVISION,
            },
        }),
        prisma.syncLog.count({
            where: {
                createdAt: {
                    gte: windowStart,
                },
                status: SyncStatus.SUCCESS,
            },
        }),
        prisma.syncLog.count({
            where: {
                createdAt: {
                    gte: windowStart,
                },
                status: SyncStatus.FAILED,
            },
        }),
        prisma.syncLog.findMany({
            where: {
                createdAt: {
                    gte: windowStart,
                },
                status: SyncStatus.FAILED,
            },
            orderBy: {
                createdAt: "desc",
            },
            take: 5,
            select: {
                id: true,
                action: true,
                createdAt: true,
                errorMessage: true,
                project: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                datasource: {
                    select: {
                        name: true,
                    },
                },
            },
        }),
        prisma.project.findMany({
            where: {
                status: ProjectStatus.ACTIVE,
            },
            orderBy: {
                updatedAt: "desc",
            },
            select: {
                id: true,
                name: true,
                code: true,
                updatedAt: true,
            },
        }),
        prisma.question.groupBy({
            by: ["projectId"],
            where: {
                status: {
                    in: [...PENDING_QUESTION_STATUSES],
                },
            },
            _count: {
                _all: true,
            },
        }),
        prisma.syncLog.groupBy({
            by: ["projectId"],
            where: {
                createdAt: {
                    gte: windowStart,
                },
                status: SyncStatus.FAILED,
            },
            _count: {
                _all: true,
            },
        }),
        prisma.aiReviewStrategyBatchRun.groupBy({
            by: ["projectId"],
            where: {
                createdAt: {
                    gte: windowStart,
                },
                status: BatchRunStatus.FAILED,
            },
            _count: {
                _all: true,
            },
        }),
    ]);

    const questionStatuses = applyQuestionStatusCounts(
        emptyStatusCounts(),
        questionStatusRows,
    );
    const pendingByProject = mapCountRows(pendingByProjectRows);
    const failedSyncByProject = mapCountRows(failedSyncByProjectRows);
    const failedBatchByProject = mapCountRows(failedBatchByProjectRows);

    const riskProjects = activeProjectRows
        .map((project) => ({
            projectId: project.id,
            projectName: project.name,
            projectCode: project.code,
            pendingQuestionCount: pendingByProject.get(project.id) ?? 0,
            failedSyncCount7d: failedSyncByProject.get(project.id) ?? 0,
            failedBatchCount7d: failedBatchByProject.get(project.id) ?? 0,
            updatedAt: project.updatedAt.getTime(),
            href: `/admin/review-tasks?projectId=${project.id}`,
        }))
        .filter(
            (project) =>
                project.pendingQuestionCount > 0 ||
                project.failedSyncCount7d > 0 ||
                project.failedBatchCount7d > 0,
        )
        .sort((left, right) => {
            const leftScore =
                left.pendingQuestionCount * 100 +
                left.failedSyncCount7d * 20 +
                left.failedBatchCount7d * 10;
            const rightScore =
                right.pendingQuestionCount * 100 +
                right.failedSyncCount7d * 20 +
                right.failedBatchCount7d * 10;

            if (rightScore !== leftScore) {
                return rightScore - leftScore;
            }

            return right.updatedAt - left.updatedAt;
        })
        .slice(0, 5)
        .map(({ updatedAt: _updatedAt, ...project }) => project);

    return {
        role: "PLATFORM_ADMIN",
        scale: {
            activeProjects,
            activeExperts,
            activeDatasources,
            importedDatasources7d,
        },
        questionStatuses,
        pendingQuestionCount,
        completedReviews7d,
        needsRevisionReviews7d,
        syncSummary7d: {
            successCount: syncSuccessCount7d,
            failedCount: syncFailedCount7d,
        },
        recentFailedSyncs: recentFailedSyncs.map((log) => ({
            id: log.id,
            projectId: log.project.id,
            projectName: log.project.name,
            projectCode: log.project.code,
            datasourceName: log.datasource.name,
            createdAt: log.createdAt.toISOString(),
            action: log.action,
            errorMessage: log.errorMessage,
            href: `/admin/datasources`,
        })),
        riskProjects,
    };
}

export async function getWorkspaceOverview(
    userId: string,
): Promise<WorkspaceOverviewData> {
    const workspaceContext = await getWorkspaceContext(userId);
    const authorProjectIds = workspaceContext.authorProjects.map(
        (membership) => membership.project.id,
    );
    const reviewerProjectIds = workspaceContext.reviewerProjects.map(
        (membership) => membership.project.id,
    );
    const availableRoles = [
        workspaceContext.canAuthor ? "AUTHOR" : null,
        workspaceContext.canReview ? "REVIEWER" : null,
    ].filter(Boolean) as WorkspaceOverviewRole[];
    const defaultRole = workspaceContext.canReview ? "REVIEWER" : "AUTHOR";

    if (!process.env.DATABASE_URL) {
        return {
            availableRoles,
            defaultRole,
            author: workspaceContext.canAuthor
                ? {
                      projectCount: workspaceContext.authorProjectCount,
                      questionStatuses: {
                          DRAFT: 0,
                          SUBMITTED: 0,
                          REJECTED: 0,
                      },
                      updatedQuestions7d: 0,
                      projects: [],
                  }
                : null,
            reviewer: workspaceContext.canReview
                ? {
                      projectCount: workspaceContext.reviewerProjectCount,
                      pendingQuestionCount: 0,
                      myCompletedReviews7d: 0,
                      runningBatchCount: 0,
                      failedBatchCount7d: 0,
                      projects: [],
                  }
                : null,
        };
    }

    const [author, reviewer] = await Promise.all([
        workspaceContext.canAuthor
            ? getAuthorOverview(authorProjectIds, workspaceContext.authorProjects)
            : Promise.resolve<AuthorOverviewData | null>(null),
        workspaceContext.canReview
            ? getReviewerOverview(
                  userId,
                  reviewerProjectIds,
                  workspaceContext.reviewerProjects,
              )
            : Promise.resolve<ReviewerOverviewData | null>(null),
    ]);

    return {
        availableRoles,
        defaultRole,
        author,
        reviewer,
    };
}

async function getAuthorOverview(
    projectIds: string[],
    memberships: Awaited<ReturnType<typeof getWorkspaceContext>>["authorProjects"],
): Promise<AuthorOverviewData> {
    if (!projectIds.length) {
        return {
            projectCount: 0,
            questionStatuses: {
                DRAFT: 0,
                SUBMITTED: 0,
                REJECTED: 0,
            },
            updatedQuestions7d: 0,
            projects: [],
        };
    }

    const windowStart = getWindowStart();
    const [statusRows, updatedQuestions7d, projectRows, questionSummaryRows] =
        await Promise.all([
            prisma.question.groupBy({
                by: ["status"],
                where: {
                    projectId: {
                        in: projectIds,
                    },
                    status: {
                        in: [
                            QuestionStatus.DRAFT,
                            QuestionStatus.SUBMITTED,
                            QuestionStatus.REJECTED,
                        ],
                    },
                },
                _count: {
                    _all: true,
                },
            }),
            prisma.question.count({
                where: {
                    projectId: {
                        in: projectIds,
                    },
                    updatedAt: {
                        gte: windowStart,
                    },
                },
            }),
            prisma.project.findMany({
                where: {
                    id: {
                        in: projectIds,
                    },
                },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    updatedAt: true,
                },
            }),
            prisma.question.groupBy({
                by: ["projectId", "status"],
                where: {
                    projectId: {
                        in: projectIds,
                    },
                },
                _count: {
                    _all: true,
                },
            }),
        ]);

    const questionStatuses = {
        DRAFT: 0,
        SUBMITTED: 0,
        REJECTED: 0,
    };
    for (const row of statusRows) {
        if (row.status === QuestionStatus.DRAFT) {
            questionStatuses.DRAFT = row._count._all;
        }
        if (row.status === QuestionStatus.SUBMITTED) {
            questionStatuses.SUBMITTED = row._count._all;
        }
        if (row.status === QuestionStatus.REJECTED) {
            questionStatuses.REJECTED = row._count._all;
        }
    }

    const projectSummaryMap = new Map<
        string,
        {
            questionCount: number;
            draftCount: number;
            rejectedCount: number;
        }
    >();
    for (const row of questionSummaryRows) {
        const current = projectSummaryMap.get(row.projectId) ?? {
            questionCount: 0,
            draftCount: 0,
            rejectedCount: 0,
        };
        current.questionCount += row._count._all;
        if (row.status === QuestionStatus.DRAFT) {
            current.draftCount += row._count._all;
        }
        if (row.status === QuestionStatus.REJECTED) {
            current.rejectedCount += row._count._all;
        }
        projectSummaryMap.set(row.projectId, current);
    }

    const membershipOrder = new Map(
        memberships.map((membership, index) => [membership.project.id, index]),
    );
    const projects = projectRows
        .map((project) => {
            const summary = projectSummaryMap.get(project.id) ?? {
                questionCount: 0,
                draftCount: 0,
                rejectedCount: 0,
            };

            return {
                projectId: project.id,
                projectName: project.name,
                projectCode: project.code,
                questionCount: summary.questionCount,
                draftCount: summary.draftCount,
                rejectedCount: summary.rejectedCount,
                lastActivityAt: project.updatedAt.toISOString(),
                href: `/workspace/submissions`,
                sortTime: project.updatedAt.getTime(),
                sortIndex: membershipOrder.get(project.id) ?? Number.MAX_SAFE_INTEGER,
            };
        })
        .sort((left, right) => {
            if (right.sortTime !== left.sortTime) {
                return right.sortTime - left.sortTime;
            }

            return left.sortIndex - right.sortIndex;
        })
        .slice(0, 5)
        .map(({ sortTime: _sortTime, sortIndex: _sortIndex, ...project }) => project);

    return {
        projectCount: projectIds.length,
        questionStatuses,
        updatedQuestions7d,
        projects,
    };
}

async function getReviewerOverview(
    userId: string,
    projectIds: string[],
    memberships: Awaited<ReturnType<typeof getWorkspaceContext>>["reviewerProjects"],
): Promise<ReviewerOverviewData> {
    if (!projectIds.length) {
        return {
            projectCount: 0,
            pendingQuestionCount: 0,
            myCompletedReviews7d: 0,
            runningBatchCount: 0,
            failedBatchCount7d: 0,
            projects: [],
        };
    }

    const windowStart = getWindowStart();
    const [
        pendingQuestionCount,
        myCompletedReviews7d,
        runningBatchCount,
        failedBatchCount7d,
        projectRows,
        pendingByProjectRows,
        completedByProjectRows,
        recentBatchRuns,
    ] = await Promise.all([
        prisma.question.count({
            where: {
                projectId: {
                    in: projectIds,
                },
                status: {
                    in: [...PENDING_QUESTION_STATUSES],
                },
            },
        }),
        prisma.review.count({
            where: {
                reviewerId: userId,
                projectId: {
                    in: projectIds,
                },
                createdAt: {
                    gte: windowStart,
                },
            },
        }),
        prisma.aiReviewStrategyBatchRun.count({
            where: {
                projectId: {
                    in: projectIds,
                },
                status: BatchRunStatus.RUNNING,
            },
        }),
        prisma.aiReviewStrategyBatchRun.count({
            where: {
                projectId: {
                    in: projectIds,
                },
                createdAt: {
                    gte: windowStart,
                },
                status: BatchRunStatus.FAILED,
            },
        }),
        prisma.project.findMany({
            where: {
                id: {
                    in: projectIds,
                },
            },
            select: {
                id: true,
                name: true,
                code: true,
                updatedAt: true,
            },
        }),
        prisma.question.groupBy({
            by: ["projectId"],
            where: {
                projectId: {
                    in: projectIds,
                },
                status: {
                    in: [...PENDING_QUESTION_STATUSES],
                },
            },
            _count: {
                _all: true,
            },
        }),
        prisma.review.groupBy({
            by: ["projectId"],
            where: {
                projectId: {
                    in: projectIds,
                },
                createdAt: {
                    gte: windowStart,
                },
            },
            _count: {
                _all: true,
            },
        }),
        prisma.aiReviewStrategyBatchRun.findMany({
            where: {
                projectId: {
                    in: projectIds,
                },
            },
            orderBy: {
                createdAt: "desc",
            },
            take: Math.max(projectIds.length * 5, 20),
            select: {
                id: true,
                projectId: true,
                status: true,
                createdAt: true,
            },
        }),
    ]);

    const pendingByProject = mapCountRows(pendingByProjectRows);
    const completedByProject = mapCountRows(completedByProjectRows);
    const latestBatchByProject = new Map<
        string,
        { status: ReviewerPriorityProject["latestBatchStatus"]; createdAt: string }
    >();
    for (const run of recentBatchRuns) {
        if (!latestBatchByProject.has(run.projectId)) {
            latestBatchByProject.set(run.projectId, {
                status: run.status,
                createdAt: run.createdAt.toISOString(),
            });
        }
    }

    const membershipOrder = new Map(
        memberships.map((membership, index) => [membership.project.id, index]),
    );
    const projects = projectRows
        .map((project) => {
            const latestBatch = latestBatchByProject.get(project.id) ?? null;
            const latestBatchPenalty =
                latestBatch?.status === BatchRunStatus.FAILED ? 1 : 0;

            return {
                projectId: project.id,
                projectName: project.name,
                projectCode: project.code,
                pendingQuestionCount: pendingByProject.get(project.id) ?? 0,
                completedReviews7d: completedByProject.get(project.id) ?? 0,
                latestBatchStatus: latestBatch?.status ?? null,
                latestBatchCreatedAt: latestBatch?.createdAt ?? null,
                href: `/workspace/reviews?projectId=${project.id}`,
                sortPending: pendingByProject.get(project.id) ?? 0,
                sortFailedBatch: latestBatchPenalty,
                sortCompleted: completedByProject.get(project.id) ?? 0,
                sortTime: project.updatedAt.getTime(),
                sortIndex: membershipOrder.get(project.id) ?? Number.MAX_SAFE_INTEGER,
            };
        })
        .sort((left, right) => {
            if (right.sortPending !== left.sortPending) {
                return right.sortPending - left.sortPending;
            }
            if (right.sortFailedBatch !== left.sortFailedBatch) {
                return right.sortFailedBatch - left.sortFailedBatch;
            }
            if (right.sortCompleted !== left.sortCompleted) {
                return right.sortCompleted - left.sortCompleted;
            }
            if (right.sortTime !== left.sortTime) {
                return right.sortTime - left.sortTime;
            }

            return left.sortIndex - right.sortIndex;
        })
        .slice(0, 5)
        .map(
            ({
                sortPending: _sortPending,
                sortFailedBatch: _sortFailedBatch,
                sortCompleted: _sortCompleted,
                sortTime: _sortTime,
                sortIndex: _sortIndex,
                ...project
            }) => project,
        );

    return {
        projectCount: projectIds.length,
        pendingQuestionCount,
        myCompletedReviews7d,
        runningBatchCount,
        failedBatchCount7d,
        projects,
    };
}
