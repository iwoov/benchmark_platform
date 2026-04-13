import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { readRawFieldOrder } from "@/lib/datasources/sync-config";

const reviewFieldPreferenceConfigSchema = z.object({
    version: z.literal(1),
    fieldOrder: z.array(z.string()),
    listVisibleFieldKeys: z.array(z.string()),
    detailVisibleFieldKeys: z.array(z.string()),
});

export type ReviewFieldPreferenceConfigV1 = z.infer<
    typeof reviewFieldPreferenceConfigSchema
>;

export type ReviewFieldOption = {
    key: string;
    label: string;
};

export type ResolvedReviewFieldPreference = {
    hasSavedPreference: boolean;
    fieldCatalog: ReviewFieldOption[];
    fieldOrder: string[];
    listVisibleFieldKeys: string[];
    detailVisibleFieldKeys: string[];
};

function normalizeFieldKeys(fieldKeys: string[]) {
    const normalized: string[] = [];

    for (const fieldKey of fieldKeys) {
        const trimmed = fieldKey.trim();

        if (trimmed && !normalized.includes(trimmed)) {
            normalized.push(trimmed);
        }
    }

    return normalized;
}

function toFieldOptions(fieldKeys: string[]): ReviewFieldOption[] {
    return fieldKeys.map((fieldKey) => ({
        key: fieldKey,
        label: fieldKey,
    }));
}

function parseStoredPreferenceConfig(
    input: unknown,
): ReviewFieldPreferenceConfigV1 | null {
    const parsed = reviewFieldPreferenceConfigSchema.safeParse(input);
    return parsed.success ? parsed.data : null;
}

export async function getProjectReviewFieldCatalog(projectId: string) {
    if (!process.env.DATABASE_URL || !projectId) {
        return [] as ReviewFieldOption[];
    }

    const datasources = await prisma.projectDataSource.findMany({
        where: {
            projectId,
        },
        orderBy: [{ createdAt: "asc" }],
        select: {
            syncConfig: true,
        },
    });

    const fieldCatalog = normalizeFieldKeys(
        datasources.flatMap((datasource) => readRawFieldOrder(datasource.syncConfig)),
    );

    return toFieldOptions(fieldCatalog);
}

export async function getUserProjectReviewFieldPreference(
    userId: string,
    projectId: string,
) {
    if (!process.env.DATABASE_URL || !userId || !projectId) {
        return null;
    }

    const preference = await prisma.userProjectReviewFieldPreference.findUnique({
        where: {
            userId_projectId: {
                userId,
                projectId,
            },
        },
        select: {
            config: true,
        },
    });

    return preference ? parseStoredPreferenceConfig(preference.config) : null;
}

export function resolveReviewFieldPreference({
    fieldCatalog,
    preference,
}: {
    fieldCatalog: ReviewFieldOption[];
    preference: ReviewFieldPreferenceConfigV1 | null;
}): ResolvedReviewFieldPreference {
    const catalogKeys = normalizeFieldKeys(fieldCatalog.map((field) => field.key));

    if (!preference) {
        return {
            hasSavedPreference: false,
            fieldCatalog: toFieldOptions(catalogKeys),
            fieldOrder: catalogKeys,
            listVisibleFieldKeys: catalogKeys,
            detailVisibleFieldKeys: catalogKeys,
        };
    }

    const preferredOrder = normalizeFieldKeys(
        preference.fieldOrder.filter((fieldKey) => catalogKeys.includes(fieldKey)),
    );
    const remainingFieldKeys = catalogKeys.filter(
        (fieldKey) => !preferredOrder.includes(fieldKey),
    );
    const fieldOrder = [...preferredOrder, ...remainingFieldKeys];

    return {
        hasSavedPreference: true,
        fieldCatalog: toFieldOptions(catalogKeys),
        fieldOrder,
        listVisibleFieldKeys: normalizeFieldKeys(
            preference.listVisibleFieldKeys.filter((fieldKey) =>
                catalogKeys.includes(fieldKey),
            ),
        ),
        detailVisibleFieldKeys: normalizeFieldKeys(
            preference.detailVisibleFieldKeys.filter((fieldKey) =>
                catalogKeys.includes(fieldKey),
            ),
        ),
    };
}

export async function getResolvedUserProjectReviewFieldPreference(
    userId: string,
    projectId: string,
) {
    const [fieldCatalog, preference] = await Promise.all([
        getProjectReviewFieldCatalog(projectId),
        getUserProjectReviewFieldPreference(userId, projectId),
    ]);

    return resolveReviewFieldPreference({
        fieldCatalog,
        preference,
    });
}

export function sanitizeReviewFieldPreferenceInput({
    fieldCatalogKeys,
    fieldOrder,
    listVisibleFieldKeys,
    detailVisibleFieldKeys,
}: {
    fieldCatalogKeys: string[];
    fieldOrder: string[];
    listVisibleFieldKeys: string[];
    detailVisibleFieldKeys: string[];
}): ReviewFieldPreferenceConfigV1 {
    const normalizedCatalogKeys = normalizeFieldKeys(fieldCatalogKeys);
    const normalizedFieldOrder = normalizeFieldKeys(
        fieldOrder.filter((fieldKey) => normalizedCatalogKeys.includes(fieldKey)),
    );
    const missingFieldKeys = normalizedCatalogKeys.filter(
        (fieldKey) => !normalizedFieldOrder.includes(fieldKey),
    );

    return {
        version: 1,
        fieldOrder: [...normalizedFieldOrder, ...missingFieldKeys],
        listVisibleFieldKeys: normalizeFieldKeys(
            listVisibleFieldKeys.filter((fieldKey) =>
                normalizedCatalogKeys.includes(fieldKey),
            ),
        ),
        detailVisibleFieldKeys: normalizeFieldKeys(
            detailVisibleFieldKeys.filter((fieldKey) =>
                normalizedCatalogKeys.includes(fieldKey),
            ),
        ),
    };
}
