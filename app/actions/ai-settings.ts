"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { isSuperAdminRole } from "@/lib/auth/roles";
import {
    aiBuiltInToolOptions,
    aiCompanyOptions,
    aiToolChoiceOptions,
    normalizeAiCompanyName,
} from "@/lib/ai/provider-catalog";

export type AiSettingsActionState = {
    error?: string;
    success?: string;
};

const aiCompanyNameEnum = z.enum(
    aiCompanyOptions.map((company) => company.name) as [string, ...string[]],
    {
        message: "开发公司名称不在支持列表中。",
    },
);

const providerEndpointSchema = z.object({
    id: z.string().min(1, "缺少接口 ID"),
    baseUrl: z.string().trim().url("接口地址格式不正确，请输入完整 URL"),
});

const providerSupportedModelSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "支持模型名称不能为空")
        .max(100, "支持模型名称不能超过 100 个字符"),
    protocol: z.enum([
        "OPENAI_COMPATIBLE",
        "OPENAI_RESPONSES",
        "GEMINI_COMPATIBLE",
        "ANTHROPIC_COMPATIBLE",
    ]),
    companyName: z.preprocess(
        (value) =>
            normalizeAiCompanyName(
                typeof value === "string" ? value : String(value ?? ""),
            ),
        aiCompanyNameEnum,
    ),
});

const updateAiProviderSchema = z.object({
    providerId: z.string().min(1, "缺少提供商 ID"),
    name: z
        .string()
        .trim()
        .min(1, "提供商名称不能为空")
        .max(50, "名称不能超过 50 个字符"),
    note: z
        .string()
        .trim()
        .max(200, "备注不能超过 200 个字符")
        .optional()
        .transform((value) => value || undefined),
    apiKey: z
        .string()
        .trim()
        .max(500, "API Key 不能超过 500 个字符")
        .optional()
        .transform((value) => value || undefined),
    endpoints: z.array(providerEndpointSchema).min(1, "至少保留一个接口"),
    supportedModels: z.array(providerSupportedModelSchema),
});

const saveAiModelSchema = z.object({
    modelId: z
        .string()
        .trim()
        .optional()
        .transform((value) => value || undefined),
    code: z
        .string()
        .trim()
        .min(2, "模型名至少 2 个字符")
        .max(100, "模型名不能超过 100 个字符")
        .regex(
            /^[a-zA-Z0-9._:-]+$/,
            "模型名仅支持字母、数字、点、下划线、冒号和短横线",
        ),
    protocol: z.enum([
        "OPENAI_COMPATIBLE",
        "OPENAI_RESPONSES",
        "GEMINI_COMPATIBLE",
        "ANTHROPIC_COMPATIBLE",
    ]),
    streamDefault: z.boolean(),
    reasoningLevel: z.enum(["DISABLED", "LOW", "MEDIUM", "HIGH"]),
    maxTokensDefault: z
        .number()
        .int("默认输出长度必须是整数")
        .min(1, "默认输出长度至少 1")
        .max(32768, "默认输出长度不能超过 32768")
        .nullable(),
    temperatureDefault: z
        .number()
        .min(0, "默认 temperature 不能小于 0")
        .max(2, "默认 temperature 不能大于 2")
        .nullable(),
    builtInTools: z.array(
        z.enum(
            aiBuiltInToolOptions.map((tool) => tool.value) as [
                (typeof aiBuiltInToolOptions)[number]["value"],
                ...(typeof aiBuiltInToolOptions)[number]["value"][],
            ],
        ),
    ),
    toolChoice: z
        .enum(
            aiToolChoiceOptions.map((option) => option.value) as [
                (typeof aiToolChoiceOptions)[number]["value"],
                ...(typeof aiToolChoiceOptions)[number]["value"][],
            ],
        )
        .nullable(),
    maxToolCalls: z
        .number()
        .int("最大工具调用次数必须是整数")
        .min(1, "最大工具调用次数至少为 1")
        .max(128, "最大工具调用次数不能超过 128")
        .nullable(),
    maxRetries: z
        .number()
        .int("重试次数必须是整数")
        .min(0, "重试次数不能小于 0")
        .max(10, "重试次数不能超过 10"),
    allowFallback: z.boolean(),
    label: z
        .string()
        .trim()
        .max(100, "显示名称不能超过 100 个字符")
        .optional()
        .transform((value) => value || undefined),
    note: z
        .string()
        .trim()
        .max(300, "备注不能超过 300 个字符")
        .optional()
        .transform((value) => value || undefined),
    routes: z
        .array(
            z.object({
                endpointId: z.string().min(1, "缺少接口 ID"),
                enabled: z.boolean(),
                timeoutMs: z
                    .number()
                    .int("超时必须是整数")
                    .min(1000, "超时至少 1000ms")
                    .max(120000, "超时不能超过 120000ms"),
            }),
        )
        .min(1, "请至少配置一条路由"),
}).superRefine((value, context) => {
    if (value.protocol !== "OPENAI_RESPONSES") {
        if (value.builtInTools.length) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["builtInTools"],
                message: "只有 OpenAI Responses 模型才能配置内置工具。",
            });
        }

        if (value.toolChoice !== null || value.maxToolCalls !== null) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["toolChoice"],
                message: "只有 OpenAI Responses 模型才能配置工具调用策略。",
            });
        }

        return;
    }

    if (!value.builtInTools.length) {
        if (value.maxToolCalls !== null) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["maxToolCalls"],
                message: "未启用内置工具时无需设置最大工具调用次数。",
            });
        }

        return;
    }

    if (value.toolChoice === null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["toolChoice"],
            message: "启用内置工具后请选择工具调用策略。",
        });
    }
});

const deleteAiModelSchema = z.object({
    modelId: z.string().min(1, "缺少模型 ID"),
});

async function requireAdminAccess() {
    const session = await auth();

    if (!isSuperAdminRole(session?.user.platformRole)) {
        return {
            error: "只有超级管理员可以维护 AI 配置。",
        } satisfies AiSettingsActionState;
    }

    if (!process.env.DATABASE_URL) {
        return {
            error: "当前未配置 DATABASE_URL，无法保存 AI 配置。",
        } satisfies AiSettingsActionState;
    }

    return null;
}

function revalidateAiPages() {
    revalidatePath("/admin/ai");
    revalidatePath("/admin/ai/models");
    revalidatePath("/admin/ai/routes");
    revalidatePath("/dashboard/ai");
    revalidatePath("/dashboard/ai/models");
    revalidatePath("/dashboard/ai/routes");
}

export async function updateAiProviderConfigAction(
    input: z.input<typeof updateAiProviderSchema>,
): Promise<AiSettingsActionState> {
    const accessError = await requireAdminAccess();

    if (accessError) {
        return accessError;
    }

    const parsed = updateAiProviderSchema.safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "提供商配置校验失败。",
        };
    }

    const provider = await prisma.aiProvider.findUnique({
        where: { id: parsed.data.providerId },
        include: {
            endpoints: {
                select: {
                    id: true,
                },
            },
        },
    });

    if (!provider) {
        return {
            error: "提供商不存在。",
        };
    }

    const endpointIds = new Set(
        provider.endpoints.map((endpoint) => endpoint.id),
    );

    for (const endpoint of parsed.data.endpoints) {
        if (!endpointIds.has(endpoint.id)) {
            return {
                error: "提交的接口配置不属于当前提供商。",
            };
        }
    }

    const normalizedModelNames = parsed.data.supportedModels.map((model) =>
        `${model.protocol}:${model.name.trim().toLowerCase()}`,
    );

    if (new Set(normalizedModelNames).size !== normalizedModelNames.length) {
        return {
            error: "同一个供应商下不允许重复的支持模型名称。",
        };
    }

    await prisma.$transaction(async (tx) => {
        await tx.aiProvider.update({
            where: {
                id: provider.id,
            },
            data: {
                name: parsed.data.name,
                note: parsed.data.note,
                ...(parsed.data.apiKey ? { apiKey: parsed.data.apiKey } : {}),
            },
        });

        await tx.aiProviderSupportedModel.deleteMany({
            where: {
                providerId: provider.id,
            },
        });

        if (parsed.data.supportedModels.length) {
            await tx.aiProviderSupportedModel.createMany({
                data: parsed.data.supportedModels.map((model, index) => ({
                    providerId: provider.id,
                    name: model.name,
                    protocol: model.protocol,
                    companyName: model.companyName,
                    sortOrder: index + 1,
                })),
            });
        }

        for (const endpoint of parsed.data.endpoints) {
            await tx.aiProviderEndpoint.update({
                where: {
                    id: endpoint.id,
                },
                data: {
                    baseUrl: endpoint.baseUrl,
                },
            });
        }
    });

    revalidateAiPages();

    return {
        success: `${parsed.data.name} 配置已保存。`,
    };
}

export async function saveAiModelAction(
    input: z.input<typeof saveAiModelSchema>,
): Promise<AiSettingsActionState> {
    const accessError = await requireAdminAccess();

    if (accessError) {
        return accessError;
    }

    const parsed = saveAiModelSchema.safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "模型配置校验失败。",
        };
    }

    const routeEndpointIds = parsed.data.routes.map(
        (route) => route.endpointId,
    );
    const endpointIds = [...new Set(routeEndpointIds)];

    if (endpointIds.length !== routeEndpointIds.length) {
        return {
            error: "同一个接口不能重复加入同一模型的路由链。",
        };
    }

    const endpoints = await prisma.aiProviderEndpoint.findMany({
        where: {
            id: {
                in: endpointIds,
            },
        },
        select: {
            id: true,
            protocol: true,
        },
    });

    if (endpoints.length !== endpointIds.length) {
        return {
            error: "部分接口不存在，请刷新页面后重试。",
        };
    }

    if (
        endpoints.some((endpoint) => endpoint.protocol !== parsed.data.protocol)
    ) {
        return {
            error: "同一个模型的路由链只能绑定同一协议的接口。",
        };
    }

    const existingByCode = await prisma.aiModel.findFirst({
        where: parsed.data.modelId
            ? {
                  code: parsed.data.code,
                  NOT: {
                      id: parsed.data.modelId,
                  },
              }
            : {
                  code: parsed.data.code,
              },
        select: {
            id: true,
        },
    });

    if (existingByCode) {
        return {
            error: "该模型名已存在，请更换后再保存。",
        };
    }

    if (parsed.data.modelId) {
        const model = await prisma.aiModel.findUnique({
            where: {
                id: parsed.data.modelId,
            },
            select: {
                id: true,
            },
        });

        if (!model) {
            return {
                error: "模型不存在。",
            };
        }

        await prisma.$transaction(async (tx) => {
            await tx.aiModel.update({
                where: {
                    id: model.id,
                },
                data: {
                    code: parsed.data.code,
                    protocol: parsed.data.protocol,
                    streamDefault: parsed.data.streamDefault,
                    reasoningLevel: parsed.data.reasoningLevel,
                    maxTokensDefault: parsed.data.maxTokensDefault,
                    temperatureDefault: parsed.data.temperatureDefault,
                    builtInTools: parsed.data.builtInTools,
                    toolChoice: parsed.data.toolChoice,
                    maxToolCalls: parsed.data.maxToolCalls,
                    maxRetries: parsed.data.maxRetries,
                    allowFallback: parsed.data.allowFallback,
                    label: parsed.data.label,
                    note: parsed.data.note,
                },
            });

            await tx.aiProviderEndpointModel.deleteMany({
                where: {
                    modelId: model.id,
                },
            });

            await tx.aiProviderEndpointModel.createMany({
                data: parsed.data.routes.map((route, index) => ({
                    endpointId: route.endpointId,
                    modelId: model.id,
                    priority: index + 1,
                    enabled: route.enabled,
                    timeoutMs: route.timeoutMs,
                })),
            });
        });

        revalidateAiPages();

        return {
            success: `模型 ${parsed.data.code} 已更新。`,
        };
    }

    await prisma.$transaction(async (tx) => {
        const model = await tx.aiModel.create({
            data: {
                code: parsed.data.code,
                protocol: parsed.data.protocol,
                streamDefault: parsed.data.streamDefault,
                reasoningLevel: parsed.data.reasoningLevel,
                maxTokensDefault: parsed.data.maxTokensDefault,
                temperatureDefault: parsed.data.temperatureDefault,
                builtInTools: parsed.data.builtInTools,
                toolChoice: parsed.data.toolChoice,
                maxToolCalls: parsed.data.maxToolCalls,
                maxRetries: parsed.data.maxRetries,
                allowFallback: parsed.data.allowFallback,
                label: parsed.data.label,
                note: parsed.data.note,
            },
            select: {
                id: true,
            },
        });

        await tx.aiProviderEndpointModel.createMany({
            data: parsed.data.routes.map((route, index) => ({
                endpointId: route.endpointId,
                modelId: model.id,
                priority: index + 1,
                enabled: route.enabled,
                timeoutMs: route.timeoutMs,
            })),
        });
    });

    revalidateAiPages();

    return {
        success: `模型 ${parsed.data.code} 已添加。`,
    };
}

export async function deleteAiModelAction(
    input: z.input<typeof deleteAiModelSchema>,
): Promise<AiSettingsActionState> {
    const accessError = await requireAdminAccess();

    if (accessError) {
        return accessError;
    }

    const parsed = deleteAiModelSchema.safeParse(input);

    if (!parsed.success) {
        return {
            error: parsed.error.issues[0]?.message ?? "删除模型失败。",
        };
    }

    const model = await prisma.aiModel.findUnique({
        where: {
            id: parsed.data.modelId,
        },
        select: {
            id: true,
            code: true,
        },
    });

    if (!model) {
        return {
            error: "模型不存在或已被删除。",
        };
    }

    await prisma.aiModel.delete({
        where: {
            id: model.id,
        },
    });

    revalidateAiPages();

    return {
        success: `模型 ${model.code} 已删除。`,
    };
}
