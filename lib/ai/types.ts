import type {
  AiBuiltInToolType,
  AiProtocol,
  AiReasoningLevel,
  AiToolChoiceMode,
} from "@/lib/ai/provider-catalog";

export type AiSettingsEndpointOption = {
  id: string;
  code: string;
  label: string;
  protocol: AiProtocol;
  baseUrl: string;
  providerId: string;
  providerCode: string;
  providerName: string;
};

export type AiSettingsSupportedModel = {
  id: string;
  name: string;
  protocol: AiProtocol;
  companyName: string | null;
};

export type AiSettingsProvider = {
  id: string;
  code: string;
  name: string;
  note: string | null;
  apiKeyConfigured: boolean;
  supportedModels: AiSettingsSupportedModel[];
  endpoints: Array<
    AiSettingsEndpointOption & {
      modelCount: number;
    }
  >;
};

export type AiSettingsModel = {
  id: string;
  code: string;
  protocol: AiProtocol;
  streamDefault: boolean;
  reasoningLevel: AiReasoningLevel;
  maxTokensDefault: number | null;
  temperatureDefault: number | null;
  builtInTools: AiBuiltInToolType[];
  toolChoice: AiToolChoiceMode | null;
  maxToolCalls: number | null;
  maxRetries: number;
  allowFallback: boolean;
  label: string | null;
  note: string | null;
  routes: Array<
    AiSettingsEndpointOption & {
      priority: number;
      enabled: boolean;
      timeoutMs: number;
    }
  >;
};

export type AiSettingsData = {
  databaseEnabled: boolean;
  providers: AiSettingsProvider[];
  endpointOptions: AiSettingsEndpointOption[];
  models: AiSettingsModel[];
};
