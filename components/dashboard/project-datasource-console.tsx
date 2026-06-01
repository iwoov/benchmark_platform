"use client";

import {
    useActionState,
    useEffect,
    useMemo,
    useRef,
    useState,
    useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
    Button,
    Checkbox,
    Empty,
    Input,
    Modal,
    Select,
    Space,
    Tag,
} from "@/components/ui/legacy-ui-adapters";
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
import { useToast } from "@/components/ui/toast";
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
    canManage: boolean;
};

type DataSourceItem = {
    id: string;
    name: string;
    type: "DINGTALK_BITABLE" | "JSON_UPLOAD" | "EXCEL_UPLOAD";
    status: "ACTIVE" | "INACTIVE";
    createdAt: string;
    questionCount: number;
    canManage: boolean;
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
    const toast = useToast();
    const [state, formAction, isPending] = useActionState(
        importProjectDataAction,
        initialState,
    );
    const [imagePackState, imagePackFormAction, isImagePackPending] =
        useActionState(uploadDatasourceImagePackAction, initialImagePackState);
    const formRef = useRef<HTMLFormElement>(null);
    const imagePackFormRef = useRef<HTMLFormElement>(null);
    const [open, setOpen] = useState(false);
    const [importTargetDatasource, setImportTargetDatasource] =
        useState<DataSourceItem | null>(null);
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
    const [deleteConfirmDatasource, setDeleteConfirmDatasource] =
        useState<DataSourceItem | null>(null);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
    const selectedProjectId =
        activeProjectId && projects.some((project) => project.id === activeProjectId)
            ? activeProjectId
            : projects[0]?.id ?? "";
    const selectedProject =
        projects.find((project) => project.id === selectedProjectId) ?? null;
    const manageableProjects = useMemo(
        () => projects.filter((project) => project.canManage),
        [projects],
    );
    const importProjectId = selectedProject?.canManage
        ? selectedProject.id
        : manageableProjects[0]?.id ?? "";
    const datasourceCountsByProject = useMemo(() => {
        const counts = new Map<string, number>();

        for (const datasource of datasources) {
            counts.set(
                datasource.project.id,
                (counts.get(datasource.project.id) ?? 0) + 1,
            );
        }

        return counts;
    }, [datasources]);
    const selectedDatasources = useMemo(
        () =>
            datasources.filter(
                (datasource) => datasource.project.id === selectedProjectId,
            ),
        [datasources, selectedProjectId],
    );

    useActionNotification(state, {
        successTitle: "导入成功",
        errorTitle: "导入失败",
    });

    useEffect(() => {
        if (state.success) {
            const frame = requestAnimationFrame(() => {
                formRef.current?.reset();
                setOpen(false);
                setImportTargetDatasource(null);
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

    function openNewDatasourceImport() {
        setImportTargetDatasource(null);
        setOpen(true);
    }

    function openAppendDatasourceImport(datasource: DataSourceItem) {
        setImportTargetDatasource(datasource);
        setOpen(true);
    }

    function closeImportModal() {
        setOpen(false);
        setImportTargetDatasource(null);
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
                toast.error({
                    title: "保存失败",
                    description: result.error,
                });
                return;
            }

            toast.success({
                title: "图片字段已更新",
                description: result.success,
            });
            setImageFieldOpen(false);
            router.refresh();
        });
    }

    function confirmDeleteDatasource(datasource: DataSourceItem) {
        setDeleteConfirmDatasource(datasource);
    }

    async function deleteConfirmedDatasource() {
        if (!deleteConfirmDatasource) {
            return;
        }

        setDeletingDatasourceId(deleteConfirmDatasource.id);

        try {
            const result = await deleteDatasourceAction({
                datasourceId: deleteConfirmDatasource.id,
            });

            if (result.error) {
                toast.error({
                    title: "删除失败",
                    description: result.error,
                });
                return;
            }

            toast.success({
                title: "数据源已删除",
                description: result.success,
            });
            setDeleteConfirmDatasource(null);
            router.refresh();
        } finally {
            setDeletingDatasourceId((current) =>
                current === deleteConfirmDatasource.id ? null : current,
            );
        }
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
                    onClick={openNewDatasourceImport}
                    disabled={!manageableProjects.length}
                >
                    导入数据
                </Button>
            </div>

            <div className="workspace-tip" style={{ marginTop: 16 }}>
                <Tag color="blue">说明</Tag>
                <span>
                    支持对象数组 JSON 和首个工作表为题目数据的
                    Excel。导入文件必须包含 question_id、question、answer
                    或 ground_truth、solution、primary、options、image_id
                    字段；options 和 image_id 可以留空。
                </span>
            </div>

            <div style={{ marginTop: 20 }}>
                {projects.length ? (
                    <div className="datasource-browser">
                        <aside className="datasource-project-list">
                            <div className="datasource-project-list-title">
                                项目
                            </div>
                            <div className="datasource-project-items">
                                {projects.map((project) => {
                                    const datasourceCount =
                                        datasourceCountsByProject.get(project.id) ??
                                        0;
                                    const isActive =
                                        project.id === selectedProjectId;

                                    return (
                                        <button
                                            key={project.id}
                                            type="button"
                                            className={
                                                isActive
                                                    ? "datasource-project-item datasource-project-item-active"
                                                    : "datasource-project-item"
                                            }
                                            onClick={() =>
                                                setActiveProjectId(project.id)
                                            }
                                        >
                                            <span>
                                                <span className="datasource-project-name">
                                                    {project.name}
                                                </span>
                                                <span className="datasource-project-code">
                                                    {project.code}
                                                </span>
                                            </span>
                                            <span className="datasource-project-count">
                                                {datasourceCount}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>

                        <div className="datasource-current-panel">
                            <div className="datasource-current-head">
                                <div>
                                    <div className="datasource-current-title">
                                        {selectedProject?.name ?? "未选择项目"}
                                    </div>
                                    <div className="datasource-current-meta">
                                        {selectedProject ? (
                                            <>
                                                <Tag color="blue">
                                                    {selectedProject.code}
                                                </Tag>
                                                <span>
                                                    {
                                                        selectedDatasources.length
                                                    }{" "}
                                                    个数据源
                                                </span>
                                            </>
                                        ) : null}
                                    </div>
                                </div>
                                <Button
                                    type="primary"
                                    icon={<Plus size={16} />}
                                    onClick={openNewDatasourceImport}
                                    disabled={!selectedProject?.canManage}
                                    title={
                                        selectedProject?.canManage
                                            ? undefined
                                            : "只能向自己创建的项目导入数据"
                                    }
                                >
                                    导入到当前项目
                                </Button>
                            </div>

                            {selectedDatasources.length ? (
                                <div className="table-surface">
                                    <div className="datasource-list-head">
                                        <div>数据源</div>
                                        <div>类型</div>
                                        <div>状态</div>
                                        <div>题目数</div>
                                        <div>原始文件</div>
                                        <div>操作</div>
                                    </div>

                                    {selectedDatasources.map((datasource) => (
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
                                            {datasource.originalFileName ?? "—"}
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
                                                    icon={<FileUp size={14} />}
                                                    disabled={
                                                        !datasource.canManage
                                                    }
                                                    title={
                                                        datasource.canManage
                                                            ? undefined
                                                            : "只能向自己创建项目下的数据源继续导入"
                                                    }
                                                    onClick={() =>
                                                        openAppendDatasourceImport(
                                                            datasource,
                                                        )
                                                    }
                                                >
                                                    继续导入
                                                </Button>
                                                <Button
                                                    size="small"
                                                    icon={
                                                        <ImageIcon size={14} />
                                                    }
                                                    disabled={
                                                        !datasource.canManage
                                                    }
                                                    title={
                                                        datasource.canManage
                                                            ? undefined
                                                            : "只能操作自己创建项目下的数据源"
                                                    }
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
                                                    disabled={
                                                        !datasource.canManage
                                                    }
                                                    title={
                                                        datasource.canManage
                                                            ? undefined
                                                            : "只能操作自己创建项目下的数据源"
                                                    }
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
                                                    disabled={
                                                        !datasource.canManage
                                                    }
                                                    title={
                                                        datasource.canManage
                                                            ? undefined
                                                            : "只能删除自己创建项目下的数据源"
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
                            ) : (
                                <Empty
                                    className="datasource-empty"
                                    description="当前项目还没有已导入的数据源"
                                />
                            )}
                        </div>
                    </div>
                ) : (
                    <Empty description="当前还没有可用项目" />
                )}
            </div>

            <Modal
                open={open}
                onCancel={closeImportModal}
                footer={null}
                width={680}
                destroyOnHidden
                title={
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>
                            {importTargetDatasource
                                ? "继续导入数据源"
                                : "导入数据源"}
                        </div>
                        <div
                            className="muted"
                            style={{ marginTop: 4, fontSize: 13 }}
                        >
                            {importTargetDatasource
                                ? `新题目会写入「${importTargetDatasource.name}」，修订题目会继续挂在同一数据源下。`
                                : "导入后会自动创建项目数据源并写入题目主表。"}
                        </div>
                    </div>
                }
            >
                <form
                    ref={formRef}
                    action={formAction}
                    style={{ marginTop: 8 }}
                >
                    {importTargetDatasource ? (
                        <input
                            type="hidden"
                            name="projectId"
                            value={importTargetDatasource.project.id}
                        />
                    ) : null}
                    <input
                        type="hidden"
                        name="datasourceId"
                        value={importTargetDatasource?.id ?? ""}
                    />
                    <div className="import-form-grid">
                        <div className="workspace-tip import-form-full">
                            <Tag color="blue">字段要求</Tag>
                            <span>
                                必填且不能为空：question_id（题目唯一标识）、question（题干）、answer
                                或 ground_truth（标准答案）、solution（解析）、primary（一级学科）。
                                必须保留字段但可为空：options（选项列表）、image_id（图片引用）。
                                其他项目扩展字段会原样保留。
                            </span>
                        </div>

                        {importTargetDatasource ? (
                            <div className="import-form-full">
                                <div className="field-label">导入目标</div>
                                <div className="workspace-tip">
                                    <Tag color="blue">
                                        {
                                            importTargetDatasource.project
                                                .code
                                        }
                                    </Tag>
                                    <span>
                                        {importTargetDatasource.project.name} /{" "}
                                        {importTargetDatasource.name}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <>
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
                                        defaultValue={importProjectId}
                                        className="field-select"
                                    >
                                        {manageableProjects.length ? null : (
                                            <option value="" disabled>
                                                暂无可导入项目
                                            </option>
                                        )}
                                        {manageableProjects.map((project) => (
                                            <option
                                                key={project.id}
                                                value={project.id}
                                            >
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
                            </>
                        )}

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
                                {importTargetDatasource
                                    ? "勾选后，会确保当前数据源加入已配置“适用数据源”的审核策略；如策略同时限定了项目范围，也会自动补上当前项目。"
                                    : "勾选后，新导入的数据源会自动加入已配置“适用数据源”的审核策略；如策略同时限定了项目范围，也会自动补上当前项目。"}
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
                            <Button onClick={closeImportModal}>取消</Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                icon={<FileUp size={16} />}
                                loading={isPending}
                                disabled={!manageableProjects.length}
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

            <Modal
                open={!!deleteConfirmDatasource}
                onCancel={() => setDeleteConfirmDatasource(null)}
                onOk={deleteConfirmedDatasource}
                okText="确认删除"
                cancelText="取消"
                confirmLoading={
                    !!deleteConfirmDatasource &&
                    deletingDatasourceId === deleteConfirmDatasource.id
                }
                okButtonProps={{ danger: true }}
                width={560}
                title={
                    deleteConfirmDatasource
                        ? `确认删除数据源“${deleteConfirmDatasource.name}”`
                        : "确认删除数据源"
                }
            >
                {deleteConfirmDatasource ? (
                    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                        <div>
                            删除后将立即移除该数据源下的全部导入题目、关联图片、审核记录、AI
                            回答与运行记录，且不可恢复。
                        </div>
                        <div className="workspace-tip">
                            <Tag color="red">高风险操作</Tag>
                            <span>
                                当前数据源属于项目{" "}
                                {deleteConfirmDatasource.project.name} (
                                {deleteConfirmDatasource.project.code})，当前可见题目数为{" "}
                                {deleteConfirmDatasource.questionCount}。
                            </span>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </section>
    );
}
