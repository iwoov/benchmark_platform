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
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteAiModelAction,
  saveAiModelAction,
  updateAiProviderConfigAction,
} from "@/app/actions/ai-settings";
import { aiProtocolLabels, type AiProtocol } from "@/lib/ai/provider-catalog";
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
  label: string;
  note: string;
  routes: ModelRouteFormState[];
};

function createModelFormState(model?: AiSettingsModel): ModelFormState {
  return {
    modelId: model?.id,
    code: model?.code ?? "",
    protocol: model?.protocol ?? "OPENAI_COMPATIBLE",
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
  const [providerPendingId, setProviderPendingId] = useState<string | null>(
    null,
  );
  const [savingModelId, setSavingModelId] = useState<string | null>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [modelModalOpen, setModelModalOpen] = useState(false);
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

  function handleProviderSubmit(
    provider: AiSettingsProvider,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setProviderPendingId(provider.id);
    startSavingProvider(async () => {
      const result = await updateAiProviderConfigAction({
        providerId: provider.id,
        name: provider.name,
        note: provider.note ?? "",
        apiKey: String(formData.get("apiKey") ?? ""),
        endpoints: provider.endpoints.map((endpoint) => ({
          id: endpoint.id,
          baseUrl: String(formData.get(`endpoint-${endpoint.id}`) ?? ""),
        })),
      });

      notifyResult(result);
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
              AI 模块设置
            </h2>
            <p
              className="muted"
              style={{ margin: "10px 0 0", lineHeight: 1.7 }}
            >
              维护提供商 API Key、接口地址，以及模型调用时的主备路由链。
            </p>
          </div>
        </div>

        {!databaseEnabled ? (
          <Empty description="当前未配置数据库，无法保存 AI 配置。" />
        ) : (
          <div className="ai-provider-stack">
            {providers.map((provider) => (
              <form
                key={provider.id}
                className="ai-provider-card"
                onSubmit={(event) => handleProviderSubmit(provider, event)}
              >
                <div className="ai-provider-card-head">
                  <div>
                    <div className="ai-provider-title-row">
                      <h3 style={{ margin: 0, fontSize: 18 }}>
                        {provider.name}
                      </h3>
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

                  <Tag
                    color={provider.apiKeyConfigured ? "success" : "default"}
                  >
                    {provider.apiKeyConfigured
                      ? "已保存 API Key"
                      : "未填写 API Key"}
                  </Tag>
                </div>

                <div className="ai-provider-form-grid">
                  <div className="ai-provider-form-full">
                    <label
                      className="field-label"
                      htmlFor={`api-key-${provider.id}`}
                    >
                      API Key
                    </label>
                    <Input.Password
                      id={`api-key-${provider.id}`}
                      name="apiKey"
                      size="large"
                      prefix={<KeyRound size={16} />}
                      placeholder={
                        provider.apiKeyConfigured
                          ? "已保存，如需更换请输入新的 API Key"
                          : "请输入提供商 API Key"
                      }
                    />
                  </div>

                  {provider.endpoints.map((endpoint) => (
                    <div key={endpoint.id}>
                      <div className="ai-provider-endpoint-head">
                        <label
                          className="field-label"
                          htmlFor={`endpoint-${endpoint.id}`}
                        >
                          {endpoint.label}
                        </label>
                        <Space size={8}>
                          <Tag color="blue">
                            {aiProtocolLabels[endpoint.protocol]}
                          </Tag>
                          <Tag>{endpoint.modelCount} 个模型</Tag>
                        </Space>
                      </div>
                      <Input
                        id={`endpoint-${endpoint.id}`}
                        name={`endpoint-${endpoint.id}`}
                        size="large"
                        defaultValue={endpoint.baseUrl}
                      />
                    </div>
                  ))}
                </div>

                <div className="ai-provider-actions">
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<Save size={16} />}
                    loading={
                      isSavingProvider && providerPendingId === provider.id
                    }
                  >
                    保存提供商配置
                  </Button>
                </div>
              </form>
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
            <p
              className="muted"
              style={{ margin: "10px 0 0", lineHeight: 1.7 }}
            >
              每个模型配置一条有顺序的路由链。系统调用时会先走主路由，不可用时按顺序切备用。
            </p>
          </div>
          <Button
            type="primary"
            icon={<Plus size={16} />}
            onClick={openCreateModelModal}
            disabled={!databaseEnabled || !endpointOptions.length}
          >
            添加模型
          </Button>
        </div>

        {!databaseEnabled ? (
          <Empty description="当前未配置数据库，无法维护模型路由。" />
        ) : !models.length ? (
          <Empty description="当前还没有模型，点击右上角开始添加。" />
        ) : (
          <div className="table-surface ai-model-table">
            <div className="ai-model-table-head">
              <div>模型名</div>
              <div>协议</div>
              <div>路由链</div>
              <div>备注</div>
              <div>操作</div>
            </div>

            {models.map((model) => (
              <div key={model.id} className="ai-model-table-row">
                <div>
                  <div style={{ fontWeight: 700 }}>{model.code}</div>
                  {model.label ? (
                    <div className="muted" style={{ marginTop: 4 }}>
                      {model.label}
                    </div>
                  ) : null}
                </div>

                <div>
                  <Tag color="blue">{aiProtocolLabels[model.protocol]}</Tag>
                </div>

                <div className="ai-model-route-summary">
                  {model.routes.map((route, index) => (
                    <div
                      key={`${model.id}-${route.id}`}
                      className={`ai-model-route-chip ${
                        route.enabled ? "" : "disabled"
                      }`}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {index + 1}.{" "}
                        {endpointLabel(route.providerName, route.label)}
                      </div>
                      <div className="muted">
                        {routeStatusLabel(index)} · {route.timeoutMs}ms
                        {route.enabled ? "" : " · 已停用"}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="muted">{model.note || "-"}</div>

                <div className="ai-model-row-actions">
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
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={modelModalOpen}
        onCancel={closeModelModal}
        footer={null}
        destroyOnHidden
        title={modelForm.modelId ? "编辑模型路由" : "添加模型路由"}
        width={860}
      >
        <form className="ai-model-form" onSubmit={handleModelSubmit}>
          <div className="ai-model-form-grid">
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
                placeholder="可选，用于后台展示"
              />
            </div>

            <div className="ai-model-form-full">
              <label className="field-label" htmlFor="ai-model-note">
                备注
              </label>
              <Input.TextArea
                id="ai-model-note"
                value={modelForm.note}
                onChange={(event) =>
                  setModelForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder="可选，例如调用策略说明"
                autoSize={{ minRows: 3, maxRows: 5 }}
              />
            </div>
          </div>

          <div className="ai-route-builder">
            <div className="ai-route-builder-head">
              <div>
                <div style={{ fontWeight: 700 }}>路由链</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  从上到下依次尝试。第 1 条为主路由，其余为备用。
                </div>
              </div>

              <Select<string>
                size="large"
                value={undefined}
                placeholder="添加路由接口"
                style={{ minWidth: 280 }}
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
              <div className="ai-route-stack">
                {modelForm.routes.map((route, index) => {
                  const endpoint = endpointMap[route.endpointId];

                  if (!endpoint) {
                    return null;
                  }

                  return (
                    <div
                      key={`${route.endpointId}-${index}`}
                      className="ai-route-card"
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
                                {routeStatusLabel(index)}
                              </div>
                            </div>
                            <Space size={8}>
                              <Tag color="blue">
                                {aiProtocolLabels[endpoint.protocol]}
                              </Tag>
                              <Tag>{endpoint.providerCode}</Tag>
                            </Space>
                          </div>

                          <div className="muted" style={{ marginTop: 8 }}>
                            {endpoint.baseUrl}
                          </div>

                          <div className="ai-route-card-controls">
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
                                      typeof value === "number" ? value : 15000,
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

                      <div className="ai-route-card-actions">
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
