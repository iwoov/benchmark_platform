import { prisma } from "@/lib/db/prisma";
import { isSuperAdminRole, type PlatformRoleValue } from "@/lib/auth/roles";

export function extractQuestionPrimaryValue(metadata: unknown) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return null;
    }

    const rawRecord = (metadata as Record<string, unknown>).rawRecord;

    if (!rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord)) {
        return null;
    }

    const primaryValue = (rawRecord as Record<string, unknown>).primary;

    if (typeof primaryValue !== "string") {
        return null;
    }

    const normalized = primaryValue.trim();

    return normalized || null;
}

export async function getAccessiblePrimaryValueSet(
    userId: string,
    platformRole: PlatformRoleValue,
) {
    if (!process.env.DATABASE_URL || isSuperAdminRole(platformRole)) {
        return null;
    }

    const assignments = await prisma.userSubjectAssignment.findMany({
        where: {
            userId,
        },
        select: {
            subject: {
                select: {
                    primaryValues: {
                        select: {
                            value: true,
                        },
                    },
                },
            },
        },
    });

    return new Set(
        assignments.flatMap((assignment) =>
            assignment.subject.primaryValues.map((item) => item.value),
        ),
    );
}

export function questionMatchesPrimaryValueScope(
    metadata: unknown,
    allowedPrimaryValues: Set<string> | null,
) {
    if (allowedPrimaryValues === null) {
        return true;
    }

    const primaryValue = extractQuestionPrimaryValue(metadata);

    if (!primaryValue) {
        return false;
    }

    return allowedPrimaryValues.has(primaryValue);
}
