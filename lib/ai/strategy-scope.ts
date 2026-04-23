import type { Prisma } from "@prisma/client";

function parseStringArray(value: Prisma.JsonValue | null | undefined) {
    if (!Array.isArray(value)) {
        return [] as string[];
    }

    return value.filter(
        (item): item is string =>
            typeof item === "string" && Boolean(item.trim()),
    );
}

export async function attachProjectToScopedStrategies(
    tx: Prisma.TransactionClient,
    projectId: string,
) {
    const strategies = await tx.aiReviewStrategy.findMany({
        select: {
            id: true,
            projectIds: true,
        },
    });

    let updatedCount = 0;

    for (const strategy of strategies) {
        const projectIds = parseStringArray(strategy.projectIds);

        if (!projectIds.length || projectIds.includes(projectId)) {
            continue;
        }

        await tx.aiReviewStrategy.update({
            where: {
                id: strategy.id,
            },
            data: {
                projectIds: [...projectIds, projectId],
            },
        });
        updatedCount += 1;
    }

    return updatedCount;
}

export async function attachDatasourceToScopedStrategies(
    tx: Prisma.TransactionClient,
    input: {
        projectId: string;
        datasourceId: string;
    },
) {
    const strategies = await tx.aiReviewStrategy.findMany({
        select: {
            id: true,
            projectIds: true,
            datasourceIds: true,
        },
    });

    let updatedCount = 0;

    for (const strategy of strategies) {
        const projectIds = parseStringArray(strategy.projectIds);
        const datasourceIds = parseStringArray(strategy.datasourceIds);

        if (!datasourceIds.length || datasourceIds.includes(input.datasourceId)) {
            continue;
        }

        const nextProjectIds =
            projectIds.length && !projectIds.includes(input.projectId)
                ? [...projectIds, input.projectId]
                : projectIds;

        await tx.aiReviewStrategy.update({
            where: {
                id: strategy.id,
            },
            data: {
                projectIds: nextProjectIds,
                datasourceIds: [...datasourceIds, input.datasourceId],
            },
        });
        updatedCount += 1;
    }

    return updatedCount;
}
