"use client";

import {
    useActionState,
    useEffect,
    useRef,
    useState,
    useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
    App,
    Button,
    Checkbox,
    Empty,
    Input,
    Modal,
    Select,
    Space,
    Tag,
} from "antd";
import {
    FileUp,
    Image as ImageIcon,
    Plus,
    Settings,
    Trash2,
} from "lucide-react";
import {
    deleteDatasourceAction,
    importProjectDataAction,
    type ImportProjectDataFormState,
} from "@/app/actions/datasources";
import {
    uploadDatasourceImagePackAction,
    updateDatasourceImageFieldsAction,
    type ImagePackUploadState,
} from "@/app/actions/datasource-images";
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
    rawFieldOrder?: string[];
    imageFields?: string[];
    imageCount?: number;
};

const initialState: ImportProjectDataFormState = {};
const initialImagePackState: ImagePackUploadState = {};

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
    const { modal, notification } = App.useApp();
    const [state, formAction, isPending] = useActionState(
        importProjectDataAction,
        initialState,
    );
    const [imagePackState, imagePackFormAction, isImagePackPending] =
        useActionState(uploadDatasourceImagePackAction, initialImagePackState);
    const formRef = useRef<HTMLFormElement>(null);
    const imagePackFormRef = useRef<HTMLFormElement>(null);
    const [open, setOpen] = useState(false);
    const [imagePackOpen, setImagePackOpen] = useState(false);
    const [imagePackDatasourceId, setImagePackDatasourceId] = useState("");
    const [imageFieldOpen, setImageFieldOpen] = useState(false);
    const [imageFieldDatasource, setImageFieldDatasource] =
        useState<DataSourceItem | null>(null);
    const [selectedImageFields, setSelectedImageFields] = useState<string[]>(
        [],
    );
    const [isSavingImageFields, startSavingImageFields] = useTransition();
    const [deletingDatasourceId, setDeletingDatasourceId] = useState<
        string | null
    >(null);
    const datasourceGroups = projects
        .map((project) => ({
            project,
            datasources: datasources.filter(
                (datasource) => datasource.project.id === project.id,
            ),
        }))
        .filter((group) => group.datasources.length > 0);

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

    useActionNotification(imagePackState, {
        successTitle: "图片包上传成功",
        errorTitle: "图片包上传失败",
    });

    useEffect(() => {
        if (imagePackState.success) {
            const frame = requestAnimationFrame(() => {
                imagePackFormRef.current?.reset();
                setImagePackOpen(false);
                router.refresh();
            });

            return () => cancelAnimationFrame(frame);
        }
    }, [router, imagePackState.success]);

    function openImageFieldModal(datasource: DataSourceItem) {
        setImageFieldDatasource(datasource);
        setSelectedImageFields(datasource.imageFields ?? []);
        setImageFieldOpen(true);
    }

    function saveImageFields() {
        if (!imageFieldDatasource) {
            return;
        }

        startSavingImageFields(async () => {
            const result = await updateDatasourceImageFieldsAction({
                datasourceId: imageFieldDatasource.id,
                imageFields: selectedImageFields,
            });

            if (result.error) {
                notification.error({
                    message: "保存失败",
                    description: result.error,
                    placement: "topRight",
                });
                return;
            }

            notification.success({
                message: "图片字段已更新",
                description: result.success,
                placement: "topRight",
            });
            setImageFieldOpen(false);
            router.refresh();
        });
    }

    function confirmDeleteDatasource(datasource: DataSourceItem) {
        modal.confirm({
            title: `确认删除数据源“${datasource.name}”`,
            centered: true,
            okText: "确认删除",
            cancelText: "取消",
            okButtonProps: {
                danger: true,
            },
            content: (
                <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                    <div>
                        删除后将立即移除该数据源下的全部导入题目、关联图片、审核记录、AI
                        回答与运行记录，且不可恢复。
                    </div>
                    <div className="workspace-tip">
                        <Tag color="red">高风险操作</Tag>
                        <span>
                            当前数据源属于项目 {datasource.project.name} (
                            {datasource.project.code})，当前可见题目数为{" "}
                            {datasource.questionCount}。
                        </span>
                    </div>
                </div>
            ),
            onOk: async () => {
                setDeletingDatasourceId(datasource.id);

                try {
                    const result = await deleteDatasourceAction({
                        datasourceId: datasource.id,
                    });

                    if (result.error) {
                        notification.error({
                            message: "删除失败",
                            description: result.error,
                            placement: "topRight",
                        });
                        throw new Error(result.error);
                    }

                    notification.success({
                        message: "数据源已删除",
                        description: result.success,
                        placement: "topRight",
                    });
                    router.refresh();
                } finally {
                    setDeletingDatasourceId((current) =>
                        current === datasource.id ? null : current,
                    );
                }
            },
        });
    }

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
                    <div
                        style={{ display: "grid", gap: 20 }}
                    >
                        {datasourceGroups.map(({ project, datasources }) => (
                            <div key={project.id}>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        marginBottom: 10,
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: 16,
                                            fontWeight: 700,
                                        }}
                                    >
                                        {project.name}
                                    </div>
                                    <Tag color="blue">{project.code}</Tag>
                                    <span className="muted">
                                        {datasources.length} 个数据源
                                    </span>
                                </div>

                                <div className="table-surface">
                                    <div className="datasource-list-head">
                                        <div>数据源</div>
                                        <div>类型</div>
                                        <div>状态</div>
                                        <div>题目数</div>
                                        <div>原始文件</div>
                                        <div>操作</div>
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
                                                {datasource.originalFileName ??
                                                    "—"}
                                                {typeof datasource.imageCount ===
                                                    "number" &&
                                                datasource.imageCount > 0 ? (
                                                    <div style={{ marginTop: 4 }}>
                                                        <Tag color="green">
                                                            已关联{" "}
                                                            {datasource.imageCount}{" "}
                                                            张图片
                                                        </Tag>
                                                    </div>
                                                ) : null}
                                            </div>
                                            <div>
                                                <Space size={4} wrap>
                                                    <Button
                                                        size="small"
                                                        icon={<ImageIcon size={14} />}
                                                        onClick={() => {
                                                            setImagePackDatasourceId(
                                                                datasource.id,
                                                            );
                                                            setImagePackOpen(true);
                                                        }}
                                                    >
                                                        上传图片包
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        icon={<Settings size={14} />}
                                                        onClick={() =>
                                                            openImageFieldModal(
                                                                datasource,
                                                            )
                                                        }
                                                    >
                                                        图片字段
                                                    </Button>
                                                    <Button
                                                        danger
                                                        size="small"
                                                        icon={<Trash2 size={14} />}
                                                        loading={
                                                            deletingDatasourceId ===
                                                            datasource.id
                                                        }
                                                        onClick={() =>
                                                            confirmDeleteDatasource(
                                                                datasource,
                                                            )
                                                        }
                                                    >
                                                        删除
                                                    </Button>
                                                </Space>
                                            </div>
                                        </div>
                                    ))}
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

                        <div className="import-form-full">
                            <Checkbox
                                name="autoApplyAiStrategies"
                                defaultChecked
                            >
                                自动加入现有审核策略范围
                            </Checkbox>
                            <div
                                className="muted"
                                style={{ marginTop: 6, fontSize: 12 }}
                            >
                                勾选后，新导入的数据源会自动加入已配置“适用数据源”的审核策略；如策略同时限定了项目范围，也会自动补上当前项目。
                            </div>
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

            <Modal
                open={imagePackOpen}
                onCancel={() => setImagePackOpen(false)}
                footer={null}
                width={680}
                destroyOnHidden
                title={
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>
                            上传图片包
                        </div>
                        <div
                            className="muted"
                            style={{ marginTop: 4, fontSize: 13 }}
                        >
                            上传 zip 或 rar 格式的图片包。支持直接包含图片，或包含嵌套
                            zip / rar（每个压缩包内含图片）。
                        </div>
                    </div>
                }
            >
                <form
                    ref={imagePackFormRef}
                    action={imagePackFormAction}
                    style={{ marginTop: 8 }}
                >
                    <input
                        type="hidden"
                        name="datasourceId"
                        value={imagePackDatasourceId}
                    />
                    <div className="import-form-grid">
                        <div className="import-file-field">
                            <label
                                className="field-label"
                                htmlFor="image-pack-file"
                            >
                                选择 zip / rar 图片包
                            </label>
                            <input
                                id="image-pack-file"
                                name="file"
                                type="file"
                                accept=".zip,.rar"
                                multiple
                                className="field-file"
                            />
                        </div>

                        <div className="workspace-tip">
                            <Tag color="blue">说明</Tag>
                            <span>
                                上传后系统会自动解压提取所有图片文件（含嵌套
                                zip / rar），并建立文件名到图片的映射关系。之后需在「图片字段」中配置哪些原始字段关联图片。
                            </span>
                        </div>

                        <div className="import-form-submit">
                            <Button onClick={() => setImagePackOpen(false)}>
                                取消
                            </Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                icon={<FileUp size={16} />}
                                loading={isImagePackPending}
                            >
                                开始上传
                            </Button>
                        </div>
                    </div>
                </form>
            </Modal>

            <Modal
                open={imageFieldOpen}
                onCancel={() => setImageFieldOpen(false)}
                onOk={saveImageFields}
                okText={isSavingImageFields ? "保存中..." : "保存"}
                cancelText="取消"
                confirmLoading={isSavingImageFields}
                width={560}
                destroyOnHidden
                title="配置图片字段"
            >
                <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
                    <div className="workspace-tip">
                        <Tag color="blue">说明</Tag>
                        <span>
                            选择哪些原始字段的值对应图片。选中后，详情页会自动将该字段渲染为图片。
                        </span>
                    </div>
                    <div>
                        <div className="field-label">图片字段（可多选）</div>
                        <Select
                            mode="multiple"
                            value={selectedImageFields}
                            onChange={(value) =>
                                setSelectedImageFields(value as string[])
                            }
                            options={(
                                imageFieldDatasource?.rawFieldOrder ?? []
                            ).map((field) => ({
                                value: field,
                                label: field,
                            }))}
                            placeholder="选择包含图片引用的字段"
                            size="large"
                            style={{ width: "100%" }}
                            optionFilterProp="label"
                        />
                    </div>
                </div>
            </Modal>
        </section>
    );
}
