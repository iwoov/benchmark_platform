"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { saveUploadedFile, toUploadUrl } from "@/lib/import/file-storage";
import {
    extractImagesFromArchive,
    buildImageMap,
    type ExtractedImage,
} from "@/lib/import/zip-archive";

export type ImagePackUploadState = {
    error?: string;
    success?: string;
};

function isSupportedArchiveFileName(fileName: string) {
    return /\.(zip|rar)$/i.test(fileName);
}

function stripArchiveExtension(value: string) {
    return value.replace(/\.(zip|rar)$/i, "");
}

function revalidateImagePaths() {
    revalidatePath("/dashboard/datasources");
    revalidatePath("/dashboard/review-tasks");
    revalidatePath("/workspace/reviews");
}

/**
 * Upload an image pack archive for a datasource.
 *
 * Extracts all images (including from nested archives), stores them to disk,
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

    const files = formData
        .getAll("file")
        .filter((f): f is File => f instanceof File && f.size > 0);

    if (!files.length) {
        return { error: "请选择要上传的 zip 或 rar 图片包。" };
    }

    for (const f of files) {
        if (!isSupportedArchiveFileName(f.name)) {
            return {
                error: `仅支持 .zip 或 .rar 格式的图片包，"${f.name}" 不是受支持的压缩文件。`,
            };
        }
    }

    const datasource = await prisma.projectDataSource.findUnique({
        where: { id: datasourceId },
        select: { id: true, name: true, syncConfig: true },
    });

    if (!datasource) {
        return { error: "数据源不存在。" };
    }

    try {
        // Deduplicate: same buffer should only be saved once
        const bufferToUrl = new Map<string, string>();
        const allExtractedImages: ExtractedImage[] = [];
        const extractedImagesByArchive = new Map<string, ExtractedImage[]>();

        for (const file of files) {
            const archiveBuffer = await file.arrayBuffer();
            const extractedImages = await extractImagesFromArchive(
                archiveBuffer,
                file.name,
            );
            allExtractedImages.push(...extractedImages);
            extractedImagesByArchive.set(file.name, extractedImages);
        }

        if (!allExtractedImages.length) {
            return { error: "压缩包中没有找到任何图片文件。" };
        }

        const imageToUrl = new Map<ExtractedImage, string>();

        for (const image of allExtractedImages) {
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

        const imageMap = buildImageMap(allExtractedImages, imageToUrl);

        // When the uploaded archive itself is referenced by a raw field value
        // (e.g. image_id = "abc.rar" and the user uploads abc.rar directly),
        // the archive filename won't be in imageMap because the extraction only
        // keys by inner file paths. Add the archive filename as an extra key
        // pointing to all extracted image URLs.
        for (const file of files) {
            if (!imageMap[file.name]) {
                const extractedImages = extractedImagesByArchive.get(file.name) ?? [];
                const archiveUrls = [
                    ...new Set(
                        extractedImages
                            .map((image) => imageToUrl.get(image))
                            .filter((url): url is string => Boolean(url)),
                    ),
                ];

                if (archiveUrls.length) {
                    imageMap[file.name] = archiveUrls;
                }
            }
        }

        // Merge with existing imageMap so that multiple archive uploads accumulate
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
        // Also build a set without archive extension for fuzzy matching
        const normalizedImageMapKeysNoArchive = new Set(
            Object.keys(mergedImageMap).map((k) =>
                stripArchiveExtension(
                    k.replace(/[^a-zA-Z0-9.\-]/g, "_").toLowerCase(),
                ),
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
                    const normalizedNoArchive =
                        stripArchiveExtension(normalized);

                    if (
                        imageMapKeys.has(trimmed) ||
                        normalizedImageMapKeys.has(normalized) ||
                        normalizedImageMapKeysNoArchive.has(
                            normalizedNoArchive,
                        )
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
                    imagePackFileName: files.map((f) => f.name).join(", "),
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
                    : "图片包处理失败，请检查压缩文件后重试。",
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
