"use client";

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
  aiProtocolLabels,
  aiReasoningLabels,
  type AiProtocol,
  type AiReasoningLevel,
} from "@/lib/ai/provider-catalog";
import type {
  AiSettingsEndpointOption,
  AiSettingsModel,
  AiSettingsProvider,
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

export function AiSettingsConsole({
  databaseEnabled,
  providers,
  endpointOptions,
  models,
}: {
  databaseEnabled: boolean;
  providers: AiSettingsProvider[];
  endpointOptions: AiSettingsEndpointOption[];
  models: AiSettingsModel[];
}) {
  const router = useRouter();
  const { notification } = App.useApp();
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [providerPendingId, setProviderPendingId] = useState<string | null>(
    null,
  );
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
    setProviderForm(createProviderFormState(provider));
    setProviderModalOpen(true);
  }

  function closeProviderModal() {
    setProviderModalOpen(false);
    setProviderForm(null);
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

  return (
    <div className="ai-settings-page">
      <section className="content-surface">
        <div className="section-head ai-settings-section-head">
          <div>
            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
              提供商配置
            </h2>
            <p className="muted" style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
              这里只看接入状态、接口地址和模型覆盖情况，修改统一走弹窗。
            </p>
          </div>
        </div>

        {!databaseEnabled ? (
          <Empty description="当前未配置数据库，无法保存 AI 配置。" />
        ) : (
          <div className="ai-provider-overview-grid">
            {providers.map((provider) => (
              <article key={provider.id} className="ai-provider-overview-card">
                <div className="ai-provider-overview-head">
                  <div>
                    <div className="ai-provider-overview-title">
                      <h3 style={{ margin: 0, fontSize: 18 }}>{provider.name}</h3>
                      <Tag>{provider.code}</Tag>
                    </div>
                    {provider.note ? (
                      <p
                        className="muted"
                        style={{ margin: "8px 0 0", lineHeight: 1.7 }}
                      >
                        {provider.note}
                      </p>
                    ) : null}
                  </div>
                  <Tag color={provider.apiKeyConfigured ? "success" : "default"}>
                    {provider.apiKeyConfigured ? "已配置" : "未配置"}
                  </Tag>
                </div>

                <div className="ai-provider-overview-meta">
                  <div className="ai-provider-overview-metric">
                    <div className="ai-provider-overview-metric-label">接口数量</div>
                    <div className="ai-provider-overview-metric-value">
                      {provider.endpoints.length}
                    </div>
                  </div>
                  <div className="ai-provider-overview-metric">
                    <div className="ai-provider-overview-metric-label">覆盖模型</div>
                    <div className="ai-provider-overview-metric-value">
                      {provider.endpoints.reduce(
                        (total, endpoint) => total + endpoint.modelCount,
                        0,
                      )}
                    </div>
                  </div>
                </div>

                <div className="ai-provider-endpoint-list">
                  {provider.endpoints.map((endpoint) => (
                    <div key={endpoint.id} className="ai-provider-endpoint-item">
                      <div>
                        <div style={{ fontWeight: 600 }}>{endpoint.label}</div>
                        <div className="muted" style={{ marginTop: 4 }}>
                          {endpoint.baseUrl}
                        </div>
                      </div>
                      <Space size={[8, 8]} wrap>
                        <Tag color="blue">
                          {aiProtocolLabels[endpoint.protocol]}
                        </Tag>
                        <Tag>{endpoint.modelCount} 个模型</Tag>
                      </Space>
                    </div>
                  ))}
                </div>

                <div className="ai-provider-overview-actions">
                  <Button
                    icon={<PencilLine size={16} />}
                    onClick={() => openProviderModal(provider)}
                  >
                    编辑提供商
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="content-surface">
        <div className="section-head ai-settings-section-head">
          <div>
            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
              模型路由
            </h2>
            <p className="muted" style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
              每个模型只在列表里展示协议、主路由和备用数量，详细调整放进弹窗。
            </p>
          </div>
          <Button
            type="primary"
            icon={<Plus size={16} />}
            onClick={openCreateModelModal}
            disabled={!databaseEnabled || !endpointOptions.length}
          >
            新建模型
          </Button>
        </div>

        {!databaseEnabled ? (
          <Empty description="当前未配置数据库，无法维护模型路由。" />
        ) : !models.length ? (
          <Empty description="当前还没有模型，点击右上角开始添加。" />
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

      <Modal
        open={providerModalOpen}
        onCancel={closeProviderModal}
        footer={null}
        destroyOnHidden
        width={760}
        title={providerForm ? `编辑提供商 · ${providerForm.name}` : "编辑提供商"}
      >
        {providerForm ? (
          <form className="ai-modal-form" onSubmit={handleProviderSubmit}>
            <div className="ai-modal-panel">
              <div className="ai-modal-panel-head">
                <div>
                  <div style={{ fontWeight: 700 }}>基础配置</div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    API Key 和接口地址修改后会立即影响模型路由调用。
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

            <div className="ai-modal-panel">
              <div className="ai-modal-panel-head">
                <div style={{ fontWeight: 700 }}>接口地址</div>
                <Tag color="blue">按协议区分</Tag>
              </div>

              <div className="ai-provider-endpoint-edit-list">
                {providerForm.endpoints.map((endpoint) => (
                  <div key={endpoint.id} className="ai-provider-endpoint-edit-item">
                    <div className="ai-provider-endpoint-edit-head">
                      <div>
                        <div style={{ fontWeight: 600 }}>{endpoint.label}</div>
                        <div className="muted" style={{ marginTop: 4 }}>
                          已绑定 {endpoint.modelCount} 个模型
                        </div>
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

            <div className="ai-model-form-actions">
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
                保存提供商配置
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
              {modelForm.modelId ? "保存模型路由" : "创建模型"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
