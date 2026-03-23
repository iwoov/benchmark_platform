"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Alert, Button, Input, Segmented, Space, Tag } from "antd";
import {
  Activity,
  ArrowRight,
  Bot,
  DatabaseZap,
  FolderKanban,
  PlugZap,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import {
  aiProviderCatalog,
  aiProtocolLabels,
  type AiProtocol,
  type AiProviderCatalogItem,
} from "@/lib/ai/provider-catalog";

type SectionKey = "providers" | "models" | "routes" | "projects";

type CatalogModel = {
  id: string;
  code: string;
  protocol: AiProtocol;
  providers: string[];
  endpoints: Array<{
    providerId: string;
    providerName: string;
    endpointId: string;
    endpointLabel: string;
    baseUrl: string;
  }>;
};

type RouteGroup = {
  modelId: string;
  title: string;
  summary: string;
  fallbackRule: string;
  routes: Array<{
    id: string;
    role: string;
    providerName: string;
    endpointLabel: string;
    protocol: AiProtocol;
    baseUrl: string;
    upstreamModelName: string;
    condition: string;
  }>;
};

type ProjectGrant = {
  id: string;
  name: string;
  reviewerScope: string;
  defaultModel: string;
  preferredProtocol: AiProtocol;
  routeStrategy: string;
  enabledModels: string[];
  note: string;
  updatedAt: string;
};

type ProjectFilter = "全部项目" | "OpenAI 优先" | "Gemini 优先";

function createModelId(code: string) {
  return `model-${code.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

function protocolMeta(protocol: AiProtocol) {
  if (protocol === "OPENAI_COMPATIBLE") {
    return { label: aiProtocolLabels[protocol], color: "blue" as const };
  }

  return { label: aiProtocolLabels[protocol], color: "green" as const };
}

function buildModelCatalog(providers: AiProviderCatalogItem[]): CatalogModel[] {
  const models = new Map<string, CatalogModel>();

  for (const provider of providers) {
    for (const endpoint of provider.endpoints) {
      for (const model of endpoint.models) {
        const existing = models.get(model);

        if (existing) {
          existing.providers.push(provider.name);
          existing.endpoints.push({
            providerId: provider.id,
            providerName: provider.name,
            endpointId: endpoint.id,
            endpointLabel: endpoint.label,
            baseUrl: endpoint.baseUrl,
          });
          continue;
        }

        models.set(model, {
          id: createModelId(model),
          code: model,
          protocol: endpoint.protocol,
          providers: [provider.name],
          endpoints: [
            {
              providerId: provider.id,
              providerName: provider.name,
              endpointId: endpoint.id,
              endpointLabel: endpoint.label,
              baseUrl: endpoint.baseUrl,
            },
          ],
        });
      }
    }
  }

  return [...models.values()].sort((left, right) => {
    if (left.protocol !== right.protocol) {
      return left.protocol === "OPENAI_COMPATIBLE" ? -1 : 1;
    }

    return left.code.localeCompare(right.code);
  });
}

const modelCatalog = buildModelCatalog(aiProviderCatalog);

const routeGroups: RouteGroup[] = modelCatalog.map((model) => ({
  modelId: model.id,
  title: model.code,
  summary: `${aiProtocolLabels[model.protocol]} 模型，当前在 ${model.endpoints.length} 个上游入口可用。`,
  fallbackRule: "当前前端展示按 idealab -> ModelRouter 的示例顺序排列。",
  routes: model.endpoints.map((endpoint, index) => ({
    id: `${model.id}-${endpoint.endpointId}`,
    role: index === 0 ? "主路由示例" : "备用路由示例",
    providerName: endpoint.providerName,
    endpointLabel: endpoint.endpointLabel,
    protocol: model.protocol,
    baseUrl: endpoint.baseUrl,
    upstreamModelName: model.code,
    condition:
      index === 0 ? "默认优先调用" : "主链路超时、429 或上游 5xx 时切换",
  })),
}));

const projectGrants: ProjectGrant[] = [
  {
    id: "project-reasoning",
    name: "数学推理集",
    reviewerScope: "全部 REVIEWER",
    defaultModel: "gpt-5.0-pro",
    preferredProtocol: "OPENAI_COMPATIBLE",
    routeStrategy: "优先 idealab，失败后切换 ModelRouter",
    enabledModels: ["gpt-5.0-pro", "gpt-5.3"],
    note: "通用高质量审核场景，默认使用 OpenAI 兼容链路。",
    updatedAt: "2026-03-18 10:00",
  },
  {
    id: "project-coding",
    name: "代码评测集",
    reviewerScope: "REVIEWER + PROJECT_MANAGER",
    defaultModel: "gpt-5.2-codex",
    preferredProtocol: "OPENAI_COMPATIBLE",
    routeStrategy: "Codex 模型优先，通用模型作为补位",
    enabledModels: ["gpt-5.2-codex", "gpt-5.3"],
    note: "面向代码生成、修复和解释类题目。",
    updatedAt: "2026-03-18 10:05",
  },
  {
    id: "project-dialogue",
    name: "多轮对话集",
    reviewerScope: "全部 REVIEWER",
    defaultModel: "gemini-3.1-pro-preview",
    preferredProtocol: "GEMINI_COMPATIBLE",
    routeStrategy: "优先走 Gemini Pro，必要时切同协议备用入口",
    enabledModels: ["gemini-3.1-pro-preview", "gemini-3.0-pro-preview"],
    note: "上下文长、轮次多时优先使用 Gemini Pro 系列。",
    updatedAt: "2026-03-18 10:10",
  },
  {
    id: "project-quick-review",
    name: "轻量巡检集",
    reviewerScope: "指定 REVIEWER 组",
    defaultModel: "gemini-3.1-flash-lite-preview",
    preferredProtocol: "GEMINI_COMPATIBLE",
    routeStrategy: "轻量模型优先，强调吞吐而非最高质量",
    enabledModels: [
      "gemini-3.1-flash-lite-preview",
      "gemini-3.1-pro-preview",
    ],
    note: "适合批量初筛和快速检查。",
    updatedAt: "2026-03-18 10:15",
  },
];

function MetaField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="ai-field-card">
      <div className="ai-field-label">{label}</div>
      <div className="ai-field-value">{value}</div>
    </div>
  );
}

export function AiSettingsConsole() {
  const [activeSection, setActiveSection] = useState<SectionKey>("providers");
  const [selectedProviderId, setSelectedProviderId] = useState(
    aiProviderCatalog[0].id,
  );
  const [selectedModelId, setSelectedModelId] = useState(modelCatalog[0].id);
  const [projectFilter, setProjectFilter] =
    useState<ProjectFilter>("全部项目");

  const selectedProvider =
    aiProviderCatalog.find((provider) => provider.id === selectedProviderId) ??
    aiProviderCatalog[0];
  const selectedModel =
    modelCatalog.find((model) => model.id === selectedModelId) ?? modelCatalog[0];
  const selectedRouteGroup =
    routeGroups.find((group) => group.modelId === selectedModel.id) ??
    routeGroups[0];

  const visibleProjects =
    projectFilter === "全部项目"
      ? projectGrants
      : projectGrants.filter((project) =>
          projectFilter === "OpenAI 优先"
            ? project.preferredProtocol === "OPENAI_COMPATIBLE"
            : project.preferredProtocol === "GEMINI_COMPATIBLE",
        );

  const endpointCount = aiProviderCatalog.reduce(
    (count, provider) => count + provider.endpoints.length,
    0,
  );
  const totalRouteSlots = routeGroups.reduce(
    (count, group) => count + group.routes.length,
    0,
  );
  const selectedProviderModelCount = new Set(
    selectedProvider.endpoints.flatMap((endpoint) => endpoint.models),
  ).size;

  return (
    <div className="ai-control-page">
      <section className="content-surface ai-command-surface">
        <div className="section-head">
          <div>
            <div className="ai-command-kicker">AI Control Plane</div>
            <h2 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>
              AI 模块设置
            </h2>
            <p
              className="muted"
              style={{ margin: "12px 0 0", lineHeight: 1.75 }}
            >
              当前前端展示已切换到真实提供商目录，基于 2026 年 3 月 18 日登记的
              idealab 与 ModelRouter 接口清单生成。URL、协议和可用模型统一来自
              单独配置文件，不再写死在页面组件里。
            </p>
          </div>

          <Space wrap size={10}>
            <Tag color="blue">真实目录</Tag>
            <Button icon={<PlugZap size={16} />} disabled>
              新增供应商账号
            </Button>
            <Button
              type="primary"
              icon={<SlidersHorizontal size={16} />}
              disabled
            >
              发布配置
            </Button>
          </Space>
        </div>

        <div className="ai-stat-grid">
          <div className="ai-stat-card">
            <div className="ai-stat-icon">
              <PlugZap size={20} />
            </div>
            <div className="ai-stat-value">{aiProviderCatalog.length}</div>
            <div className="ai-stat-label">提供商</div>
            <div className="muted ai-stat-hint">idealab / ModelRouter</div>
          </div>

          <div className="ai-stat-card">
            <div className="ai-stat-icon">
              <DatabaseZap size={20} />
            </div>
            <div className="ai-stat-value">{endpointCount}</div>
            <div className="ai-stat-label">接口入口</div>
            <div className="muted ai-stat-hint">OpenAI 与 Gemini 共 4 个 URL</div>
          </div>

          <div className="ai-stat-card">
            <div className="ai-stat-icon">
              <Bot size={20} />
            </div>
            <div className="ai-stat-value">{modelCatalog.length}</div>
            <div className="ai-stat-label">唯一模型</div>
            <div className="muted ai-stat-hint">按模型名去重后生成</div>
          </div>

          <div className="ai-stat-card">
            <div className="ai-stat-icon">
              <Activity size={20} />
            </div>
            <div className="ai-stat-value">{totalRouteSlots}</div>
            <div className="ai-stat-label">路由槽位</div>
            <div className="muted ai-stat-hint">
              每个模型可在两个提供商间切换
            </div>
          </div>
        </div>

        <div className="ai-command-grid">
          <div className="ai-command-panel">
            <div className="ai-panel-title-row">
              <div>
                <div className="ai-panel-title">当前目录来源</div>
                <div className="muted ai-panel-copy">
                  页面中的 URL 和可用模型不再散落在组件内，而是统一从
                  <code style={{ marginLeft: 6 }}>lib/ai/provider-catalog.ts</code>
                  读取。
                </div>
              </div>
              <Tag color="processing">Config Driven</Tag>
            </div>

            <div className="ai-mini-matrix">
              <div className="ai-mini-entry">
                <span className="ai-mini-key">当前提供商</span>
                <strong>idealab / ModelRouter</strong>
              </div>
              <div className="ai-mini-entry">
                <span className="ai-mini-key">协议范围</span>
                <strong>OpenAI 兼容 + Gemini 协议</strong>
              </div>
              <div className="ai-mini-entry">
                <span className="ai-mini-key">模型展示</span>
                <strong>按唯一模型名自动去重</strong>
              </div>
            </div>
          </div>

          <div className="ai-command-panel">
            <div className="ai-panel-title-row">
              <div>
                <div className="ai-panel-title">录入说明</div>
                <div className="muted ai-panel-copy">
                  当前为管理员侧静态展示骨架，后续可直接替换为数据库返回数据。
                </div>
              </div>
              <FolderKanban size={18} color="#1456d9" />
            </div>

            <div className="ai-chip-row">
              <Tag color="blue">idealab</Tag>
              <Tag color="blue">ModelRouter</Tag>
              <Tag color="green">Gemini</Tag>
              <Tag color="geekblue">OpenAI</Tag>
            </div>

            <Alert
              type="info"
              showIcon
              message="你提供的 OpenAI 模型列表里 gpt-5.3 出现了重复项，当前展示按唯一值去重。"
              style={{ marginTop: 16 }}
            />
          </div>
        </div>
      </section>

      <section className="content-surface ai-section-surface">
        <div className="section-head ai-section-head">
          <div>
            <h3 style={{ margin: 0, fontSize: 22, lineHeight: 1.1 }}>
              配置视图
            </h3>
            <p
              className="muted"
              style={{ margin: "10px 0 0", lineHeight: 1.7 }}
            >
              供应商、接口 URL、模型目录和示例路由均由同一份配置数据推导。
            </p>
          </div>

          <Segmented
            value={activeSection}
            onChange={(value) => setActiveSection(value as SectionKey)}
            options={[
              { label: "供应商账号", value: "providers" },
              { label: "逻辑模型", value: "models" },
              { label: "模型路由", value: "routes" },
              { label: "项目授权", value: "projects" },
            ]}
          />
        </div>

        {activeSection === "providers" ? (
          <div className="ai-split-grid">
            <div className="ai-list-column">
              {aiProviderCatalog.map((provider) => {
                const modelCount = new Set(
                  provider.endpoints.flatMap((endpoint) => endpoint.models),
                ).size;

                return (
                  <button
                    key={provider.id}
                    type="button"
                    className={`ai-select-card ${
                      provider.id === selectedProvider.id ? "active" : ""
                    }`}
                    onClick={() => setSelectedProviderId(provider.id)}
                  >
                    <div className="ai-card-topline">
                      <div>
                        <div className="ai-select-title">{provider.name}</div>
                        <div className="muted ai-select-copy">
                          {provider.vendorType}
                        </div>
                      </div>
                      <Tag color="processing">{provider.endpoints.length} 个接口</Tag>
                    </div>

                    <div className="ai-chip-row">
                      {provider.endpoints.map((endpoint) => (
                        <Tag
                          key={endpoint.id}
                          color={protocolMeta(endpoint.protocol).color}
                        >
                          {protocolMeta(endpoint.protocol).label}
                        </Tag>
                      ))}
                    </div>

                    <div className="ai-inline-health">
                      <span className="muted">唯一模型数</span>
                      <strong>{modelCount}</strong>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="ai-detail-column">
              <div className="ai-detail-header">
                <div>
                  <div className="ai-panel-title">{selectedProvider.name}</div>
                  <div className="muted ai-panel-copy">
                    {selectedProvider.note}
                  </div>
                </div>
                <Space wrap size={8}>
                  <Tag>{selectedProvider.vendorType}</Tag>
                  <Tag color="processing">
                    {selectedProvider.endpoints.length} 个入口
                  </Tag>
                </Space>
              </div>

              <div className="ai-detail-grid">
                <MetaField label="提供商 ID" value={selectedProvider.id} />
                <MetaField label="接口数量" value={selectedProvider.endpoints.length} />
                <MetaField label="唯一模型数" value={selectedProviderModelCount} />
                <MetaField
                  label="协议范围"
                  value={selectedProvider.endpoints
                    .map((endpoint) => aiProtocolLabels[endpoint.protocol])
                    .join(" / ")}
                />
              </div>

              <div className="ai-detail-grid">
                {selectedProvider.endpoints.map((endpoint) => (
                  <div key={endpoint.id} className="ai-field-card">
                    <div className="ai-card-topline">
                      <div className="ai-select-title">{endpoint.label}</div>
                      <Tag color={protocolMeta(endpoint.protocol).color}>
                        {protocolMeta(endpoint.protocol).label}
                      </Tag>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <label className="field-label" htmlFor={endpoint.id}>
                        URL
                      </label>
                      <Input
                        id={endpoint.id}
                        value={endpoint.baseUrl}
                        readOnly
                        prefix={<PlugZap size={16} />}
                      />
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div className="ai-field-label">可用模型</div>
                      <div className="ai-chip-row">
                        {endpoint.models.map((model) => (
                          <Tag key={`${endpoint.id}-${model}`}>{model}</Tag>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === "models" ? (
          <div className="ai-split-grid">
            <div className="ai-list-column">
              {modelCatalog.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className={`ai-select-card ${
                    model.id === selectedModel.id ? "active" : ""
                  }`}
                  onClick={() => setSelectedModelId(model.id)}
                >
                  <div className="ai-card-topline">
                    <div>
                      <div className="ai-select-title">{model.code}</div>
                      <div className="muted ai-select-copy">
                        {aiProtocolLabels[model.protocol]}
                      </div>
                    </div>
                    <Tag color={protocolMeta(model.protocol).color}>
                      {model.providers.length} 个上游
                    </Tag>
                  </div>

                  <div className="ai-chip-row">
                    {model.providers.map((provider) => (
                      <Tag key={`${model.id}-${provider}`}>{provider}</Tag>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            <div className="ai-detail-column">
              <div className="ai-detail-header">
                <div>
                  <div className="ai-panel-title">{selectedModel.code}</div>
                  <div className="muted ai-panel-copy">
                    当前在 {selectedModel.endpoints.length} 个上游入口可用，支持按同协议做主备切换。
                  </div>
                </div>
                <Tag color={protocolMeta(selectedModel.protocol).color}>
                  {protocolMeta(selectedModel.protocol).label}
                </Tag>
              </div>

              <div className="ai-detail-grid">
                <MetaField label="模型代码" value={selectedModel.code} />
                <MetaField
                  label="协议类型"
                  value={aiProtocolLabels[selectedModel.protocol]}
                />
                <MetaField
                  label="支持提供商"
                  value={selectedModel.providers.join(" / ")}
                />
                <MetaField
                  label="可用入口"
                  value={selectedModel.endpoints
                    .map((endpoint) => `${endpoint.providerName} · ${endpoint.endpointLabel}`)
                    .join(" / ")}
                />
              </div>

              <div className="ai-detail-grid">
                {selectedModel.endpoints.map((endpoint) => (
                  <div key={endpoint.endpointId} className="ai-field-card">
                    <div className="ai-card-topline">
                      <div className="ai-select-title">{endpoint.providerName}</div>
                      <Tag color={protocolMeta(selectedModel.protocol).color}>
                        {endpoint.endpointLabel}
                      </Tag>
                    </div>
                    <div className="ai-panel-copy">
                      <code>{endpoint.baseUrl}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === "routes" ? (
          <div className="ai-route-layout">
            <div className="ai-route-sidebar">
              {modelCatalog.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className={`ai-select-card ${
                    model.id === selectedModel.id ? "active" : ""
                  }`}
                  onClick={() => setSelectedModelId(model.id)}
                >
                  <div className="ai-card-topline">
                    <div>
                      <div className="ai-select-title">{model.code}</div>
                      <div className="muted ai-select-copy">
                        {aiProtocolLabels[model.protocol]}
                      </div>
                    </div>
                    <Tag>{model.endpoints.length} 条</Tag>
                  </div>
                </button>
              ))}
            </div>

            <div className="ai-route-board">
              <div className="ai-detail-header">
                <div>
                  <div className="ai-panel-title">{selectedRouteGroup.title}</div>
                  <div className="muted ai-panel-copy">
                    {selectedRouteGroup.summary}
                  </div>
                </div>
                <Tag color="processing">{selectedRouteGroup.fallbackRule}</Tag>
              </div>

              <div className="ai-route-flow">
                {selectedRouteGroup.routes.map((route, index) => (
                  <div key={route.id} className="ai-route-step">
                    <div className="ai-route-index">{index + 1}</div>

                    <div className="ai-route-main">
                      <div className="ai-card-topline">
                        <div>
                          <div className="ai-select-title">{route.role}</div>
                          <div className="muted ai-select-copy">
                            {route.providerName}
                          </div>
                        </div>
                        <Tag color={protocolMeta(route.protocol).color}>
                          {route.endpointLabel}
                        </Tag>
                      </div>

                      <div className="ai-route-details">
                        <div>
                          <span className="ai-route-label">上游模型</span>
                          <strong>{route.upstreamModelName}</strong>
                        </div>
                        <div>
                          <span className="ai-route-label">接口 URL</span>
                          <strong>{route.baseUrl}</strong>
                        </div>
                        <div>
                          <span className="ai-route-label">切换条件</span>
                          <strong>{route.condition}</strong>
                        </div>
                      </div>
                    </div>

                    {index < selectedRouteGroup.routes.length - 1 ? (
                      <ArrowRight className="ai-route-arrow" size={18} />
                    ) : (
                      <ShieldCheck className="ai-route-arrow" size={18} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === "projects" ? (
          <div className="ai-project-section">
            <div className="ai-project-toolbar">
              <Space wrap size={8}>
                <Tag color="blue">授权示例</Tag>
                <Tag>当前仍为前端 mock，后续替换为项目实际配置</Tag>
              </Space>

              <Segmented
                value={projectFilter}
                onChange={(value) => setProjectFilter(value as ProjectFilter)}
                options={["全部项目", "OpenAI 优先", "Gemini 优先"]}
              />
            </div>

            <div className="ai-project-grid">
              {visibleProjects.map((project) => (
                <div key={project.id} className="ai-project-card">
                  <div className="ai-card-topline">
                    <div>
                      <div className="ai-select-title">{project.name}</div>
                      <div className="muted ai-select-copy">
                        更新于 {project.updatedAt}
                      </div>
                    </div>
                    <Tag color={protocolMeta(project.preferredProtocol).color}>
                      {aiProtocolLabels[project.preferredProtocol]}
                    </Tag>
                  </div>

                  <div className="ai-mini-stack">
                    <div className="ai-project-line">
                      <span className="ai-field-label">默认模型</span>
                      <strong>{project.defaultModel}</strong>
                    </div>
                    <div className="ai-project-line">
                      <span className="ai-field-label">授权范围</span>
                      <strong>{project.reviewerScope}</strong>
                    </div>
                    <div className="ai-project-line">
                      <span className="ai-field-label">路由策略</span>
                      <strong>{project.routeStrategy}</strong>
                    </div>
                  </div>

                  <div>
                    <div className="ai-field-label" style={{ marginBottom: 8 }}>
                      可用模型
                    </div>
                    <div className="ai-chip-row">
                      {project.enabledModels.map((modelCode) => (
                        <Tag key={`${project.id}-${modelCode}`}>{modelCode}</Tag>
                      ))}
                    </div>
                  </div>

                  <Alert type="info" showIcon message={project.note} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="content-surface ai-note-surface">
        <div className="section-head">
          <div>
            <h3 style={{ margin: 0, fontSize: 22, lineHeight: 1.1 }}>
              落地说明
            </h3>
            <p
              className="muted"
              style={{ margin: "10px 0 0", lineHeight: 1.7 }}
            >
              这一版已经把真实提供商目录抽到独立文件，后续接数据库时可以保留页面结构，
              只替换数据来源。
            </p>
          </div>
        </div>

        <div className="ai-note-grid">
          <div className="ai-note-card">
            <div className="ai-note-icon">
              <PlugZap size={18} />
            </div>
            <div>
              <div className="ai-select-title">配置文件</div>
              <div className="muted ai-panel-copy">
                <code>lib/ai/provider-catalog.ts</code> 统一存放 URL 和可用模型。
              </div>
            </div>
          </div>

          <div className="ai-note-card">
            <div className="ai-note-icon">
              <Bot size={18} />
            </div>
            <div>
              <div className="ai-select-title">模型目录</div>
              <div className="muted ai-panel-copy">
                页面按唯一模型名自动生成逻辑模型视图，避免手工重复维护。
              </div>
            </div>
          </div>

          <div className="ai-note-card">
            <div className="ai-note-icon">
              <Activity size={18} />
            </div>
            <div>
              <div className="ai-select-title">路由示例</div>
              <div className="muted ai-panel-copy">
                当前前端按 idealab 主、ModelRouter 备的顺序展示，可继续做成管理员可编辑。
              </div>
            </div>
          </div>

          <div className="ai-note-card">
            <div className="ai-note-icon">
              <ShieldCheck size={18} />
            </div>
            <div>
              <div className="ai-select-title">配套文档</div>
              <div className="muted ai-panel-copy">
                当前提供商清单已单独写入 <code>docs/ai_provider_inventory.md</code>。
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
