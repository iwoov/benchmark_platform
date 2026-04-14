import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const UPLOADS_ROOT =
    process.env.UPLOADS_DIR ||
    path.join(/*turbopackIgnore: true*/ process.cwd(), "uploads");

/**
 * Save a buffer to the uploads directory under a datasource-scoped path.
 *
 * Directory structure: uploads/<datasourceId>/<hash>-<sanitizedName>
 *
 * Returns the relative path (for DB storage / URL construction).
 */
export async function saveUploadedFile(input: {
    datasourceId: string;
    originalFileName: string;
    buffer: Buffer;
}) {
    const hash = crypto
        .createHash("sha256")
        .update(input.buffer)
        .digest("hex")
        .slice(0, 12);
    const safeName = input.originalFileName.replace(
        /[^a-zA-Z0-9._\-]/g,
        "_",
    );
    const storedName = `${hash}-${safeName}`;
    const dirPath = path.join(UPLOADS_ROOT, input.datasourceId);
    const filePath = path.join(dirPath, storedName);
    const relativePath = `${input.datasourceId}/${storedName}`;

    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, input.buffer);

    return relativePath;
}

/**
 * Resolve an upload relative path to its absolute filesystem path.
 * Returns null if the file doesn't exist or the path escapes UPLOADS_ROOT.
 */
export async function resolveUploadPath(relativePath: string) {
    const absolutePath = path.join(UPLOADS_ROOT, relativePath);

    if (!absolutePath.startsWith(UPLOADS_ROOT)) {
        return null;
    }

    try {
        await fs.access(absolutePath);
        return absolutePath;
    } catch {
        return null;
    }
}

/**
 * Delete all uploaded files for a datasource.
 *
 * Directory structure: uploads/<datasourceId>
 */
export async function deleteDatasourceUploads(datasourceId: string) {
    if (!datasourceId.trim()) {
        return;
    }

    const dirPath = path.join(UPLOADS_ROOT, datasourceId);

    if (!dirPath.startsWith(UPLOADS_ROOT)) {
        throw new Error("图片目录路径无效，无法删除。");
    }

    await fs.rm(dirPath, { recursive: true, force: true });
}

export const UPLOAD_URL_PREFIX = "/api/uploads/";

export function toUploadUrl(relativePath: string) {
    return `${UPLOAD_URL_PREFIX}${relativePath}`;
}

export function isUploadUrl(value: string) {
    return value.startsWith(UPLOAD_URL_PREFIX);
}
