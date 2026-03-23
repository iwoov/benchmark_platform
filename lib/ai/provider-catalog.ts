export type AiProtocol = "OPENAI_COMPATIBLE" | "GEMINI_COMPATIBLE";

export type AiProviderEndpoint = {
  id: string;
  label: string;
  protocol: AiProtocol;
  baseUrl: string;
  models: string[];
};

export type AiProviderCatalogItem = {
  id: string;
  name: string;
  vendorType: string;
  note: string;
  endpoints: AiProviderEndpoint[];
};

function uniqueModels(models: string[]) {
  return [...new Set(models)];
}

const openAiModels = uniqueModels([
  "gpt-5.0-pro",
  "gpt-5.2-codex",
  "gpt-5.3",
  "gpt-5.3",
]);

const geminiModels = uniqueModels([
  "gemini-3.0-pro-preview",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite-preview",
]);

export const aiProviderCatalog: AiProviderCatalogItem[] = [
  {
    id: "idealab",
    name: "idealab",
    vendorType: "IDEALAB",
    note: "当前已接入 OpenAI 与 Gemini 两类接口。",
    endpoints: [
      {
        id: "idealab-openai",
        label: "OpenAI 接口",
        protocol: "OPENAI_COMPATIBLE",
        baseUrl: "https://idealab.alibaba-inc.com/api/openai/v1",
        models: openAiModels,
      },
      {
        id: "idealab-gemini",
        label: "Gemini 接口",
        protocol: "GEMINI_COMPATIBLE",
        baseUrl: "https://idealab.alibaba-inc.com/api/vertex/v1beta",
        models: geminiModels,
      },
    ],
  },
  {
    id: "modelrouter",
    name: "ModelRouter",
    vendorType: "MODEL_ROUTER",
    note: "可作为与 idealab 对应的第二路由入口。",
    endpoints: [
      {
        id: "modelrouter-openai",
        label: "OpenAI 接口",
        protocol: "OPENAI_COMPATIBLE",
        baseUrl: "https://routify.alibaba-inc.com/protocol/openai/v1",
        models: openAiModels,
      },
      {
        id: "modelrouter-gemini",
        label: "Gemini 接口",
        protocol: "GEMINI_COMPATIBLE",
        baseUrl: "https://routify.alibaba-inc.com/protocol/vertex/v1",
        models: geminiModels,
      },
    ],
  },
];

export const aiProtocolLabels: Record<AiProtocol, string> = {
  OPENAI_COMPATIBLE: "OpenAI 兼容",
  GEMINI_COMPATIBLE: "Gemini 协议",
};
