import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { AiProtocol } from "@/lib/ai/provider-catalog";

export type AiResolvedRoute = {
  priority: number;
  timeoutMs: number;
  endpointId: string;
  endpointCode: string;
  endpointLabel: string;
  baseUrl: string;
  providerId: string;
  providerCode: string;
  providerName: string;
  apiKey: string | null;
};

export type AiModelRoutingConfig = {
  modelId: string;
  modelCode: string;
  protocol: AiProtocol;
  routes: AiResolvedRoute[];
};

export async function getAiModelRoutingConfig(
  modelCode: string,
): Promise<AiModelRoutingConfig | null> {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  const model = await prisma.aiModel.findUnique({
    where: {
      code: modelCode,
    },
    include: {
      endpoints: {
        where: {
          enabled: true,
        },
        orderBy: {
          priority: "asc",
        },
        include: {
          endpoint: {
            include: {
              provider: true,
            },
          },
        },
      },
    },
  });

  if (!model) {
    return null;
  }

  return {
    modelId: model.id,
    modelCode: model.code,
    protocol: model.protocol,
    routes: model.endpoints.map((route) => ({
      priority: route.priority,
      timeoutMs: route.timeoutMs,
      endpointId: route.endpoint.id,
      endpointCode: route.endpoint.code,
      endpointLabel: route.endpoint.label,
      baseUrl: route.endpoint.baseUrl,
      providerId: route.endpoint.provider.id,
      providerCode: route.endpoint.provider.code,
      providerName: route.endpoint.provider.name,
      apiKey: route.endpoint.provider.apiKey ?? null,
    })),
  };
}

export async function getCallableAiModelRoutes(modelCode: string) {
  const config = await getAiModelRoutingConfig(modelCode);

  if (!config) {
    return null;
  }

  return config.routes.filter((route) => Boolean(route.apiKey));
}
