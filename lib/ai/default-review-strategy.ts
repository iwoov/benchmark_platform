import { prisma } from "@/lib/db/prisma";
import { aiReviewDefaultPrompts } from "@/lib/ai/review-strategy-schema";

export const DEFAULT_REVIEW_STRATEGY_CODE = "review_common";
export const SHARED_ADMIN_REVIEW_STRATEGY_CODE = "review_common_admin";
export const SHARED_FRONTIER_SCIENCE_REVIEW_STRATEGY_CODE =
    "review_frontier_science_common";
export const SHARED_REVIEW_STRATEGY_CODES = [
    SHARED_ADMIN_REVIEW_STRATEGY_CODE,
    SHARED_FRONTIER_SCIENCE_REVIEW_STRATEGY_CODE,
] as const;
export const DEFAULT_REVIEW_STRATEGY_NAME = "审核策略-通用";
export const SHARED_ADMIN_REVIEW_STRATEGY_NAME = "审核策略-通用(admin)";

function createDefaultStrategyDefinition(modelCode: string) {
    return {
        version: 1 as const,
        steps: [
            {
                id: "step_text_quality",
                name: "文本质量检查",
                enabled: true,
                kind: "AI_TOOL" as const,
                toolType: "TEXT_QUALITY_CHECK" as const,
                modelCode,
                fieldKeys: ["title", "content", "answer", "analysis"],
                promptTemplate: aiReviewDefaultPrompts.TEXT_QUALITY_CHECK,
                runCount: 1,
            },
        ],
    };
}

export async function ensureDefaultAiReviewStrategyForAdmin(input: {
    scopeAdminId: string;
    createdById?: string;
    scopeAdminRole?: "SUPER_ADMIN" | "PLATFORM_ADMIN";
}) {
    if (!process.env.DATABASE_URL) {
        return null;
    }

    const scopeAdminRole =
        input.scopeAdminRole ??
        (
            await prisma.user.findUnique({
                where: {
                    id: input.scopeAdminId,
                },
                select: {
                    platformRole: true,
                },
            })
        )?.platformRole;
    const isSharedAdminStrategy = scopeAdminRole === "SUPER_ADMIN";
    const strategyCode = isSharedAdminStrategy
        ? SHARED_ADMIN_REVIEW_STRATEGY_CODE
        : DEFAULT_REVIEW_STRATEGY_CODE;
    const strategyName = isSharedAdminStrategy
        ? SHARED_ADMIN_REVIEW_STRATEGY_NAME
        : DEFAULT_REVIEW_STRATEGY_NAME;

    const existing = await prisma.aiReviewStrategy.findFirst({
        where: {
            scopeAdminId: input.scopeAdminId,
            code: strategyCode,
        },
        select: {
            id: true,
        },
    });

    if (existing) {
        return existing;
    }

    const model = await prisma.aiModel.findFirst({
        orderBy: [{ label: "asc" }, { code: "asc" }],
        select: {
            code: true,
        },
    });

    const strategy = await prisma.aiReviewStrategy.create({
        data: {
            scopeAdminId: input.scopeAdminId,
            createdById: input.createdById ?? input.scopeAdminId,
            code: strategyCode,
            name: strategyName,
            description:
                isSharedAdminStrategy
                    ? "超级管理员共享通用审核策略，可供普通审核用户跨管理员域查看和执行。"
                    : "管理员域默认通用审核策略，可按本管理员实际业务继续调整。",
            enabled: true,
            projectIds: [],
            datasourceIds: [],
            definition: createDefaultStrategyDefinition(
                model?.code ?? "__configure_model__",
            ),
        },
        select: {
            id: true,
        },
    });

    return strategy;
}
