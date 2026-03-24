import type {
  AiProtocol as PrismaAiProtocol,
  AiReasoningLevel as PrismaAiReasoningLevel,
} from "@prisma/client";

export type AiProtocol = PrismaAiProtocol;

export type AiReasoningLevel = PrismaAiReasoningLevel;

export type DefaultAiProviderEndpoint = {
  id: string;
  label: string;
  protocol: AiProtocol;
  baseUrl: string;
  sortOrder: number;
};

export type DefaultAiProvider = {
  id: string;
  name: string;
  vendorType: string;
  note: string;
  endpoints: DefaultAiProviderEndpoint[];
};

export const defaultAiProviders: DefaultAiProvider[] = [
  {
    id: "idealab",
    name: "idealab",
    vendorType: "IDEALAB",
    note: "默认提供 OpenAI、Gemini 与 Anthropic 三类接口。",
    endpoints: [
      {
        id: "idealab-openai",
        label: "OpenAI 接口",
        protocol: "OPENAI_COMPATIBLE",
        baseUrl: "https://idealab.alibaba-inc.com/api/openai/v1",
        sortOrder: 0,
      },
      {
        id: "idealab-gemini",
        label: "Gemini 接口",
        protocol: "GEMINI_COMPATIBLE",
        baseUrl: "https://idealab.alibaba-inc.com/api/vertex/v1beta",
        sortOrder: 1,
      },
      {
        id: "idealab-anthropic",
        label: "Anthropic 接口",
        protocol: "ANTHROPIC_COMPATIBLE",
        baseUrl: "https://idealab.alibaba-inc.com/api/anthropic/v1",
        sortOrder: 2,
      },
    ],
  },
  {
    id: "modelrouter",
    name: "ModelRouter",
    vendorType: "MODEL_ROUTER",
    note: "可作为与 idealab 对应的第二路由入口，同样提供三类协议。",
    endpoints: [
      {
        id: "modelrouter-openai",
        label: "OpenAI 接口",
        protocol: "OPENAI_COMPATIBLE",
        baseUrl: "https://routify.alibaba-inc.com/protocol/openai/v1",
        sortOrder: 0,
      },
      {
        id: "modelrouter-gemini",
        label: "Gemini 接口",
        protocol: "GEMINI_COMPATIBLE",
        baseUrl: "https://routify.alibaba-inc.com/protocol/vertex/v1beta",
        sortOrder: 1,
      },
      {
        id: "modelrouter-anthropic",
        label: "Anthropic 接口",
        protocol: "ANTHROPIC_COMPATIBLE",
        baseUrl: "https://routify.alibaba-inc.com/protocol/anthropic/v1",
        sortOrder: 2,
      },
    ],
  },
];

export const aiProtocolLabels: Record<AiProtocol, string> = {
  OPENAI_COMPATIBLE: "OpenAI 兼容",
  GEMINI_COMPATIBLE: "Gemini 协议",
  ANTHROPIC_COMPATIBLE: "Anthropic 协议",
};

export const aiReasoningLabels: Record<AiReasoningLevel, string> = {
  DISABLED: "关闭",
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
};
