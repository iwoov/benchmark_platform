export type AiProtocol = "OPENAI_COMPATIBLE" | "GEMINI_COMPATIBLE";

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
    note: "默认提供 OpenAI 与 Gemini 两类接口。",
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
        sortOrder: 0,
      },
      {
        id: "modelrouter-gemini",
        label: "Gemini 接口",
        protocol: "GEMINI_COMPATIBLE",
        baseUrl: "https://routify.alibaba-inc.com/protocol/vertex/v1",
        sortOrder: 1,
      },
    ],
  },
];

export const aiProtocolLabels: Record<AiProtocol, string> = {
  OPENAI_COMPATIBLE: "OpenAI 兼容",
  GEMINI_COMPATIBLE: "Gemini 协议",
};
