import type { Prisma } from "@prisma/client";
import { canAccessAdminScope } from "@/lib/auth/admin-scope";
import type { PlatformRoleValue } from "@/lib/auth/roles";
import { SHARED_REVIEW_STRATEGY_CODES } from "@/lib/ai/default-review-strategy";

type ReviewStrategyAccessRecord = {
    code: string;
    scopeAdminId: string;
    scopeAdmin: {
        platformRole: PlatformRoleValue;
    };
};

export function getSharedDefaultReviewStrategyWhere(): Prisma.AiReviewStrategyWhereInput {
    return {
        code: {
            in: [...SHARED_REVIEW_STRATEGY_CODES],
        },
        scopeAdmin: {
            platformRole: "SUPER_ADMIN",
        },
    };
}

export function getVisibleAiReviewStrategyWhere(input: {
    platformRole: PlatformRoleValue;
    scopeAdminId: string | null;
}): Prisma.AiReviewStrategyWhereInput {
    if (input.platformRole === "SUPER_ADMIN") {
        return {};
    }

    return {
        OR: [
            {
                scopeAdminId: input.scopeAdminId ?? "__no_scope__",
            },
            getSharedDefaultReviewStrategyWhere(),
        ],
    };
}

export function isSharedDefaultReviewStrategy(
    strategy: ReviewStrategyAccessRecord,
) {
    return (
        SHARED_REVIEW_STRATEGY_CODES.includes(
            strategy.code as (typeof SHARED_REVIEW_STRATEGY_CODES)[number],
        ) &&
        strategy.scopeAdmin.platformRole === "SUPER_ADMIN"
    );
}

export async function canAccessAiReviewStrategy(input: {
    userId: string;
    platformRole: PlatformRoleValue;
    strategy: ReviewStrategyAccessRecord;
}) {
    if (isSharedDefaultReviewStrategy(input.strategy)) {
        return true;
    }

    return canAccessAdminScope(
        input.userId,
        input.platformRole,
        input.strategy.scopeAdminId,
    );
}
