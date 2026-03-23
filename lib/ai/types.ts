import type { AiProtocol } from "@/lib/ai/provider-catalog";

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

export type AiSettingsProvider = {
  id: string;
  code: string;
  name: string;
  note: string | null;
  apiKeyConfigured: boolean;
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
