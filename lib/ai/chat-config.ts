import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { AiBuiltInToolType } from "@/lib/ai/provider-catalog";

export type AiChatConfigView = {
    id: string;
    name: string;
    modelCode: string;
    modelCodes: string[];
    modelBuiltInTools: Record<string, AiBuiltInToolType[]>;
    systemPrompt: string | null;
    presetFields: string[];
    enabled: boolean;
    updatedAt: string;
};

function parsePresetFields(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
        (v): v is string => typeof v === "string" && Boolean(v.trim()),
    );
}

function parseModelCodes(modelCode: string, raw: unknown): string[] {
    if (Array.isArray(raw) && raw.length > 0) {
        return raw.filter(
            (v): v is string => typeof v === "string" && Boolean(v.trim()),
        );
    }
    return [modelCode];
}

export async function getAiChatConfigs(): Promise<AiChatConfigView[]> {
    if (!process.env.DATABASE_URL) return [];

    const rows = await prisma.aiChatConfig.findMany({
        orderBy: [{ updatedAt: "desc" }],
    });

    const modelCodes = [...new Set(rows.flatMap((row) => parseModelCodes(row.modelCode, row.modelCodes)))];
    const models = modelCodes.length
        ? await prisma.aiModel.findMany({
              where: {
                  code: {
                      in: modelCodes,
                  },
              },
              select: {
                  code: true,
                  builtInTools: true,
              },
          })
        : [];
    const modelBuiltInToolsMap = Object.fromEntries(
        models.map((model) => [model.code, model.builtInTools as AiBuiltInToolType[]]),
    ) as Record<string, AiBuiltInToolType[]>;

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        modelCode: row.modelCode,
        modelCodes: parseModelCodes(row.modelCode, row.modelCodes),
        modelBuiltInTools: Object.fromEntries(
            parseModelCodes(row.modelCode, row.modelCodes).map((code) => [
                code,
                modelBuiltInToolsMap[code] ?? [],
            ]),
        ) as Record<string, AiBuiltInToolType[]>,
        systemPrompt: row.systemPrompt,
        presetFields: parsePresetFields(row.presetFields),
        enabled: row.enabled,
        updatedAt: row.updatedAt.toISOString(),
    }));
}

export async function getEnabledAiChatConfigs(): Promise<AiChatConfigView[]> {
    if (!process.env.DATABASE_URL) return [];

    const rows = await prisma.aiChatConfig.findMany({
        where: { enabled: true },
        orderBy: [{ updatedAt: "desc" }],
    });

    const modelCodes = [...new Set(rows.flatMap((row) => parseModelCodes(row.modelCode, row.modelCodes)))];
    const models = modelCodes.length
        ? await prisma.aiModel.findMany({
              where: {
                  code: {
                      in: modelCodes,
                  },
              },
              select: {
                  code: true,
                  builtInTools: true,
              },
          })
        : [];
    const modelBuiltInToolsMap = Object.fromEntries(
        models.map((model) => [model.code, model.builtInTools as AiBuiltInToolType[]]),
    ) as Record<string, AiBuiltInToolType[]>;

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        modelCode: row.modelCode,
        modelCodes: parseModelCodes(row.modelCode, row.modelCodes),
        modelBuiltInTools: Object.fromEntries(
            parseModelCodes(row.modelCode, row.modelCodes).map((code) => [
                code,
                modelBuiltInToolsMap[code] ?? [],
            ]),
        ) as Record<string, AiBuiltInToolType[]>,
        systemPrompt: row.systemPrompt,
        presetFields: parsePresetFields(row.presetFields),
        enabled: row.enabled,
        updatedAt: row.updatedAt.toISOString(),
    }));
}
