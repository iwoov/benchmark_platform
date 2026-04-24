import "server-only";

import { prisma } from "@/lib/db/prisma";
import { defaultAiProviders } from "@/lib/ai/provider-catalog";
import type {
  AiSettingsData,
  AiSettingsEndpointOption,
  AiSettingsModel,
  AiSettingsProvider,
} from "@/lib/ai/types";

const defaultProviderOrder = new Map(
  defaultAiProviders.map((provider, index) => [provider.id, index]),
);

export async function ensureDefaultAiProviders() {
  if (!process.env.DATABASE_URL) {
    return;
  }

  for (const provider of defaultAiProviders) {
    const savedProvider = await prisma.aiProvider.upsert({
      where: { code: provider.id },
      update: {
        name: provider.name,
        note: provider.note,
      },
      create: {
        code: provider.id,
        name: provider.name,
        note: provider.note,
      },
    });

    for (const endpoint of provider.endpoints) {
      await prisma.aiProviderEndpoint.upsert({
        where: { code: endpoint.id },
        update: {
          label: endpoint.label,
          protocol: endpoint.protocol,
          baseUrl: endpoint.baseUrl,
          sortOrder: endpoint.sortOrder,
        },
        create: {
          providerId: savedProvider.id,
          code: endpoint.id,
          label: endpoint.label,
          protocol: endpoint.protocol,
          baseUrl: endpoint.baseUrl,
          sortOrder: endpoint.sortOrder,
        },
      });
    }
  }
}

export async function getAiSettingsData(): Promise<AiSettingsData> {
  if (!process.env.DATABASE_URL) {
    return {
      databaseEnabled: false,
      providers: [],
      endpointOptions: [],
      models: [],
    };
  }

  await ensureDefaultAiProviders();

  const [providers, models] = await Promise.all([
    prisma.aiProvider.findMany({
      include: {
        supportedModels: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
        endpoints: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: {
            models: {
              select: {
                modelId: true,
              },
            },
          },
        },
      },
    }),
    prisma.aiModel.findMany({
      orderBy: [{ createdAt: "desc" }, { code: "asc" }],
      include: {
        endpoints: {
          orderBy: [{ priority: "asc" }, { endpointId: "asc" }],
          include: {
            endpoint: {
              include: {
                provider: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const mappedProviders = providers
    .map<AiSettingsProvider>((provider) => ({
      id: provider.id,
      code: provider.code,
      name: provider.name,
      note: provider.note,
      apiKeyConfigured: Boolean(provider.apiKey),
      supportedModels: provider.supportedModels.map((model) => ({
        id: model.id,
        name: model.name,
        protocol: model.protocol,
        companyName: model.companyName,
      })),
      endpoints: provider.endpoints.map((endpoint) => ({
        id: endpoint.id,
        code: endpoint.code,
        label: endpoint.label,
        protocol: endpoint.protocol,
        baseUrl: endpoint.baseUrl,
        providerId: provider.id,
        providerCode: provider.code,
        providerName: provider.name,
        modelCount: endpoint.models.length,
      })),
    }))
    .sort((left, right) => {
      const leftOrder =
        defaultProviderOrder.get(left.code) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder =
        defaultProviderOrder.get(right.code) ?? Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.name.localeCompare(right.name);
    });

  const endpointOptions = mappedProviders.flatMap(
    (provider) => provider.endpoints,
  );

  const mappedModels = models.map<AiSettingsModel>((model) => ({
    id: model.id,
    code: model.code,
    protocol: model.protocol,
    streamDefault: model.streamDefault,
    reasoningLevel: model.reasoningLevel,
    maxTokensDefault: model.maxTokensDefault,
    temperatureDefault: model.temperatureDefault,
    builtInTools: model.builtInTools as AiSettingsModel["builtInTools"],
    toolChoice: (model.toolChoice as AiSettingsModel["toolChoice"]) ?? null,
    maxToolCalls: model.maxToolCalls,
    maxRetries: model.maxRetries,
    allowFallback: model.allowFallback,
    label: model.label,
    note: model.note,
    routes: model.endpoints.map((item) => ({
      id: item.endpoint.id,
      code: item.endpoint.code,
      label: item.endpoint.label,
      protocol: item.endpoint.protocol,
      baseUrl: item.endpoint.baseUrl,
      providerId: item.endpoint.provider.id,
      providerCode: item.endpoint.provider.code,
      providerName: item.endpoint.provider.name,
      priority: item.priority,
      enabled: item.enabled,
      timeoutMs: item.timeoutMs,
    })),
  }));

  return {
    databaseEnabled: true,
    providers: mappedProviders,
    endpointOptions,
    models: mappedModels,
  };
}
