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

export const aiCompanyOptions = [
  { name: "OpenAI", iconPath: "/icon/openai.svg" },
  { name: "Google", iconPath: "/icon/Google.svg" },
  { name: "Anthropic", iconPath: "/icon/Anthropic.svg" },
  { name: "阿里巴巴", iconPath: "/icon/qwen.svg" },
  { name: "字节跳动", iconPath: "/icon/bytedance.svg" },
  { name: "月之暗面", iconPath: "/icon/kimi.svg" },
  { name: "智谱", iconPath: "/icon/gml.svg" },
  { name: "深度求索", iconPath: "/icon/deepseek.svg" },
  { name: "MiniMax", iconPath: "/icon/minimax.svg" },
] as const;

export type AiCompanyName = (typeof aiCompanyOptions)[number]["name"];

const aiCompanyAliasMap: Record<string, AiCompanyName> = {
  openai: "OpenAI",
  google: "Google",
  anthropic: "Anthropic",
  alibaba: "阿里巴巴",
  qwen: "阿里巴巴",
  bytedance: "字节跳动",
  byteDance: "字节跳动",
  moonshot: "月之暗面",
  kimi: "月之暗面",
  zhipu: "智谱",
  glm: "智谱",
  gml: "智谱",
  deepseek: "深度求索",
  minimax: "MiniMax",
};

export function normalizeAiCompanyName(
  value: string | null | undefined,
): AiCompanyName | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  const directMatch = aiCompanyOptions.find(
    (company) => company.name === normalized,
  );

  if (directMatch) {
    return directMatch.name;
  }

  return aiCompanyAliasMap[normalized.toLowerCase()] ?? null;
}

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
