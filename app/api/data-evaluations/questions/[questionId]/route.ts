import { QuestionStatus, type Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

const updateFieldSchema = z.object({
    fieldKey: z.string().trim().min(1, "请选择要更新的字段。"),
    value: z.unknown(),
});

function trimToNull(value: unknown) {
    if (value === null || value === undefined) {
        return null;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    const stringValue = String(value).trim();
    return stringValue ? stringValue : null;
}

function normalizeStatus(value: unknown): QuestionStatus {
    const normalized = trimToNull(value)?.toLowerCase();

    if (!normalized) {
        return "DRAFT";
    }

    if (["submitted", "已提交", "待提交", "pending"].includes(normalized)) {
        return "SUBMITTED";
    }

    if (
        [
            "underreview",
            "under_review",
            "待审核",
            "reviewing",
            "审核中",
        ].includes(normalized.replace(/\s+/g, ""))
    ) {
        return "UNDER_REVIEW";
    }

    if (["approved", "通过", "pass", "passed"].includes(normalized)) {
        return "APPROVED";
    }

    if (["rejected", "驳回", "reject", "rejecteded"].includes(normalized)) {
        return "REJECTED";
    }

    return "DRAFT";
}

function toJsonSafeValue(value: unknown): Prisma.InputJsonValue | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value.map((item) => toJsonSafeValue(item));
    }

    if (typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(
                ([key, item]) => [key, toJsonSafeValue(item)],
            ),
        ) as Prisma.InputJsonObject;
    }

    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return value;
    }

    return String(value);
}

function extractRawRecord(metadata: unknown) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return null;
    }

    const rawRecord = (metadata as Record<string, unknown>).rawRecord;

    if (!rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord)) {
        return null;
    }

    return rawRecord as Record<string, unknown>;
}

function parseFieldMapping(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {} as Record<string, string>;
    }

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(
            (entry): entry is [string, string] =>
                typeof entry[1] === "string" && Boolean(entry[1].trim()),
        ),
    );
}

function buildQuestionUpdateData(input: {
    currentMetadata: unknown;
    currentTitle: string;
    rawRecord: Record<string, unknown>;
    fieldMapping: Record<string, string>;
}) {
    const rawRecord = Object.fromEntries(
        Object.entries(input.rawRecord).map(([key, value]) => [
            key,
            toJsonSafeValue(value),
        ]),
    ) as Prisma.InputJsonObject;
    const metadata =
        input.currentMetadata &&
        typeof input.currentMetadata === "object" &&
        !Array.isArray(input.currentMetadata)
            ? { ...(input.currentMetadata as Record<string, unknown>) }
            : {};

    metadata.rawRecord = rawRecord;

    const rawTitle = trimToNull(rawRecord[input.fieldMapping.title]);
    const rawContent = trimToNull(rawRecord[input.fieldMapping.content]);
    const title =
        rawTitle ?? rawContent?.slice(0, 60) ?? input.currentTitle;
    const content = rawContent ?? rawTitle ?? title;

    return {
        title,
        content,
        answer: trimToNull(rawRecord[input.fieldMapping.answer]),
        analysis: trimToNull(rawRecord[input.fieldMapping.analysis]),
        questionType: trimToNull(rawRecord[input.fieldMapping.questionType]),
        difficulty: trimToNull(rawRecord[input.fieldMapping.difficulty]),
        status: input.fieldMapping.status
            ? normalizeStatus(rawRecord[input.fieldMapping.status])
            : undefined,
        metadata: metadata as Prisma.InputJsonObject,
    } satisfies Prisma.QuestionUpdateInput;
}

async function loadManageableQuestion(questionId: string) {
    const session = await auth();

    if (!session?.user) {
        return {
            error: Response.json(
                { error: "请先登录后再操作题目。" },
                { status: 401 },
            ),
        };
    }

    if (
        session.user.platformRole !== "SUPER_ADMIN" &&
        session.user.platformRole !== "PLATFORM_ADMIN"
    ) {
        return {
            error: Response.json(
                { error: "只有管理员可以操作题目。" },
                { status: 403 },
            ),
        };
    }

    const question = await prisma.question.findUnique({
        where: {
            id: questionId,
        },
        select: {
            id: true,
            projectId: true,
            datasourceId: true,
            externalRecordId: true,
            title: true,
            metadata: true,
            project: {
                select: {
                    createdById: true,
                },
            },
            datasource: {
                select: {
                    fieldMapping: true,
                },
            },
        },
    });

    if (!question) {
        return {
            error: Response.json(
                { error: "题目不存在或已删除。" },
                { status: 404 },
            ),
        };
    }

    if (
        session.user.platformRole === "PLATFORM_ADMIN" &&
        question.project.createdById !== session.user.id
    ) {
        return {
            error: Response.json(
                { error: "只能操作自己导入数据源下的题目。" },
                { status: 403 },
            ),
        };
    }

    return {
        question,
    };
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ questionId: string }> },
) {
    const { questionId } = await params;
    const loaded = await loadManageableQuestion(questionId);

    if (loaded.error) {
        return loaded.error;
    }

    await prisma.$transaction(async (tx) => {
        await tx.review.deleteMany({
            where: {
                projectId: loaded.question.projectId,
                datasourceId: loaded.question.datasourceId,
                externalRecordId: loaded.question.externalRecordId,
            },
        });
        await tx.aiReviewRun.deleteMany({
            where: {
                projectId: loaded.question.projectId,
                datasourceId: loaded.question.datasourceId,
                externalRecordId: loaded.question.externalRecordId,
            },
        });
        await tx.question.delete({
            where: {
                id: loaded.question.id,
            },
        });
    });

    return Response.json({
        success: "题目已删除。",
    });
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ questionId: string }> },
) {
    const { questionId } = await params;
    const loaded = await loadManageableQuestion(questionId);

    if (loaded.error) {
        return loaded.error;
    }

    const parsed = updateFieldSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
        return Response.json(
            { error: parsed.error.issues[0]?.message ?? "更新参数不完整。" },
            { status: 400 },
        );
    }

    const currentRawRecord = extractRawRecord(loaded.question.metadata);

    if (!currentRawRecord) {
        return Response.json(
            { error: "题目原始记录不存在，无法编辑。" },
            { status: 409 },
        );
    }

    if (!(parsed.data.fieldKey in currentRawRecord)) {
        return Response.json(
            { error: "只能编辑原始记录中已有的字段。" },
            { status: 400 },
        );
    }

    const nextRawRecord = {
        ...currentRawRecord,
        [parsed.data.fieldKey]: parsed.data.value,
    };

    await prisma.question.update({
        where: {
            id: loaded.question.id,
        },
        data: buildQuestionUpdateData({
            currentMetadata: loaded.question.metadata,
            currentTitle: loaded.question.title,
            rawRecord: nextRawRecord,
            fieldMapping: parseFieldMapping(loaded.question.datasource.fieldMapping),
        }),
    });

    return Response.json({
        success: "字段已更新。",
    });
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ questionId: string }> },
) {
    const { questionId } = await params;
    const loaded = await loadManageableQuestion(questionId);

    if (loaded.error) {
        return loaded.error;
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
        return Response.json(
            { error: "请选择 JSON 文件。" },
            { status: 400 },
        );
    }

    let jsonValue: unknown;

    try {
        jsonValue = JSON.parse(await file.text());
    } catch {
        return Response.json(
            { error: "JSON 文件格式不正确。" },
            { status: 400 },
        );
    }

    const nextRawRecord = Array.isArray(jsonValue)
        ? jsonValue.length === 1
            ? jsonValue[0]
            : null
        : jsonValue;

    if (
        !nextRawRecord ||
        typeof nextRawRecord !== "object" ||
        Array.isArray(nextRawRecord)
    ) {
        return Response.json(
            { error: "JSON 文件必须是单个对象，或只包含一个对象的数组。" },
            { status: 400 },
        );
    }

    await prisma.question.update({
        where: {
            id: loaded.question.id,
        },
        data: buildQuestionUpdateData({
            currentMetadata: loaded.question.metadata,
            currentTitle: loaded.question.title,
            rawRecord: nextRawRecord as Record<string, unknown>,
            fieldMapping: parseFieldMapping(loaded.question.datasource.fieldMapping),
        }),
    });

    return Response.json({
        success: "原始记录已覆盖。",
    });
}
