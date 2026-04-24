import { prisma } from "@/lib/db/prisma";
import { aiReviewDefaultPrompts } from "@/lib/ai/review-strategy-schema";

export const DEFAULT_REVIEW_STRATEGY_CODE = "review_common";
export const DEFAULT_REVIEW_STRATEGY_NAME = "审核策略-通用";

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
}) {
    if (!process.env.DATABASE_URL) {
        return null;
    }

    const existing = await prisma.aiReviewStrategy.findFirst({
        where: {
            scopeAdminId: input.scopeAdminId,
            code: DEFAULT_REVIEW_STRATEGY_CODE,
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
            code: DEFAULT_REVIEW_STRATEGY_CODE,
            name: DEFAULT_REVIEW_STRATEGY_NAME,
            description:
                "管理员域默认通用审核策略，可按本管理员实际业务继续调整。",
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
