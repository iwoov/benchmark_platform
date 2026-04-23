import type { Prisma } from "@prisma/client";

function asSyncConfigObject(syncConfig: Prisma.JsonValue | null) {
    if (
        !syncConfig ||
        typeof syncConfig !== "object" ||
        Array.isArray(syncConfig)
    ) {
        return null;
    }

    return syncConfig as Record<string, unknown>;
}

export function readOriginalFileName(syncConfig: Prisma.JsonValue | null) {
    const obj = asSyncConfigObject(syncConfig);

    if (!obj) {
        return null;
    }

    const fileName = obj.originalFileName;
    return typeof fileName === "string" ? fileName : null;
}

export function readRawFieldOrder(syncConfig: Prisma.JsonValue | null) {
    const obj = asSyncConfigObject(syncConfig);

    if (!obj || !Array.isArray(obj.rawFieldOrder)) {
        return [] as string[];
    }

    return (obj.rawFieldOrder as unknown[]).filter(
        (value): value is string => typeof value === "string" && Boolean(value),
    );
}

export function readImageFields(syncConfig: Prisma.JsonValue | null) {
    const obj = asSyncConfigObject(syncConfig);

    if (!obj || !Array.isArray(obj.imageFields)) {
        return [] as string[];
    }

    return (obj.imageFields as unknown[]).filter(
        (value): value is string => typeof value === "string" && Boolean(value),
    );
}

export function readImagePackFileName(syncConfig: Prisma.JsonValue | null) {
    const obj = asSyncConfigObject(syncConfig);

    if (!obj) {
        return null;
    }

    const fileName = obj.imagePackFileName;
    return typeof fileName === "string" ? fileName : null;
}

export function readImageMap(syncConfig: Prisma.JsonValue | null) {
    const obj = asSyncConfigObject(syncConfig);

    if (!obj || !obj.imageMap || typeof obj.imageMap !== "object") {
        return null;
    }

    return obj.imageMap as Record<string, string[]>;
}

export function readImageCount(syncConfig: Prisma.JsonValue | null) {
    const imageMap = readImageMap(syncConfig);

    if (!imageMap) {
        return 0;
    }

    return new Set(
        Object.values(imageMap)
            .flatMap((urls) => (Array.isArray(urls) ? urls : []))
            .filter((url): url is string => typeof url === "string" && Boolean(url)),
    ).size;
}
