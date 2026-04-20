import JSZip from "jszip";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".bmp",
    ".ico",
    ".avif",
]);

function isImageFile(fileName: string) {
    return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function isZipFile(fileName: string) {
    return path.extname(fileName).toLowerCase() === ".zip";
}

function isHiddenOrMeta(zipPath: string) {
    return zipPath
        .split("/")
        .some((segment) => segment.startsWith(".") || segment === "__MACOSX");
}

export type ExtractedImage = {
    /** The key used to look up this image from a raw field value. */
    matchKey: string;
    /** The original file name of the image. */
    fileName: string;
    /** The raw image bytes. */
    buffer: Buffer;
};

/**
 * Extract all images from a zip buffer.
 *
 * Handles two scenarios:
 *   1. Images directly in the zip (matchKey = relative path or filename)
 *   2. Nested .zip files that contain images (matchKey = the nested zip filename)
 *
 * Returns a flat list of ExtractedImage entries.
 */
export async function extractImagesFromZip(
    zipBuffer: ArrayBuffer,
): Promise<ExtractedImage[]> {
    const zip = await JSZip.loadAsync(zipBuffer);
    const results: ExtractedImage[] = [];

    for (const [zipPath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir || isHiddenOrMeta(zipPath)) {
            continue;
        }

        const fileName = zipPath.split("/").pop();

        if (!fileName) {
            continue;
        }

        if (isImageFile(fileName)) {
            const buffer = Buffer.from(await zipEntry.async("arraybuffer"));

            // Direct image: match by full relative path AND just filename
            results.push({
                matchKey: zipPath,
                fileName,
                buffer,
            });

            if (zipPath !== fileName) {
                results.push({
                    matchKey: fileName,
                    fileName,
                    buffer,
                });
            }
        } else if (isZipFile(fileName)) {
            // Nested zip: extract images inside, matchKey = this zip's filename
            const nestedBuffer = await zipEntry.async("arraybuffer");
            const nestedImages = await extractImagesFromNestedZip(nestedBuffer);

            // Also add matchKey without .zip extension since Windows may strip it
            const fileNameNoZip = fileName.replace(/\.zip$/i, "");

            for (const image of nestedImages) {
                results.push({
                    matchKey: fileName,
                    fileName: image.fileName,
                    buffer: image.buffer,
                });

                // Match without .zip extension
                if (fileNameNoZip !== fileName) {
                    results.push({
                        matchKey: fileNameNoZip,
                        fileName: image.fileName,
                        buffer: image.buffer,
                    });
                }

                // Also match by the full path of this nested zip
                if (zipPath !== fileName) {
                    results.push({
                        matchKey: zipPath,
                        fileName: image.fileName,
                        buffer: image.buffer,
                    });
                }
            }
        }
    }

    return results;
}

/**
 * Extract images from a nested zip buffer (one level only, no further recursion).
 */
async function extractImagesFromNestedZip(
    zipBuffer: ArrayBuffer,
): Promise<Array<{ fileName: string; buffer: Buffer }>> {
    const zip = await JSZip.loadAsync(zipBuffer);
    const images: Array<{ fileName: string; buffer: Buffer }> = [];

    for (const [zipPath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir || isHiddenOrMeta(zipPath)) {
            continue;
        }

        const fileName = zipPath.split("/").pop();

        if (!fileName || !isImageFile(fileName)) {
            continue;
        }

        images.push({
            fileName,
            buffer: Buffer.from(await zipEntry.async("arraybuffer")),
        });
    }

    return images;
}

/**
 * Given the extracted images and a datasource-level save function,
 * build a mapping from matchKey -> array of public URLs.
 *
 * Multiple images can share the same matchKey (e.g. a nested zip with 2 images).
 * Also adds a normalized variant of each key (replacing non-alphanumeric chars
 * with underscore) so that lookups from JSON values with ':' can match filenames
 * saved on Windows where ':' is replaced with '_'.
 */
export function buildImageMap(
    images: ExtractedImage[],
    storedUrls: Map<ExtractedImage, string>,
) {
    const map: Record<string, string[]> = {};

    for (const image of images) {
        const url = storedUrls.get(image);

        if (!url) {
            continue;
        }

        if (!map[image.matchKey]) {
            map[image.matchKey] = [];
        }

        if (!map[image.matchKey].includes(url)) {
            map[image.matchKey].push(url);
        }

        // Also store under a "colon-restored" variant so that lookups using
        // the original value with ':' can find an exact match.
        // e.g. key "...T20_25_44..." also stored as "...T20:25:44..."
        const colonRestored = image.matchKey.replace(
            /(\d{2})_(\d{2})_(\d{2})/g,
            "$1:$2:$3",
        );

        if (colonRestored !== image.matchKey) {
            if (!map[colonRestored]) {
                map[colonRestored] = [];
            }

            if (!map[colonRestored].includes(url)) {
                map[colonRestored].push(url);
            }
        }
    }

    return map;
}
