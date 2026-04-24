"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Modal, Select, Space, Tag } from "antd";
import { PencilLine, Plus } from "lucide-react";
import {
    saveSubjectAction,
    type SaveSubjectFormState,
} from "@/app/actions/subjects";
import { useActionNotification } from "@/components/feedback/use-action-notification";

type SubjectItem = {
    id: string;
    name: string;
    description: string | null;
    primaryValues: string[];
    userCount: number;
    updatedAt: string;
};

const initialState: SaveSubjectFormState = {};

export function SubjectManagementConsole({
    subjects,
    availablePrimaryValues,
}: {
    subjects: SubjectItem[];
    availablePrimaryValues: string[];
}) {
    const router = useRouter();
    const formRef = useRef<HTMLFormElement>(null);
    const [state, formAction, isPending] = useActionState(
        saveSubjectAction,
        initialState,
    );
    const [open, setOpen] = useState(false);
    const [dialogKey, setDialogKey] = useState(0);
    const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
    const [selectedPrimaryValues, setSelectedPrimaryValues] = useState<string[]>(
        [],
    );

    useActionNotification(state, {
        successTitle: "学科保存成功",
        errorTitle: "学科保存失败",
    });

    const activeSubject = useMemo(
        () => subjects.find((subject) => subject.id === activeSubjectId) ?? null,
        [activeSubjectId, subjects],
    );
    const primaryValueOptions = useMemo(() => {
        const merged = new Set(availablePrimaryValues);

        for (const value of activeSubject?.primaryValues ?? []) {
            merged.add(value);
        }

        return Array.from(merged)
            .sort((left, right) => left.localeCompare(right, "zh-CN"))
            .map((value) => ({
                value,
                label: value,
            }));
    }, [activeSubject?.primaryValues, availablePrimaryValues]);

    useEffect(() => {
        if (state.success) {
            const frame = requestAnimationFrame(() => {
                formRef.current?.reset();
                setSelectedPrimaryValues([]);
                setActiveSubjectId(null);
                setOpen(false);
                setDialogKey((value) => value + 1);
                router.refresh();
            });

            return () => cancelAnimationFrame(frame);
        }
    }, [router, state.success]);

    useEffect(() => {
        if (!activeSubject) {
            setSelectedPrimaryValues([]);
            return;
        }

        setSelectedPrimaryValues(activeSubject.primaryValues);
    }, [activeSubject]);

    function openCreateModal() {
        setActiveSubjectId(null);
        setSelectedPrimaryValues([]);
        setDialogKey((value) => value + 1);
        setOpen(true);
    }

    function openEditModal(subjectId: string) {
        const subject = subjects.find((item) => item.id === subjectId);

        setActiveSubjectId(subjectId);
        setSelectedPrimaryValues(subject?.primaryValues ?? []);
        setDialogKey((value) => value + 1);
        setOpen(true);
    }

    return (
        <>
            <section className="content-surface users-table-surface">
                <div className="section-head">
                    <div>
                        <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                            学科管理
                        </h2>
                        <p
                            className="muted"
                            style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                        >
                            为用户配置学科标签，并把每个学科映射到题目原始数据中的
                            `primary` 取值。普通用户只会看到自己学科范围内的题目。
                        </p>
                    </div>
                    <Button
                        type="primary"
                        size="large"
                        icon={<Plus size={16} />}
                        onClick={openCreateModal}
                    >
                        新建学科
                    </Button>
                </div>

                {!availablePrimaryValues.length ? (
                    <div className="workspace-tip" style={{ marginBottom: 16 }}>
                        <Tag color="gold">提示</Tag>
                        <span>
                            当前题目数据里还没有可识别的 `primary` 取值；导入数据后，这里会自动列出可绑定选项。
                        </span>
                    </div>
                ) : null}

                <div className="table-surface">
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1.2fr 0.7fr 0.8fr 0.7fr",
                            gap: 16,
                            padding: "14px 16px",
                            background: "rgba(248, 250, 252, 0.9)",
                            fontWeight: 700,
                        }}
                    >
                        <div>学科名称</div>
                        <div>primary 映射</div>
                        <div>已绑定用户</div>
                        <div>更新时间</div>
                        <div>操作</div>
                    </div>

                    {subjects.length === 0 ? (
                        <div style={{ padding: 24 }} className="muted">
                            当前还没有学科定义。
                        </div>
                    ) : (
                        subjects.map((subject) => (
                            <div
                                key={subject.id}
                                style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                        "1fr 1.2fr 0.7fr 0.8fr 0.7fr",
                                    gap: 16,
                                    padding: "16px",
                                    borderTop:
                                        "1px solid rgba(217, 224, 234, 0.85)",
                                    alignItems: "center",
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 700 }}>
                                        {subject.name}
                                    </div>
                                    {subject.description ? (
                                        <div
                                            className="muted"
                                            style={{ marginTop: 6 }}
                                        >
                                            {subject.description}
                                        </div>
                                    ) : null}
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 8,
                                        flexWrap: "wrap",
                                    }}
                                >
                                    {subject.primaryValues.map((value) => (
                                        <Tag key={value} color="blue">
                                            {value}
                                        </Tag>
                                    ))}
                                </div>
                                <div>{subject.userCount}</div>
                                <div className="muted">{subject.updatedAt}</div>
                                <div>
                                    <Button
                                        icon={<PencilLine size={16} />}
                                        onClick={() => openEditModal(subject.id)}
                                    >
                                        编辑
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>

            <Modal
                open={open}
                onCancel={() => setOpen(false)}
                footer={null}
                width={720}
                destroyOnHidden
                title={
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>
                            {activeSubject ? "编辑学科" : "创建学科"}
                        </div>
                        <div
                            className="muted"
                            style={{ marginTop: 4, fontSize: 13 }}
                        >
                            一个学科可以映射多个 `primary` 值；用户勾选该学科后，即可看到这些题目。
                        </div>
                    </div>
                }
            >
                <Space
                    key={dialogKey}
                    direction="vertical"
                    size={16}
                    style={{ width: "100%", marginTop: 8 }}
                >
                    <form ref={formRef} action={formAction}>
                        {activeSubject ? (
                            <input
                                type="hidden"
                                name="subjectId"
                                value={activeSubject.id}
                            />
                        ) : null}

                        <Space
                            direction="vertical"
                            size={16}
                            style={{ width: "100%" }}
                        >
                            <div>
                                <label className="field-label" htmlFor="subject-name">
                                    学科名称
                                </label>
                                <Input
                                    id="subject-name"
                                    name="name"
                                    size="large"
                                    defaultValue={activeSubject?.name ?? ""}
                                    placeholder="例如：数学、物理、金融"
                                />
                            </div>

                            <div>
                                <label
                                    className="field-label"
                                    htmlFor="subject-description"
                                >
                                    说明
                                </label>
                                <Input.TextArea
                                    id="subject-description"
                                    name="description"
                                    rows={3}
                                    defaultValue={activeSubject?.description ?? ""}
                                    placeholder="可选，用于补充学科范围说明"
                                />
                            </div>

                            <div>
                                <label
                                    className="field-label"
                                    htmlFor="subject-primaryValues"
                                >
                                    绑定 primary 取值
                                </label>
                                <Select
                                    id="subject-primaryValues"
                                    mode="multiple"
                                    size="large"
                                    value={selectedPrimaryValues}
                                    onChange={setSelectedPrimaryValues}
                                    options={primaryValueOptions}
                                    placeholder="选择当前数据里的 primary 取值"
                                    style={{ width: "100%" }}
                                    maxTagCount="responsive"
                                />
                                {selectedPrimaryValues.map((value) => (
                                    <input
                                        key={value}
                                        type="hidden"
                                        name="primaryValues"
                                        value={value}
                                    />
                                ))}
                            </div>

                            <div className="member-form-submit">
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={isPending}
                                >
                                    保存学科
                                </Button>
                            </div>
                        </Space>
                    </form>
                </Space>
            </Modal>
        </>
    );
}
