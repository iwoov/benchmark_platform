"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Button,
  Checkbox,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Space,
  Tag,
} from "antd";
import { KeyRound, PencilLine, Plus, Save, Trash2 } from "lucide-react";
import {
  deleteAiModelAction,
  saveAiModelAction,
  updateAiProviderConfigAction,
} from "@/app/actions/ai-settings";
import { aiProtocolLabels } from "@/lib/ai/provider-catalog";
import type {
  AiSettingsEndpointOption,
  AiSettingsModel,
  AiSettingsProvider,
} from "@/lib/ai/types";

type ModelFormState = {
  modelId?: string;
  code: string;
  label: string;
  note: string;
  endpointIds: string[];
};

function createModelFormState(model?: AiSettingsModel): ModelFormState {
  return {
    modelId: model?.id,
    code: model?.code ?? "",
    label: model?.label ?? "",
    note: model?.note ?? "",
    endpointIds: model?.endpointIds ?? [],
  };
}

function endpointLabel(providerName: string, label: string) {
  return `${providerName} / ${label}`;
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

  const endpointGroups = useMemo(
    () =>
      providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        code: provider.code,
        endpoints: provider.endpoints,
      })),
    [providers],
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

  function toggleEndpoint(endpointId: string, checked: boolean) {
    setModelForm((current) => ({
      ...current,
      endpointIds: checked
        ? [...new Set([...current.endpointIds, endpointId])]
        : current.endpointIds.filter((item) => item !== endpointId),
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
        label: modelForm.label,
        note: modelForm.note,
        endpointIds: modelForm.endpointIds,
      });

      const success = notifyResult(result);

      if (success) {
        setModelModalOpen(false);
        setModelForm(createModelFormState());
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
              维护提供商 API Key、接口地址，以及系统可调用的模型清单。
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
              可用模型
            </h2>
            <p
              className="muted"
              style={{ margin: "10px 0 0", lineHeight: 1.7 }}
            >
              模型从后台维护，不再写死在代码里。新增模型时可以指定支持哪些接口。
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
          <Empty description="当前未配置数据库，无法维护模型清单。" />
        ) : !models.length ? (
          <Empty description="当前还没有可用模型，点击右上角开始添加。" />
        ) : (
          <div className="table-surface ai-model-table">
            <div className="ai-model-table-head">
              <div>模型名</div>
              <div>显示名称</div>
              <div>支持接口</div>
              <div>备注</div>
              <div>操作</div>
            </div>

            {models.map((model) => (
              <div key={model.id} className="ai-model-table-row">
                <div style={{ fontWeight: 700 }}>{model.code}</div>
                <div>{model.label || "-"}</div>
                <div className="ai-model-endpoints">
                  {model.endpoints.map((endpoint) => (
                    <Tag key={`${model.id}-${endpoint.id}`}>
                      {endpointLabel(endpoint.providerName, endpoint.label)}
                    </Tag>
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
        onCancel={() => {
          setModelModalOpen(false);
          setModelForm(createModelFormState());
        }}
        footer={null}
        destroyOnHidden
        title={modelForm.modelId ? "编辑模型" : "添加模型"}
        width={760}
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
                placeholder="例如 gpt-5.3 或 gemini-3.1-pro-preview"
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
                placeholder="可选，例如用途、限制或默认路由说明"
                autoSize={{ minRows: 3, maxRows: 5 }}
              />
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div className="field-label" style={{ marginBottom: 12 }}>
              支持接口
            </div>

            {!endpointOptions.length ? (
              <Empty description="当前没有可选接口，请先配置提供商。" />
            ) : (
              <div className="ai-endpoint-group-stack">
                {endpointGroups.map((provider) => (
                  <div key={provider.id} className="ai-endpoint-group">
                    <div className="ai-endpoint-group-head">
                      <div style={{ fontWeight: 700 }}>{provider.name}</div>
                      <Tag>{provider.code}</Tag>
                    </div>

                    <div className="ai-endpoint-option-grid">
                      {provider.endpoints.map((endpoint) => {
                        const checked = modelForm.endpointIds.includes(
                          endpoint.id,
                        );

                        return (
                          <label
                            key={endpoint.id}
                            className={`ai-endpoint-option ${
                              checked ? "active" : ""
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onChange={(event) =>
                                toggleEndpoint(
                                  endpoint.id,
                                  event.target.checked,
                                )
                              }
                            />
                            <div>
                              <div style={{ fontWeight: 600 }}>
                                {endpoint.label}
                              </div>
                              <div className="muted" style={{ marginTop: 4 }}>
                                {aiProtocolLabels[endpoint.protocol]}
                              </div>
                              <div className="muted" style={{ marginTop: 6 }}>
                                {endpoint.baseUrl}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ai-model-form-actions">
            <Button
              onClick={() => {
                setModelModalOpen(false);
                setModelForm(createModelFormState());
              }}
            >
              取消
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={
                isSavingModel && savingModelId === (modelForm.modelId ?? "new")
              }
            >
              {modelForm.modelId ? "保存模型" : "创建模型"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
