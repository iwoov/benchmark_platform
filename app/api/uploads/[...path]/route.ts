import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveUploadPath } from "@/lib/import/file-storage";

const MIME_TYPES: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".avif": "image/avif",
};

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ path: string[] }> },
) {
    const segments = await params;
    const relativePath = segments.path.join("/");

    if (!relativePath || relativePath.includes("..")) {
        return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const absolutePath = await resolveUploadPath(relativePath);

    if (!absolutePath) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const buffer = await fs.readFile(absolutePath);

    return new NextResponse(buffer, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    });
}
