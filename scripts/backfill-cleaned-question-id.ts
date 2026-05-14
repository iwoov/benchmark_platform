import { createHash } from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_DATASOURCE_NAMES = [
    "OpenRead",
    "Mercor",
    "人工专家",
    "熵基-HLE三期",
    "澳鹏-HLE三期",
    "Snorkel",
];

const CLEANED_FIELD = "cleaned_question_id";
const QUESTION_ID_KEYS = [
    "question_id",
    "questionId",
    "questionID",
    "Question ID",
    "Question_ID",
    "题目ID",
    "题目id",
    "题目编号",
    "试题编号",
];
const UUID_NAMESPACE = "1f3d6922-7cae-4f7c-9d0d-1f18992dd5a8";
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CliOptions = {
    execute: boolean;
    all: boolean;
    contains: boolean;
    limit: number | null;
    datasourceNames: string[];
};

function readCliOptions(): CliOptions {
    const args = process.argv.slice(2);
    const datasourceNames: string[] = [];
    let execute = false;
    let all = false;
    let contains = false;
    let limit: number | null = null;

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--execute") {
            execute = true;
            continue;
        }

        if (arg === "--all") {
            all = true;
            continue;
        }

        if (arg === "--contains") {
            contains = true;
            continue;
        }

        if (arg === "--datasource" || arg === "--name") {
            const value = args[index + 1]?.trim();
            if (!value) {
                throw new Error(`${arg} 后面必须跟数据源名称。`);
            }
            datasourceNames.push(value);
            index += 1;
            continue;
        }

        if (arg.startsWith("--datasource=") || arg.startsWith("--name=")) {
            const value = arg.split("=").slice(1).join("=").trim();
            if (!value) {
                throw new Error(`${arg} 中缺少数据源名称。`);
            }
            datasourceNames.push(value);
            continue;
        }

        if (arg === "--limit") {
            const value = Number(args[index + 1]);
            if (!Number.isInteger(value) || value < 1) {
                throw new Error("--limit 必须是正整数。");
            }
            limit = value;
            index += 1;
            continue;
        }

        if (arg.startsWith("--limit=")) {
            const value = Number(arg.split("=").slice(1).join("="));
            if (!Number.isInteger(value) || value < 1) {
                throw new Error("--limit 必须是正整数。");
            }
            limit = value;
            continue;
        }

        throw new Error(`不支持的参数：${arg}`);
    }

    return {
        execute,
        all,
        contains,
        limit,
        datasourceNames: datasourceNames.length
            ? datasourceNames
            : DEFAULT_DATASOURCE_NAMES,
    };
}

function normalizeKey(value: string) {
    return value
        .toLowerCase()
        .replace(/[\s_\-()[\]{}<>./\\:：，,;；'"`~!@#$%^&*+=|?！？]/g, "");
}

function trimToNull(value: unknown) {
    if (value === null || value === undefined) {
        return null;
    }

    const stringValue = String(value).trim();
    return stringValue ? stringValue : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseUuidBytes(uuid: string) {
    return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function formatUuid(bytes: Buffer) {
    const hex = bytes.toString("hex");

    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
    ].join("-");
}

function uuidV5(name: string, namespace: string) {
    const hash = createHash("sha1")
        .update(parseUuidBytes(namespace))
        .update(name)
        .digest();
    const bytes = Buffer.from(hash.subarray(0, 16));

    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    return formatUuid(bytes);
}

function findQuestionId(rawRecord: Record<string, unknown>) {
    for (const key of QUESTION_ID_KEYS) {
        const value = trimToNull(rawRecord[key]);
        if (value) {
            return { key, value };
        }
    }

    const normalizedCandidateKeys = new Set(
        QUESTION_ID_KEYS.map((key) => normalizeKey(key)),
    );
    for (const [key, rawValue] of Object.entries(rawRecord)) {
        if (!normalizedCandidateKeys.has(normalizeKey(key))) {
            continue;
        }

        const value = trimToNull(rawValue);
        if (value) {
            return { key, value };
        }
    }

    return null;
}

function buildCleanedQuestionId(datasourceId: string, originalQuestionId: string) {
    if (UUID_PATTERN.test(originalQuestionId)) {
        return originalQuestionId;
    }

    return uuidV5(`${datasourceId}:${originalQuestionId}`, UUID_NAMESPACE);
}

function cloneJsonObject(value: Record<string, unknown>) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function buildDatasourceWhere(options: CliOptions): Prisma.ProjectDataSourceWhereInput {
    if (options.all) {
        return {};
    }

    if (options.contains) {
        return {
            OR: options.datasourceNames.map((name) => ({
                OR: [
                    {
                        name: {
                            contains: name,
                            mode: "insensitive",
                        },
                    },
                    {
                        project: {
                            name: {
                                contains: name,
                                mode: "insensitive",
                            },
                        },
                    },
                    {
                        project: {
                            code: {
                                contains: name,
                                mode: "insensitive",
                            },
                        },
                    },
                ],
            })),
        };
    }

    return {
        OR: [
            {
                name: {
                    in: options.datasourceNames,
                },
            },
            {
                project: {
                    name: {
                        in: options.datasourceNames,
                    },
                },
            },
            {
                project: {
                    code: {
                        in: options.datasourceNames,
                    },
                },
            },
        ],
    };
}

async function main() {
    const options = readCliOptions();
    const datasources = await prisma.projectDataSource.findMany({
        where: buildDatasourceWhere(options),
        orderBy: [{ name: "asc" }, { createdAt: "asc" }],
        select: {
            id: true,
            name: true,
            project: {
                select: {
                    name: true,
                },
            },
            _count: {
                select: {
                    questions: true,
                },
            },
        },
    });

    if (!datasources.length) {
        console.log("未找到匹配的数据源。");
        return;
    }

    const datasourceIds = datasources.map((datasource) => datasource.id);
    const questions = await prisma.question.findMany({
        where: {
            datasourceId: {
                in: datasourceIds,
            },
        },
        ...(options.limit ? { take: options.limit } : {}),
        orderBy: [{ datasourceId: "asc" }, { createdAt: "asc" }],
        select: {
            id: true,
            datasourceId: true,
            externalRecordId: true,
            businessQuestionKey: true,
            metadata: true,
        },
    });
    const datasourceById = new Map(
        datasources.map((datasource) => [datasource.id, datasource]),
    );

    let missingMetadataCount = 0;
    let missingQuestionIdCount = 0;
    let alreadyCleanCount = 0;
    let wouldUpdateCount = 0;
    let updatedCount = 0;

    for (const question of questions) {
        if (!isRecord(question.metadata)) {
            missingMetadataCount += 1;
            continue;
        }

        const rawRecord = question.metadata.rawRecord;
        if (!isRecord(rawRecord)) {
            missingMetadataCount += 1;
            continue;
        }

        const original = findQuestionId(rawRecord);
        if (!original) {
            missingQuestionIdCount += 1;
            continue;
        }

        const cleanedQuestionId = buildCleanedQuestionId(
            question.datasourceId,
            original.value,
        );

        if (rawRecord[CLEANED_FIELD] === cleanedQuestionId) {
            alreadyCleanCount += 1;
            continue;
        }

        wouldUpdateCount += 1;

        if (!options.execute) {
            const datasource = datasourceById.get(question.datasourceId);
            console.log(
                [
                    "[dry-run]",
                    datasource
                        ? `${datasource.project.name} / ${datasource.name}`
                        : question.datasourceId,
                    question.externalRecordId,
                    `${original.key}=${original.value}`,
                    `${CLEANED_FIELD}=${cleanedQuestionId}`,
                ].join(" | "),
            );
            continue;
        }

        const nextMetadata = cloneJsonObject(question.metadata);
        const nextRawRecord = cloneJsonObject(rawRecord);
        nextRawRecord[CLEANED_FIELD] = cleanedQuestionId;
        nextMetadata.rawRecord = nextRawRecord;

        await prisma.question.update({
            where: {
                id: question.id,
            },
            data: {
                metadata: nextMetadata,
            },
        });
        updatedCount += 1;
    }

    console.log("");
    console.log(`匹配数据源：${datasources.length}`);
    for (const datasource of datasources) {
        console.log(
            `- ${datasource.project.name} / ${datasource.name}：${datasource._count.questions} 题`,
        );
    }
    console.log(`扫描题目：${questions.length}`);
    console.log(`缺少 metadata/rawRecord：${missingMetadataCount}`);
    console.log(`缺少 question_id：${missingQuestionIdCount}`);
    console.log(`已存在正确 ${CLEANED_FIELD}：${alreadyCleanCount}`);
    console.log(
        options.execute
            ? `已更新 ${CLEANED_FIELD}：${updatedCount}`
            : `待更新 ${CLEANED_FIELD}：${wouldUpdateCount}`,
    );

    if (!options.execute) {
        console.log("");
        console.log("当前是 dry-run，确认无误后加 --execute 写入数据库。");
    }
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (error) => {
        console.error(error);
        await prisma.$disconnect();
        process.exit(1);
    });
