"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Empty, Input, Modal, Space, Tag } from "antd";
import { FileUp, Plus } from "lucide-react";
import {
    importProjectDataAction,
    type ImportProjectDataFormState,
} from "@/app/actions/datasources";
import { useActionNotification } from "@/components/feedback/use-action-notification";
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
    const [open, setOpen] = useState(false);

    useActionNotification(state, {
        successTitle: "导入成功",
        errorTitle: "导入失败",
    });

    useEffect(() => {
        if (state.success) {
            const frame = requestAnimationFrame(() => {
                formRef.current?.reset();
                setOpen(false);
                router.refresh();
            });

            return () => cancelAnimationFrame(frame);
        }
    }, [router, state.success]);

    return (
        <section className="content-surface">
            <div className="section-head">
                <div>
                    <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                        {title}
                    </h2>
                    <p
                        className="muted"
                        style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                    >
                        {description}
                    </p>
                </div>
                <Button
                    type="primary"
                    icon={<Plus size={16} />}
                    onClick={() => setOpen(true)}
                    disabled={!projects.length}
                >
                    导入数据
                </Button>
            </div>

            <div className="workspace-tip" style={{ marginTop: 16 }}>
                <Tag color="blue">说明</Tag>
                <span>
                    支持对象数组 JSON 和首个工作表为题目数据的
                    Excel。系统会自动识别常见列名，如标题、内容、答案、解析、题型和难度。
                </span>
            </div>

            <div style={{ marginTop: 20 }}>
                <div
                    style={{ marginBottom: 12, fontSize: 14, fontWeight: 700 }}
                >
                    已导入数据源
                </div>

                {datasources.length ? (
                    <div className="table-surface">
                        <div className="datasource-list-head">
                            <div>数据源</div>
                            <div>所属项目</div>
                            <div>类型</div>
                            <div>状态</div>
                            <div>题目数</div>
                            <div>原始文件</div>
                            <div>最近导入</div>
                        </div>

                        {datasources.map((datasource) => (
                            <div
                                key={datasource.id}
                                className="datasource-list-row"
                            >
                                <div>
                                    <div style={{ fontWeight: 700 }}>
                                        {datasource.name}
                                    </div>
                                    <div
                                        className="muted"
                                        style={{ marginTop: 4 }}
                                    >
                                        创建于 {datasource.createdAt}
                                    </div>
                                </div>
                                <div>
                                    {datasource.project.name} (
                                    {datasource.project.code})
                                </div>
                                <div>
                                    <Tag
                                        color={getDataSourceTypeColor(
                                            datasource.type,
                                        )}
                                    >
                                        {getDataSourceTypeLabel(
                                            datasource.type,
                                        )}
                                    </Tag>
                                </div>
                                <div>
                                    <Tag
                                        color={getDataSourceStatusColor(
                                            datasource.status,
                                        )}
                                    >
                                        {getDataSourceStatusLabel(
                                            datasource.status,
                                        )}
                                    </Tag>
                                </div>
                                <div>{datasource.questionCount}</div>
                                <div className="muted">
                                    {datasource.originalFileName ?? "—"}
                                </div>
                                <div className="muted">
                                    {datasource.lastSyncAt
                                        ? `${datasource.lastSyncAt} · ${
                                              datasource.lastSyncStatus ===
                                              "FAILED"
                                                  ? "失败"
                                                  : datasource.lastSyncStatus ===
                                                      "SUCCESS"
                                                    ? "成功"
                                                    : "未记录"
                                          }`
                                        : "—"}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <Empty description="当前还没有已导入的数据源" />
                )}
            </div>

            <Modal
                open={open}
                onCancel={() => setOpen(false)}
                footer={null}
                width={680}
                destroyOnHidden
                title={
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>
                            导入数据源
                        </div>
                        <div
                            className="muted"
                            style={{ marginTop: 4, fontSize: 13 }}
                        >
                            导入后会自动创建项目数据源并写入题目主表。
                        </div>
                    </div>
                }
            >
                <form
                    ref={formRef}
                    action={formAction}
                    style={{ marginTop: 8 }}
                >
                    <div className="import-form-grid">
                        <div>
                            <label
                                className="field-label"
                                htmlFor="import-projectId"
                            >
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
                            <label
                                className="field-label"
                                htmlFor="import-name"
                            >
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
                            <label
                                className="field-label"
                                htmlFor="import-file"
                            >
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
                            <Button onClick={() => setOpen(false)}>取消</Button>
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
            </Modal>
        </section>
    );
}
