import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
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
const ARCHIVE_EXTENSIONS = new Set([".zip", ".rar"]);
const require = createRequire(import.meta.url);
const runtimeRequire = new Function(
    "req",
    "id",
    "return req(id);",
) as (req: typeof require, id: string) => unknown;
const runtimeRequireResolve = new Function(
    "req",
    "id",
    "return req.resolve(id);",
) as (req: typeof require, id: string) => string;

let cachedUnrarWasmBinary: ArrayBuffer | null = null;
let cachedCreateExtractorFromData: CreateExtractorFromData | null = null;
let cachedUnrarEntryPath: string | null = null;
let cachedUnrarWasmPath: string | null = null;

type UnrarExtractedFile = {
    fileHeader: {
        name: string;
        flags: {
            directory: boolean;
        };
    };
    extraction?: Uint8Array;
};

type CreateExtractorFromData = (input: {
    data: ArrayBuffer;
    wasmBinary?: ArrayBuffer;
    password?: string;
}) => Promise<{
    extract(): {
        files: Generator<UnrarExtractedFile>;
    };
}>;

function isImageFile(fileName: string) {
    return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function getArchiveType(fileName: string): "zip" | "rar" | null {
    const ext = path.extname(fileName).toLowerCase();

    if (ext === ".zip") {
        return "zip";
    }

    if (ext === ".rar") {
        return "rar";
    }

    return null;
}

function isArchiveFile(fileName: string) {
    return ARCHIVE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function stripArchiveExtension(value: string) {
    return value.replace(/\.(zip|rar)$/i, "");
}

function normalizeArchivePath(archivePath: string) {
    return archivePath.replace(/\\/g, "/");
}

function toArrayBuffer(value: ArrayBuffer | Uint8Array | Buffer) {
    if (value instanceof ArrayBuffer) {
        return value;
    }

    return value.buffer.slice(
        value.byteOffset,
        value.byteOffset + value.byteLength,
    ) as ArrayBuffer;
}

function getUnrarPackageDir() {
    const packageJsonPath = runtimeRequireResolve(
        require,
        "node-unrar-js/package.json",
    );

    return path.dirname(packageJsonPath);
}

function getUnrarEntryPath() {
    if (cachedUnrarEntryPath) {
        return cachedUnrarEntryPath;
    }

    cachedUnrarEntryPath = path.join(getUnrarPackageDir(), "dist/index.js");

    return cachedUnrarEntryPath;
}

function getUnrarWasmPath() {
    if (cachedUnrarWasmPath) {
        return cachedUnrarWasmPath;
    }

    cachedUnrarWasmPath = path.join(getUnrarPackageDir(), "dist/js/unrar.wasm");

    return cachedUnrarWasmPath;
}

function getUnrarWasmBinary() {
    if (cachedUnrarWasmBinary) {
        return cachedUnrarWasmBinary;
    }

    cachedUnrarWasmBinary = toArrayBuffer(readFileSync(getUnrarWasmPath()));

    return cachedUnrarWasmBinary;
}

function getCreateExtractorFromData() {
    if (cachedCreateExtractorFromData) {
        return cachedCreateExtractorFromData;
    }

    const { createExtractorFromData } = runtimeRequire(
        require,
        getUnrarEntryPath(),
    ) as { createExtractorFromData: CreateExtractorFromData };
    cachedCreateExtractorFromData = createExtractorFromData;

    return cachedCreateExtractorFromData;
}

function isHiddenOrMeta(zipPath: string) {
    return zipPath
        .split("/")
        .some((segment) => segment.startsWith(".") || segment === "__MACOSX");
}

type ArchiveEntry = {
    archivePath: string;
    fileName: string;
    buffer: Buffer;
};

export type ExtractedImage = {
    /** The key used to look up this image from a raw field value. */
    matchKey: string;
    /** The original file name of the image. */
    fileName: string;
    /** The raw image bytes. */
    buffer: Buffer;
};

/**
 * Extract all images from a supported archive buffer.
 *
 * Handles two scenarios:
 *   1. Images directly in the archive (matchKey = relative path or filename)
 *   2. Nested .zip/.rar files that contain images (matchKey = nested archive filename)
 *
 * Returns a flat list of ExtractedImage entries.
 */
export async function extractImagesFromArchive(
    archiveBuffer: ArrayBuffer,
    archiveFileName: string,
): Promise<ExtractedImage[]> {
    const archiveType = getArchiveType(archiveFileName);

    if (!archiveType) {
        throw new Error(`仅支持 .zip 或 .rar 格式的图片包，"${archiveFileName}" 不受支持。`);
    }

    return extractImagesFromArchiveBuffer(archiveBuffer, archiveType, true);
}

async function extractImagesFromArchiveBuffer(
    archiveBuffer: ArrayBuffer,
    archiveType: "zip" | "rar",
    allowNestedArchives: boolean,
): Promise<ExtractedImage[]> {
    const entries = await readArchiveEntries(archiveBuffer, archiveType);
    const results: ExtractedImage[] = [];

    for (const entry of entries) {
        if (isImageFile(entry.fileName)) {
            results.push({
                matchKey: entry.archivePath,
                fileName: entry.fileName,
                buffer: entry.buffer,
            });

            if (entry.archivePath !== entry.fileName) {
                results.push({
                    matchKey: entry.fileName,
                    fileName: entry.fileName,
                    buffer: entry.buffer,
                });
            }

            continue;
        }

        if (!allowNestedArchives || !isArchiveFile(entry.fileName)) {
            continue;
        }

        const nestedArchiveType = getArchiveType(entry.fileName);

        if (!nestedArchiveType) {
            continue;
        }

        const nestedImages = await extractImagesFromArchiveBuffer(
            toArrayBuffer(entry.buffer),
            nestedArchiveType,
            false,
        );
        const archiveNameWithoutExtension = stripArchiveExtension(entry.fileName);

        for (const image of nestedImages) {
            results.push({
                matchKey: entry.fileName,
                fileName: image.fileName,
                buffer: image.buffer,
            });

            if (archiveNameWithoutExtension !== entry.fileName) {
                results.push({
                    matchKey: archiveNameWithoutExtension,
                    fileName: image.fileName,
                    buffer: image.buffer,
                });
            }

            if (entry.archivePath !== entry.fileName) {
                results.push({
                    matchKey: entry.archivePath,
                    fileName: image.fileName,
                    buffer: image.buffer,
                });
            }
        }
    }

    return results;
}

async function readArchiveEntries(
    archiveBuffer: ArrayBuffer,
    archiveType: "zip" | "rar",
): Promise<ArchiveEntry[]> {
    if (archiveType === "zip") {
        return readZipEntries(archiveBuffer);
    }

    return readRarEntries(archiveBuffer);
}

async function readZipEntries(archiveBuffer: ArrayBuffer): Promise<ArchiveEntry[]> {
    const zip = await JSZip.loadAsync(archiveBuffer);
    const entries: ArchiveEntry[] = [];

    for (const [rawArchivePath, zipEntry] of Object.entries(zip.files)) {
        const archivePath = normalizeArchivePath(rawArchivePath);

        if (zipEntry.dir || isHiddenOrMeta(archivePath)) {
            continue;
        }

        const fileName = archivePath.split("/").pop();

        if (!fileName) {
            continue;
        }

        entries.push({
            archivePath,
            fileName,
            buffer: Buffer.from(await zipEntry.async("arraybuffer")),
        });
    }

    return entries;
}

async function readRarEntries(archiveBuffer: ArrayBuffer): Promise<ArchiveEntry[]> {
    const extractor = await getCreateExtractorFromData()({
        data: archiveBuffer,
        wasmBinary: getUnrarWasmBinary(),
    });
    const extracted = extractor.extract();
    const entries: ArchiveEntry[] = [];

    for (const file of extracted.files) {
        const archivePath = normalizeArchivePath(file.fileHeader.name);

        if (
            file.fileHeader.flags.directory ||
            isHiddenOrMeta(archivePath) ||
            !file.extraction
        ) {
            continue;
        }

        const fileName = archivePath.split("/").pop();

        if (!fileName) {
            continue;
        }

        entries.push({
            archivePath,
            fileName,
            buffer: Buffer.from(file.extraction),
        });
    }

    return entries;
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
