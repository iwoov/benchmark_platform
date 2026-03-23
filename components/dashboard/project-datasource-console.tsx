"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Empty, Input, Space, Tag } from "antd";
import { FileUp, Table2 } from "lucide-react";
import {
  importProjectDataAction,
  type ImportProjectDataFormState,
} from "@/app/actions/datasources";
import {
  getDataSourceStatusColor,
  getDataSourceStatusLabel,
  getDataSourceTypeColor,
  getDataSourceTypeLabel,
} from "@/lib/datasources/display";

type ProjectOption = {
  id: string;
  name: string;
  code: string;
};

type DataSourceItem = {
  id: string;
  name: string;
  type: "DINGTALK_BITABLE" | "JSON_UPLOAD" | "EXCEL_UPLOAD";
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  questionCount: number;
  project: {
    id: string;
    name: string;
    code: string;
  };
  originalFileName?: string | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: "SUCCESS" | "FAILED" | null;
};

const initialState: ImportProjectDataFormState = {};

export function ProjectDatasourceConsole({
  title,
  description,
  projects,
  datasources,
}: {
  title: string;
  description: string;
  projects: ProjectOption[];
  datasources: DataSourceItem[];
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    importProjectDataAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [router, state.success]);

  return (
    <section className="content-surface">
      <div className="section-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>{title}</h2>
          <p className="muted" style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
            {description}
          </p>
        </div>
        <Space size={8}>
          <Tag color="processing">JSON</Tag>
          <Tag color="green">Excel</Tag>
        </Space>
      </div>

      {state.error ? <Alert type="error" message={state.error} showIcon /> : null}
      {state.success ? (
        <Alert
          type="success"
          message={state.success}
          showIcon
          style={{ marginTop: state.error ? 12 : 0 }}
        />
      ) : null}

      <form ref={formRef} action={formAction} style={{ marginTop: 16 }}>
        <div className="import-form-grid">
          <div>
            <label className="field-label" htmlFor="import-projectId">
              导入到项目
            </label>
            <select
              id="import-projectId"
              name="projectId"
              defaultValue={projects[0]?.id ?? ""}
              className="field-select"
            >
              {projects.length ? null : (
                <option value="" disabled>
                  暂无可导入项目
                </option>
              )}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="import-name">
              数据源名称
            </label>
            <Input
              id="import-name"
              name="name"
              size="large"
              placeholder="留空则默认使用文件名"
            />
          </div>

          <div className="import-file-field">
            <label className="field-label" htmlFor="import-file">
              上传文件
            </label>
            <input
              id="import-file"
              name="file"
              type="file"
              accept=".json,.xlsx,.xls"
              className="field-file"
            />
          </div>

          <div className="import-form-submit">
            <Button
              type="primary"
              htmlType="submit"
              icon={<FileUp size={16} />}
              loading={isPending}
              disabled={!projects.length}
            >
              开始导入
            </Button>
          </div>
        </div>
      </form>

      <div className="workspace-tip" style={{ marginTop: 16 }}>
        <Tag color="blue">说明</Tag>
        <span>
          支持对象数组 JSON 和首个工作表为题目数据的 Excel。系统会自动识别常见列名，如标题、内容、答案、解析、题型和难度。
        </span>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 700 }}>
          已导入数据源
        </div>

        {datasources.length ? (
          <div className="datasource-card-grid">
            {datasources.map((datasource) => (
              <div key={datasource.id} className="datasource-card">
                <div className="datasource-card-top">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>
                      {datasource.name}
                    </div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {datasource.project.name} ({datasource.project.code})
                    </div>
                  </div>
                  <Space size={8} wrap>
                    <Tag color={getDataSourceTypeColor(datasource.type)}>
                      {getDataSourceTypeLabel(datasource.type)}
                    </Tag>
                    <Tag color={getDataSourceStatusColor(datasource.status)}>
                      {getDataSourceStatusLabel(datasource.status)}
                    </Tag>
                  </Space>
                </div>

                <div className="datasource-mini-grid">
                  <div className="datasource-mini-card">
                    <Table2 size={16} />
                    <div>
                      <div className="datasource-mini-value">
                        {datasource.questionCount}
                      </div>
                      <div className="muted">题目数</div>
                    </div>
                  </div>
                  <div className="datasource-mini-card">
                    <div>
                      <div className="datasource-mini-value">
                        {datasource.lastSyncStatus === "FAILED"
                          ? "失败"
                          : datasource.lastSyncStatus === "SUCCESS"
                            ? "成功"
                            : "未记录"}
                      </div>
                      <div className="muted">最近导入状态</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                  <div className="muted">
                    创建时间：{datasource.createdAt}
                  </div>
                  {datasource.originalFileName ? (
                    <div className="muted">
                      原始文件：{datasource.originalFileName}
                    </div>
                  ) : null}
                  {datasource.lastSyncAt ? (
                    <div className="muted">
                      最近导入：{datasource.lastSyncAt}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty description="当前还没有已导入的数据源" />
        )}
      </div>
    </section>
  );
}
