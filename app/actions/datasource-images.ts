"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { saveUploadedFile, toUploadUrl } from "@/lib/import/file-storage";
import {
    extractImagesFromZip,
    buildImageMap,
    type ExtractedImage,
} from "@/lib/import/zip-archive";

export type ImagePackUploadState = {
    error?: string;
    success?: string;
};

function revalidateImagePaths() {
    revalidatePath("/dashboard/datasources");
    revalidatePath("/dashboard/review-tasks");
    revalidatePath("/workspace/reviews");
}

/**
 * Upload a zip image pack for a datasource.
 *
 * Extracts all images (including from nested zips), stores them to disk,
 * and writes the imageMap into the datasource's syncConfig.
 */
export async function uploadDatasourceImagePackAction(
    _prevState: ImagePackUploadState,
    formData: FormData,
): Promise<ImagePackUploadState> {
    const datasourceId = formData.get("datasourceId");

    if (typeof datasourceId !== "string" || !datasourceId) {
        return { error: "请选择数据源。" };
    }

    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
        return { error: "请选择要上传的 zip 图片包。" };
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
        return { error: "仅支持 .zip 格式的图片包。" };
    }

    const datasource = await prisma.projectDataSource.findUnique({
        where: { id: datasourceId },
        select: { id: true, name: true, syncConfig: true },
    });

    if (!datasource) {
        return { error: "数据源不存在。" };
    }

    try {
        const zipBuffer = await file.arrayBuffer();
        const extractedImages = await extractImagesFromZip(zipBuffer);

        if (!extractedImages.length) {
            return { error: "zip 包中没有找到任何图片文件。" };
        }

        // Deduplicate: same buffer should only be saved once
        const bufferToUrl = new Map<string, string>();
        const imageToUrl = new Map<ExtractedImage, string>();

        for (const image of extractedImages) {
            const bufferKey = `${image.buffer.length}-${image.fileName}`;
            let url = bufferToUrl.get(bufferKey);

            if (!url) {
                const relativePath = await saveUploadedFile({
                    datasourceId,
                    originalFileName: image.fileName,
                    buffer: image.buffer,
                });
                url = toUploadUrl(relativePath);
                bufferToUrl.set(bufferKey, url);
            }

            imageToUrl.set(image, url);
        }

        const imageMap = buildImageMap(extractedImages, imageToUrl);

        // When the uploaded zip itself is referenced by a raw field value
        // (e.g. image_id = "abc.zip" and the user uploads abc.zip directly),
        // the zip filename won't be in imageMap because the extraction only
        // keys by inner file paths. Add the zip filename as an extra key
        // pointing to all extracted image URLs.
        if (!imageMap[file.name]) {
            const allUrls = [...new Set(Object.values(imageMap).flat())];

            if (allUrls.length) {
                imageMap[file.name] = allUrls;
            }
        }

        // Merge with existing imageMap so that multiple zip uploads accumulate
        const existingSyncConfig =
            datasource.syncConfig &&
            typeof datasource.syncConfig === "object" &&
            !Array.isArray(datasource.syncConfig)
                ? (datasource.syncConfig as Record<string, unknown>)
                : {};

        const existingImageMap =
            existingSyncConfig.imageMap &&
            typeof existingSyncConfig.imageMap === "object" &&
            !Array.isArray(existingSyncConfig.imageMap)
                ? (existingSyncConfig.imageMap as Record<string, string[]>)
                : {};

        const mergedImageMap = { ...existingImageMap, ...imageMap };

        // Auto-detect image fields by scanning question raw records
        const imageMapKeys = new Set(Object.keys(mergedImageMap));
        const normalizedImageMapKeys = new Set(
            Object.keys(mergedImageMap).map((k) =>
                k.replace(/[^a-zA-Z0-9.\-]/g, "_").toLowerCase(),
            ),
        );
        const sampleQuestions = await prisma.question.findMany({
            where: { datasourceId },
            select: { metadata: true },
            take: 20,
        });

        const detectedImageFields = new Set<string>();

        for (const q of sampleQuestions) {
            if (
                !q.metadata ||
                typeof q.metadata !== "object" ||
                Array.isArray(q.metadata)
            ) {
                continue;
            }

            const rawRecord = (q.metadata as Record<string, unknown>).rawRecord;

            if (
                !rawRecord ||
                typeof rawRecord !== "object" ||
                Array.isArray(rawRecord)
            ) {
                continue;
            }

            for (const [key, value] of Object.entries(
                rawRecord as Record<string, unknown>,
            )) {
                if (typeof value === "string") {
                    const trimmed = value.trim();
                    const normalized = trimmed
                        .replace(/[^a-zA-Z0-9.\-]/g, "_")
                        .toLowerCase();

                    if (
                        imageMapKeys.has(trimmed) ||
                        normalizedImageMapKeys.has(normalized)
                    ) {
                        detectedImageFields.add(key);
                    }
                }
            }
        }

        // Merge detected fields with any previously configured ones
        const previousImageFields = Array.isArray(
            existingSyncConfig.imageFields,
        )
            ? (existingSyncConfig.imageFields as string[])
            : [];
        const finalImageFields = [
            ...new Set([...previousImageFields, ...detectedImageFields]),
        ];

        await prisma.projectDataSource.update({
            where: { id: datasourceId },
            data: {
                syncConfig: {
                    ...existingSyncConfig,
                    imageMap: mergedImageMap,
                    imageFields: finalImageFields,
                    imagePackUploadedAt: new Date().toISOString(),
                    imagePackFileName: file.name,
                },
            },
        });

        const uniqueFileCount = bufferToUrl.size;
        const detectedFieldsList = [...detectedImageFields];

        revalidateImagePaths();

        return {
            success: detectedFieldsList.length
                ? `已提取 ${uniqueFileCount} 个图片，映射 ${Object.keys(mergedImageMap).length} 个键。自动识别图片字段：${detectedFieldsList.join("、")}。`
                : `已提取 ${uniqueFileCount} 个图片，映射 ${Object.keys(mergedImageMap).length} 个键。未自动识别到图片字段，请手动配置。`,
        };
    } catch (error) {
        return {
            error:
                error instanceof Error
                    ? error.message
                    : "图片包处理失败，请检查 zip 文件后重试。",
        };
    }
}

/**
 * Configure which raw fields are image fields for a datasource.
 */
export async function updateDatasourceImageFieldsAction(input: {
    datasourceId: string;
    imageFields: string[];
}): Promise<{ error?: string; success?: string }> {
    if (!input.datasourceId) {
        return { error: "缺少数据源 ID。" };
    }

    const datasource = await prisma.projectDataSource.findUnique({
        where: { id: input.datasourceId },
        select: { id: true, syncConfig: true },
    });

    if (!datasource) {
        return { error: "数据源不存在。" };
    }

    const existingSyncConfig =
        datasource.syncConfig &&
        typeof datasource.syncConfig === "object" &&
        !Array.isArray(datasource.syncConfig)
            ? (datasource.syncConfig as Record<string, unknown>)
            : {};

    await prisma.projectDataSource.update({
        where: { id: input.datasourceId },
        data: {
            syncConfig: {
                ...existingSyncConfig,
                imageFields: input.imageFields,
            },
        },
    });

    revalidateImagePaths();

    return {
        success: input.imageFields.length
            ? `已将 ${input.imageFields.join("、")} 设为图片字段。`
            : "已清除图片字段配置。",
    };
}
