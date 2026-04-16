"use client";

import Image from "next/image";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Button,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
} from "antd";
import {
  ArrowDown,
  ArrowUp,
  KeyRound,
  PencilLine,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteAiModelAction,
  saveAiModelAction,
  updateAiProviderConfigAction,
} from "@/app/actions/ai-settings";
import {
  aiCompanyOptions,
  aiProtocolLabels,
  aiReasoningLabels,
  normalizeAiCompanyName,
  type AiCompanyName,
  type AiProtocol,
  type AiReasoningLevel,
} from "@/lib/ai/provider-catalog";
import type {
  AiSettingsEndpointOption,
  AiSettingsModel,
  AiSettingsProvider,
  AiSettingsSupportedModel,
} from "@/lib/ai/types";

type ModelRouteFormState = {
  endpointId: string;
  enabled: boolean;
  timeoutMs: number;
};

type ModelFormState = {
  modelId?: string;
  code: string;
  protocol: AiProtocol;
  streamDefault: boolean;
  reasoningLevel: AiReasoningLevel;
  maxTokensDefault: number | null;
  temperatureDefault: number | null;
  maxRetries: number;
  allowFallback: boolean;
  label: string;
  note: string;
  routes: ModelRouteFormState[];
};

type ProviderFormState = {
  providerId: string;
  name: string;
  note: string;
  apiKey: string;
  supportedModels: Array<{
    id: string;
    name: string;
    protocol: AiProtocol;
    companyName: string;
  }>;
  endpoints: Array<{
    id: string;
    label: string;
    protocol: AiProtocol;
    baseUrl: string;
    modelCount: number;
  }>;
};

function createModelFormState(model?: AiSettingsModel): ModelFormState {
  return {
    modelId: model?.id,
    code: model?.code ?? "",
    protocol: model?.protocol ?? "OPENAI_COMPATIBLE",
    streamDefault: model?.streamDefault ?? true,
    reasoningLevel: model?.reasoningLevel ?? "DISABLED",
    maxTokensDefault: model?.maxTokensDefault ?? null,
    temperatureDefault: model?.temperatureDefault ?? null,
    maxRetries: model?.maxRetries ?? 1,
    allowFallback: model?.allowFallback ?? true,
    label: model?.label ?? "",
    note: model?.note ?? "",
    routes:
      model?.routes.map((route) => ({
        endpointId: route.id,
        enabled: route.enabled,
        timeoutMs: route.timeoutMs,
      })) ?? [],
  };
}

function createProviderSupportedModelFormState(
  model?: Partial<AiSettingsSupportedModel>,
) {
  return {
    id:
      model?.id ??
      `supported-model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: model?.name ?? "",
    protocol: model?.protocol ?? "OPENAI_COMPATIBLE",
    companyName:
      normalizeAiCompanyName(model?.companyName) ??
      aiCompanyOptions[0].name,
  };
}

function createProviderFormState(
  provider?: AiSettingsProvider,
): ProviderFormState | null {
  if (!provider) {
    return null;
  }

  return {
    providerId: provider.id,
    name: provider.name,
    note: provider.note ?? "",
    apiKey: "",
    supportedModels: provider.supportedModels.map((model) =>
      createProviderSupportedModelFormState(model),
    ),
    endpoints: provider.endpoints.map((endpoint) => ({
      id: endpoint.id,
      label: endpoint.label,
      protocol: endpoint.protocol,
      baseUrl: endpoint.baseUrl,
      modelCount: endpoint.modelCount,
    })),
  };
}

function endpointLabel(providerName: string, label: string) {
  return `${providerName} / ${label}`;
}

function routeStatusLabel(index: number) {
  return index === 0 ? "主路由" : `备用 ${index}`;
}

const providerProtocolColumns: Array<{
  protocol: AiProtocol;
  label: string;
}> = [
  { protocol: "OPENAI_COMPATIBLE", label: "OpenAI 接口" },
  { protocol: "GEMINI_COMPATIBLE", label: "Gemini 接口" },
  { protocol: "ANTHROPIC_COMPATIBLE", label: "Anthropic 接口" },
];

export function AiSettingsConsole({
  databaseEnabled,
  providers,
  endpointOptions,
  models,
  mode = "all",
}: {
  databaseEnabled: boolean;
  providers: AiSettingsProvider[];
  endpointOptions: AiSettingsEndpointOption[];
  models: AiSettingsModel[];
  mode?: "all" | "models" | "routes";
}) {
  const router = useRouter();
  const { notification } = App.useApp();
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [providerPendingId, setProviderPendingId] = useState<string | null>(
    null,
  );
  const [activeProviderCompany, setActiveProviderCompany] = useState("");
  const [savingModelId, setSavingModelId] = useState<string | null>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderFormState | null>(
    null,
  );
  const [modelForm, setModelForm] = useState<ModelFormState>(
    createModelFormState(),
  );
  const [isSavingProvider, startSavingProvider] = useTransition();
  const [isSavingModel, startSavingModel] = useTransition();
  const [isDeletingModel, startDeletingModel] = useTransition();

  const endpointMap = useMemo(
    () =>
      Object.fromEntries(
        endpointOptions.map((endpoint) => [endpoint.id, endpoint]),
      ) as Record<string, AiSettingsEndpointOption>,
    [endpointOptions],
  );

  const protocolEndpointOptions = useMemo(
    () =>
      endpointOptions.filter(
        (endpoint) => endpoint.protocol === modelForm.protocol,
      ),
    [endpointOptions, modelForm.protocol],
  );

  const availableRouteOptions = useMemo(
    () =>
      protocolEndpointOptions.filter(
        (endpoint) =>
          !modelForm.routes.some((route) => route.endpointId === endpoint.id),
      ),
    [modelForm.routes, protocolEndpointOptions],
  );

  const visibleProviderCompanies = useMemo(() => {
    const existingCompanies =
      providerForm?.supportedModels
        .map((model) => model.companyName.trim())
        .filter(Boolean) ?? [];

    return [
      ...aiCompanyOptions.map((company) => company.name),
      ...existingCompanies.filter(
        (company) =>
          !aiCompanyOptions.some((option) => option.name === company),
      ),
    ];
  }, [providerForm?.supportedModels]);

  const activeCompanyModels = useMemo(
    () =>
      providerForm?.supportedModels.filter(
        (model) => model.companyName.trim() === activeProviderCompany,
      ) ?? [],
    [activeProviderCompany, providerForm?.supportedModels],
  );

  function notifyResult(result: { error?: string; success?: string }) {
    if (result.error) {
      notification.error({
        message: "保存失败",
        description: result.error,
        placement: "topRight",
      });
      return false;
    }

    if (result.success) {
      notification.success({
        message: "保存成功",
        description: result.success,
        placement: "topRight",
      });
    }

    router.refresh();
    return true;
  }

  function openProviderModal(provider: AiSettingsProvider) {
    const formState = createProviderFormState(provider);
    const firstCompanyWithModels = aiCompanyOptions.find((company) =>
      formState?.supportedModels.some(
        (model) => model.companyName.trim() === company.name,
      ),
    );

    setProviderForm(formState);
    setActiveProviderCompany(firstCompanyWithModels?.name ?? aiCompanyOptions[0].name);
    setProviderModalOpen(true);
  }

  function closeProviderModal() {
    setProviderModalOpen(false);
    setProviderForm(null);
    setActiveProviderCompany("");
  }

  function openCreateModelModal() {
    setModelForm(createModelFormState());
    setModelModalOpen(true);
  }

  function openEditModelModal(model: AiSettingsModel) {
    setModelForm(createModelFormState(model));
    setModelModalOpen(true);
  }

  function closeModelModal() {
    setModelModalOpen(false);
    setModelForm(createModelFormState());
  }

  function addRoute(endpointId: string) {
    setModelForm((current) => ({
      ...current,
      routes: [
        ...current.routes,
        {
          endpointId,
          enabled: true,
          timeoutMs: 15000,
        },
      ],
    }));
  }

  function moveRoute(index: number, direction: -1 | 1) {
    setModelForm((current) => {
      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= current.routes.length) {
        return current;
      }

      const routes = [...current.routes];
      const [item] = routes.splice(index, 1);
      routes.splice(nextIndex, 0, item);

      return {
        ...current,
        routes,
      };
    });
  }

  function removeRoute(index: number) {
    setModelForm((current) => ({
      ...current,
      routes: current.routes.filter((_, routeIndex) => routeIndex !== index),
    }));
  }

  function updateRoute(index: number, patch: Partial<ModelRouteFormState>) {
    setModelForm((current) => ({
      ...current,
      routes: current.routes.map((route, routeIndex) =>
        routeIndex === index ? { ...route, ...patch } : route,
      ),
    }));
  }

  function updateProviderEndpoint(
    endpointId: string,
    patch: Partial<ProviderFormState["endpoints"][number]>,
  ) {
    setProviderForm((current) =>
      current
        ? {
            ...current,
            endpoints: current.endpoints.map((endpoint) =>
              endpoint.id === endpointId ? { ...endpoint, ...patch } : endpoint,
            ),
          }
        : current,
    );
  }

  function addProviderSupportedModel(
    companyName = activeProviderCompany as AiCompanyName,
  ) {
    const normalizedCompanyName = companyName.trim();

    if (!normalizedCompanyName) {
      return;
    }

    setProviderForm((current) =>
      current
        ? {
            ...current,
            supportedModels: [
              ...current.supportedModels,
              createProviderSupportedModelFormState({
                name: "",
                protocol: "OPENAI_COMPATIBLE",
                companyName: normalizedCompanyName,
              }),
            ],
          }
        : current,
    );
  }

  function updateProviderSupportedModel(
    modelId: string,
    patch: Partial<ProviderFormState["supportedModels"][number]>,
  ) {
    setProviderForm((current) =>
      current
        ? {
            ...current,
            supportedModels: current.supportedModels.map((model) =>
              model.id === modelId ? { ...model, ...patch } : model,
            ),
          }
        : current,
    );
  }

  function removeProviderSupportedModel(modelId: string) {
    setProviderForm((current) =>
      current
        ? {
            ...current,
            supportedModels: current.supportedModels.filter(
              (model) => model.id !== modelId,
            ),
          }
        : current,
    );
  }

  function handleProviderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!providerForm) {
      return;
    }

    setProviderPendingId(providerForm.providerId);
    startSavingProvider(async () => {
      const result = await updateAiProviderConfigAction({
        providerId: providerForm.providerId,
        name: providerForm.name,
        note: providerForm.note,
        apiKey: providerForm.apiKey,
        supportedModels: providerForm.supportedModels.map((model) => ({
          name: model.name,
          protocol: model.protocol,
          companyName: model.companyName,
        })),
        endpoints: providerForm.endpoints.map((endpoint) => ({
          id: endpoint.id,
          baseUrl: endpoint.baseUrl,
        })),
      });

      const success = notifyResult(result);

      if (success) {
        closeProviderModal();
      }

      setProviderPendingId(null);
    });
  }

  function handleModelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSavingModelId(modelForm.modelId ?? "new");
    startSavingModel(async () => {
      const result = await saveAiModelAction({
        modelId: modelForm.modelId,
        code: modelForm.code,
        protocol: modelForm.protocol,
        streamDefault: modelForm.streamDefault,
        reasoningLevel: modelForm.reasoningLevel,
        maxTokensDefault: modelForm.maxTokensDefault,
        temperatureDefault: modelForm.temperatureDefault,
        maxRetries: modelForm.maxRetries,
        allowFallback: modelForm.allowFallback,
        label: modelForm.label,
        note: modelForm.note,
        routes: modelForm.routes,
      });

      const success = notifyResult(result);

      if (success) {
        closeModelModal();
      }

      setSavingModelId(null);
    });
  }

  function handleDeleteModel(model: AiSettingsModel) {
    setDeletingModelId(model.id);
    startDeletingModel(async () => {
      const result = await deleteAiModelAction({
        modelId: model.id,
      });

      notifyResult(result);
      setDeletingModelId(null);
    });
  }

  const showRouteManagement = mode === "all" || mode === "routes";
  const showModelManagement = mode === "all" || mode === "models";

  return (
    <div className="ai-settings-page">
      {showRouteManagement ? (
        <section className="content-surface">
          <div className="section-head ai-settings-section-head">
            <div>
              <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                供应商
              </h2>
              <p
                className="muted"
                style={{ margin: "10px 0 0", lineHeight: 1.7 }}
              >
                统一维护提供商 API Key、接口地址和各接口的模型覆盖情况。
              </p>
            </div>
          </div>

          {!databaseEnabled ? (
            <Empty description="当前未配置数据库，无法保存供应商配置。" />
          ) : !providers.length ? (
            <Empty description="当前还没有供应商配置。" />
          ) : (
            <div className="table-surface">
              <div className="ai-provider-list-head">
                <div>供应商</div>
                <div>API Key</div>
                {providerProtocolColumns.map((column) => (
                  <div key={column.protocol}>{column.label}</div>
                ))}
                <div>操作</div>
              </div>

              {providers.map((provider) => {
                const endpointByProtocol = Object.fromEntries(
                  provider.endpoints.map((endpoint) => [
                    endpoint.protocol,
                    endpoint,
                  ]),
                ) as Partial<Record<AiProtocol, AiSettingsProvider["endpoints"][number]>>;

                return (
                  <article key={provider.id} className="ai-provider-list-row">
                    <div>
                      <div className="ai-provider-overview-title">
                        <div style={{ fontWeight: 700 }}>{provider.name}</div>
                        <Tag>{provider.code}</Tag>
                      </div>
                    </div>

                    <div>
                      <Tag color={provider.apiKeyConfigured ? "success" : "default"}>
                        {provider.apiKeyConfigured ? "已配置" : "未配置"}
                      </Tag>
                    </div>

                    {providerProtocolColumns.map((column) => {
                      const endpoint = endpointByProtocol[column.protocol];
                      const supportedModelCount = provider.supportedModels.filter(
                        (model) => model.protocol === column.protocol,
                      ).length;

                      return (
                        <div key={column.protocol} className="ai-provider-protocol-cell">
                          {endpoint ? (
                            <Tag color="blue">{supportedModelCount} 个模型</Tag>
                          ) : (
                            <span className="muted">未配置</span>
                          )}
                        </div>
                      );
                    })}

                  <div className="ai-provider-overview-actions">
                    <Tooltip title="编辑供应商">
                      <Button
                        icon={<PencilLine size={16} />}
                        onClick={() => openProviderModal(provider)}
                      />
                    </Tooltip>
                  </div>
                </article>
              );
              })}
            </div>
          )}
        </section>
      ) : null}

      {showModelManagement ? (
        <section className="content-surface">
          <div className="section-head ai-settings-section-head">
            <div>
              <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                模型路由
              </h2>
              <p
                className="muted"
                style={{ margin: "10px 0 0", lineHeight: 1.7 }}
              >
                统一维护模型协议、默认参数和主备路由链。
              </p>
            </div>
            <Button
              type="primary"
              icon={<Plus size={16} />}
              onClick={openCreateModelModal}
              disabled={!databaseEnabled || !endpointOptions.length}
            >
              新建模型路由
            </Button>
          </div>

          {!databaseEnabled ? (
            <Empty description="当前未配置数据库，无法维护模型路由。" />
          ) : !models.length ? (
            <Empty description="当前还没有模型路由，点击右上角开始添加。" />
          ) : (
            <div className="ai-model-overview-grid">
              {models.map((model) => (
                <article key={model.id} className="ai-model-overview-card">
                  <div className="ai-model-overview-head">
                    <div>
                      <div className="ai-provider-overview-title">
                        <h3 style={{ margin: 0, fontSize: 18 }}>{model.code}</h3>
                        <Tag color="blue">{aiProtocolLabels[model.protocol]}</Tag>
                        <Tag>{model.routes.length} 条路由</Tag>
                      </div>
                      {model.label ? (
                        <div className="muted" style={{ marginTop: 6 }}>
                          {model.label}
                        </div>
                      ) : null}
                    </div>
                    <div className="ai-model-overview-meta">
                      <span className="muted">
                        {model.routes[0]
                          ? `主路由：${endpointLabel(
                              model.routes[0].providerName,
                              model.routes[0].label,
                            )}`
                          : "未配置路由"}
                      </span>
                      {model.note ? (
                        <span className="muted">备注：{model.note}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="ai-model-overview-actions">
                    <Button
                      icon={<PencilLine size={16} />}
                      onClick={() => openEditModelModal(model)}
                    >
                      编辑
                    </Button>
                    <Popconfirm
                      title="删除模型"
                      description={`确认删除 ${model.code} 吗？`}
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() => handleDeleteModel(model)}
                    >
                      <Button
                        danger
                        icon={<Trash2 size={16} />}
                        loading={isDeletingModel && deletingModelId === model.id}
                      >
                        删除
                      </Button>
                    </Popconfirm>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <Modal
        open={providerModalOpen}
        onCancel={closeProviderModal}
        footer={null}
        destroyOnHidden
        width={760}
        wrapClassName="ai-provider-modal-wrap"
        title={
          providerForm ? (
            <div className="ai-provider-modal-title">
              <div className="ai-provider-modal-eyebrow">供应商配置</div>
              <div className="ai-provider-modal-heading">
                编辑提供商 · {providerForm.name}
              </div>
            </div>
          ) : (
            "编辑提供商"
          )
        }
      >
        {providerForm ? (
          <form className="ai-modal-form" onSubmit={handleProviderSubmit}>
            <div className="ai-modal-panel ai-modal-panel-compact">
              <div className="ai-modal-panel-head">
                <div>
                  <div style={{ fontWeight: 700 }}>基础配置</div>
                  <div className="muted ai-modal-panel-copy">
                    API Key 更新后立即影响当前供应商的调用。
                  </div>
                </div>
                <Tag>{providerForm.endpoints.length} 个接口</Tag>
              </div>

              <div className="ai-provider-form-grid">
                <div className="ai-provider-form-full">
                  <label className="field-label" htmlFor="provider-api-key">
                    API Key
                  </label>
                  <Input.Password
                    id="provider-api-key"
                    size="large"
                    prefix={<KeyRound size={16} />}
                    value={providerForm.apiKey}
                    onChange={(event) =>
                      setProviderForm((current) =>
                        current
                          ? { ...current, apiKey: event.target.value }
                          : current,
                      )
                    }
                    placeholder="留空表示不更换已保存的 API Key"
                  />
                </div>
              </div>
            </div>

            <div className="ai-modal-panel ai-modal-panel-compact">
              <div className="ai-modal-panel-head">
                <div>
                  <div style={{ fontWeight: 700 }}>支持模型</div>
                  <div className="muted ai-modal-panel-copy">
                    按开发公司分组维护当前供应商支持的模型。
                  </div>
                </div>
              </div>

              <div className="ai-company-switcher">
                <div className="ai-company-chip-list">
                  {visibleProviderCompanies.map((company) => {
                    const companyMeta = aiCompanyOptions.find(
                      (option) => option.name === company,
                    );

                    return (
                      <Button
                        key={company}
                        type={
                          company === activeProviderCompany ? "primary" : "default"
                        }
                        onClick={() => setActiveProviderCompany(company)}
                        className="ai-company-chip"
                      >
                        {companyMeta ? (
                          <Image
                            src={companyMeta.iconPath}
                            alt={company}
                            width={16}
                            height={16}
                            className="ai-company-chip-icon"
                          />
                        ) : null}
                        <span>{company}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              {activeProviderCompany ? (
                <>
                  <div className="ai-supported-model-toolbar">
                    <div className="ai-supported-model-company">
                      <div style={{ fontWeight: 700 }}>{activeProviderCompany}</div>
                      <div className="muted ai-supported-model-count">
                        {activeCompanyModels.length} 个模型
                      </div>
                    </div>
                    <Space size={8} wrap>
                      <Tooltip title="添加模型">
                        <Button
                          icon={<Plus size={16} />}
                          onClick={() =>
                            addProviderSupportedModel(
                              activeProviderCompany as AiCompanyName,
                            )
                          }
                        />
                      </Tooltip>
                    </Space>
                  </div>

                  {!activeCompanyModels.length ? (
                    <div className="workspace-tip">
                      <Tag color="blue">提示</Tag>
                      <span>当前公司下还没有模型，点击右上角“添加模型”开始录入。</span>
                    </div>
                  ) : (
                    <div className="ai-supported-model-list">
                      {activeCompanyModels.map((model, index) => (
                        <div key={model.id} className="ai-supported-model-item">
                          <div className="ai-supported-model-index">{index + 1}</div>
                          <div className="ai-supported-model-fields">
                            <div>
                              <label className="field-label">模型名称</label>
                              <Input
                                size="large"
                                value={model.name}
                                placeholder="例如 gpt-5.3"
                                onChange={(event) =>
                                  updateProviderSupportedModel(model.id, {
                                    name: event.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label className="field-label">协议</label>
                              <Select
                                size="large"
                                value={model.protocol}
                                options={providerProtocolColumns.map((column) => ({
                                  value: column.protocol,
                                  label: column.label,
                                }))}
                                onChange={(value) =>
                                  updateProviderSupportedModel(model.id, {
                                    protocol: value as AiProtocol,
                                  })
                                }
                              />
                            </div>
                          </div>
                          <Button
                            danger
                            icon={<Trash2 size={16} />}
                            onClick={() => removeProviderSupportedModel(model.id)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="ai-modal-panel ai-modal-panel-compact">
              <div className="ai-modal-panel-head">
                <div style={{ fontWeight: 700 }}>接口地址</div>
                <Tag color="blue">按协议区分</Tag>
              </div>

              <div className="ai-provider-endpoint-edit-list">
                {providerForm.endpoints.map((endpoint) => (
                  <div key={endpoint.id} className="ai-provider-endpoint-edit-item">
                    <div className="ai-provider-endpoint-edit-head">
                      <div className="ai-provider-overview-title">
                        <div style={{ fontWeight: 600 }}>{endpoint.label}</div>
                        <Tag>
                          {
                            providerForm.supportedModels.filter(
                              (model) => model.protocol === endpoint.protocol,
                            ).length
                          }
                        </Tag>
                      </div>
                      <Tag color="blue">{aiProtocolLabels[endpoint.protocol]}</Tag>
                    </div>
                    <Input
                      size="large"
                      value={endpoint.baseUrl}
                      onChange={(event) =>
                        updateProviderEndpoint(endpoint.id, {
                          baseUrl: event.target.value,
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="ai-model-form-actions ai-provider-modal-actions">
              <Button onClick={closeProviderModal}>取消</Button>
              <Button
                type="primary"
                htmlType="submit"
                icon={<Settings2 size={16} />}
                loading={
                  isSavingProvider &&
                  providerPendingId === providerForm.providerId
                }
              >
                保存供应商配置
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={modelModalOpen}
        onCancel={closeModelModal}
        footer={null}
        destroyOnHidden
        title={modelForm.modelId ? "编辑模型路由" : "新建模型路由"}
        width={760}
      >
        <form className="ai-model-form ai-model-form-compact" onSubmit={handleModelSubmit}>
          <div className="ai-modal-header-inline">
            <div>
              <div style={{ fontWeight: 700 }}>
                {modelForm.modelId ? "编辑模型" : "新建模型"}
              </div>
              <div className="muted" style={{ marginTop: 4 }}>
                基础信息和路由链集中在一个弹窗内完成。
              </div>
            </div>
            <Tag color="blue">{aiProtocolLabels[modelForm.protocol]}</Tag>
          </div>

          <div className="ai-model-form-grid ai-model-form-grid-compact">
            <div>
              <label className="field-label" htmlFor="ai-model-code">
                模型名
              </label>
              <Input
                id="ai-model-code"
                size="large"
                value={modelForm.code}
                onChange={(event) =>
                  setModelForm((current) => ({
                    ...current,
                    code: event.target.value,
                  }))
                }
                placeholder="例如 gpt-5.3"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="ai-model-protocol">
                协议
              </label>
              <Select
                id="ai-model-protocol"
                size="large"
                value={modelForm.protocol}
                options={[
                  {
                    value: "OPENAI_COMPATIBLE",
                    label: aiProtocolLabels.OPENAI_COMPATIBLE,
                  },
                  {
                    value: "GEMINI_COMPATIBLE",
                    label: aiProtocolLabels.GEMINI_COMPATIBLE,
                  },
                  {
                    value: "ANTHROPIC_COMPATIBLE",
                    label: aiProtocolLabels.ANTHROPIC_COMPATIBLE,
                  },
                ]}
                onChange={(value) =>
                  setModelForm((current) => ({
                    ...current,
                    protocol: value as AiProtocol,
                    routes: [],
                  }))
                }
              />
            </div>

            <div>
              <label className="field-label" htmlFor="ai-model-stream-default">
                默认 Stream
              </label>
              <Switch
                id="ai-model-stream-default"
                checked={modelForm.streamDefault}
                onChange={(checked) =>
                  setModelForm((current) => ({
                    ...current,
                    streamDefault: checked,
                  }))
                }
              />
            </div>

            <div>
              <label className="field-label" htmlFor="ai-model-reasoning">
                Reasoning
              </label>
              <Select
                id="ai-model-reasoning"
                size="large"
                value={modelForm.reasoningLevel}
                options={[
                  {
                    value: "DISABLED",
                    label: aiReasoningLabels.DISABLED,
                  },
                  {
                    value: "LOW",
                    label: aiReasoningLabels.LOW,
                  },
                  {
                    value: "MEDIUM",
                    label: aiReasoningLabels.MEDIUM,
                  },
                  {
                    value: "HIGH",
                    label: aiReasoningLabels.HIGH,
                  },
                ]}
                onChange={(value) =>
                  setModelForm((current) => ({
                    ...current,
                    reasoningLevel: value as AiReasoningLevel,
                  }))
                }
              />
            </div>

            <div>
              <label className="field-label" htmlFor="ai-model-max-tokens">
                默认 Max Tokens
              </label>
              <InputNumber
                id="ai-model-max-tokens"
                min={1}
                max={32768}
                style={{ width: "100%" }}
                value={modelForm.maxTokensDefault}
                placeholder="留空表示不设默认值"
                onChange={(value) =>
                  setModelForm((current) => ({
                    ...current,
                    maxTokensDefault:
                      typeof value === "number" ? value : null,
                  }))
                }
              />
            </div>

            <div>
              <label className="field-label" htmlFor="ai-model-temperature">
                默认 Temperature
              </label>
              <InputNumber
                id="ai-model-temperature"
                min={0}
                max={2}
                step={0.1}
                style={{ width: "100%" }}
                value={modelForm.temperatureDefault}
                placeholder="留空表示不设默认值"
                onChange={(value) =>
                  setModelForm((current) => ({
                    ...current,
                    temperatureDefault:
                      typeof value === "number" ? value : null,
                  }))
                }
              />
            </div>

            <div>
              <label className="field-label" htmlFor="ai-model-max-retries">
                最大重试次数
              </label>
              <InputNumber
                id="ai-model-max-retries"
                min={0}
                max={10}
                style={{ width: "100%" }}
                value={modelForm.maxRetries}
                onChange={(value) =>
                  setModelForm((current) => ({
                    ...current,
                    maxRetries: typeof value === "number" ? value : 1,
                  }))
                }
              />
            </div>

            <div>
              <label className="field-label" htmlFor="ai-model-allow-fallback">
                允许备用路由
              </label>
              <Switch
                id="ai-model-allow-fallback"
                checked={modelForm.allowFallback}
                onChange={(checked) =>
                  setModelForm((current) => ({
                    ...current,
                    allowFallback: checked,
                  }))
                }
              />
            </div>

            <div>
              <label className="field-label" htmlFor="ai-model-label">
                显示名称
              </label>
              <Input
                id="ai-model-label"
                size="large"
                value={modelForm.label}
                onChange={(event) =>
                  setModelForm((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
                placeholder="可选"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="ai-model-note">
                备注
              </label>
              <Input
                id="ai-model-note"
                size="large"
                value={modelForm.note}
                onChange={(event) =>
                  setModelForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder="可选"
              />
            </div>
          </div>

          <div className="ai-route-builder ai-route-builder-compact">
            <div className="ai-route-builder-toolbar">
              <div>
                <div style={{ fontWeight: 700 }}>路由链</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  第 1 条为主路由，其余按顺序回退。
                </div>
              </div>
              <Select<string>
                size="large"
                value={undefined}
                placeholder="添加路由接口"
                style={{ minWidth: 240 }}
                options={availableRouteOptions.map((endpoint) => ({
                  value: endpoint.id,
                  label: endpointLabel(endpoint.providerName, endpoint.label),
                }))}
                onChange={(value) => {
                  if (value) {
                    addRoute(value);
                  }
                }}
                disabled={!availableRouteOptions.length}
              />
            </div>

            {!modelForm.routes.length ? (
              <div className="workspace-tip">
                <Tag color="blue">提示</Tag>
                <span>当前还没有配置路由，请先添加至少一个接口。</span>
              </div>
            ) : (
              <div className="ai-route-stack ai-route-stack-compact">
                {modelForm.routes.map((route, index) => {
                  const endpoint = endpointMap[route.endpointId];

                  if (!endpoint) {
                    return null;
                  }

                  return (
                    <div
                      key={`${route.endpointId}-${index}`}
                      className="ai-route-card ai-route-card-compact"
                    >
                      <div className="ai-route-card-main">
                        <div className="ai-route-card-index">{index + 1}</div>
                        <div className="ai-route-card-content">
                          <div className="ai-route-card-top">
                            <div>
                              <div style={{ fontWeight: 700 }}>
                                {endpointLabel(
                                  endpoint.providerName,
                                  endpoint.label,
                                )}
                              </div>
                              <div className="muted" style={{ marginTop: 4 }}>
                                {routeStatusLabel(index)} · {endpoint.baseUrl}
                              </div>
                            </div>
                            <Space size={8} wrap>
                              <Tag color="blue">
                                {aiProtocolLabels[endpoint.protocol]}
                              </Tag>
                              <Tag>{endpoint.providerCode}</Tag>
                            </Space>
                          </div>

                          <div className="ai-route-card-controls ai-route-card-controls-compact">
                            <div>
                              <div className="review-toolbar-label">超时</div>
                              <InputNumber
                                min={1000}
                                max={120000}
                                step={1000}
                                value={route.timeoutMs}
                                addonAfter="ms"
                                onChange={(value) =>
                                  updateRoute(index, {
                                    timeoutMs:
                                      typeof value === "number"
                                        ? value
                                        : 15000,
                                  })
                                }
                              />
                            </div>

                            <div>
                              <div className="review-toolbar-label">启用</div>
                              <Switch
                                checked={route.enabled}
                                onChange={(checked) =>
                                  updateRoute(index, { enabled: checked })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="ai-route-card-actions ai-route-card-actions-compact">
                        <Button
                          icon={<ArrowUp size={16} />}
                          onClick={() => moveRoute(index, -1)}
                          disabled={index === 0}
                        />
                        <Button
                          icon={<ArrowDown size={16} />}
                          onClick={() => moveRoute(index, 1)}
                          disabled={index === modelForm.routes.length - 1}
                        />
                        <Button
                          danger
                          icon={<X size={16} />}
                          onClick={() => removeRoute(index)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="ai-model-form-actions">
            <Button onClick={closeModelModal}>取消</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={
                isSavingModel && savingModelId === (modelForm.modelId ?? "new")
              }
            >
              {modelForm.modelId ? "保存模型路由" : "创建模型路由"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
