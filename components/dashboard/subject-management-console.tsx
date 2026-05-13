"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilLine, Plus } from "lucide-react";
import {
    saveSubjectAction,
    type SaveSubjectFormState,
} from "@/app/actions/subjects";
import { useActionNotification } from "@/components/feedback/use-action-notification";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MultiSelect } from "@/components/ui/multi-select";

type SubjectItem = {
    id: string;
    name: string;
    description: string | null;
    primaryValues: string[];
    userCount: number;
    updatedAt: string;
};

const initialState: SaveSubjectFormState = {};
const COL_TEMPLATE = "1fr 1.2fr 0.7fr 0.8fr 0.7fr";

export function SubjectManagementConsole({
    subjects,
    availablePrimaryValues,
    unmappedPrimaryValues,
}: {
    subjects: SubjectItem[];
    availablePrimaryValues: string[];
    unmappedPrimaryValues: string[];
}) {
    const router = useRouter();
    const formRef = useRef<HTMLFormElement>(null);
    const [state, formAction, isPending] = useActionState(saveSubjectAction, initialState);
    const [open, setOpen] = useState(false);
    const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
    const [selectedPrimaryValues, setSelectedPrimaryValues] = useState<string[]>([]);

    useActionNotification(state, {
        successTitle: "学科保存成功",
        errorTitle: "学科保存失败",
    });

    const activeSubject = useMemo(
        () => subjects.find((s) => s.id === activeSubjectId) ?? null,
        [activeSubjectId, subjects],
    );

    const primaryValueOptions = useMemo(() => {
        const merged = new Set(availablePrimaryValues);
        for (const value of activeSubject?.primaryValues ?? []) merged.add(value);
        return Array.from(merged)
            .sort((l, r) => l.localeCompare(r, "zh-CN"))
            .map((value) => ({ value, label: value }));
    }, [activeSubject?.primaryValues, availablePrimaryValues]);

    useEffect(() => {
        if (state.success) {
            const frame = requestAnimationFrame(() => {
                formRef.current?.reset();
                setSelectedPrimaryValues([]);
                setActiveSubjectId(null);
                setOpen(false);
                router.refresh();
            });
            return () => cancelAnimationFrame(frame);
        }
    }, [router, state.success]);

    function openCreateModal() {
        setActiveSubjectId(null);
        setSelectedPrimaryValues([]);
        setOpen(true);
    }

    function openEditModal(subjectId: string) {
        const subject = subjects.find((item) => item.id === subjectId);
        setActiveSubjectId(subjectId);
        setSelectedPrimaryValues(subject?.primaryValues ?? []);
        setOpen(true);
    }

    return (
        <>
            <section className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h2 className="text-base font-semibold tracking-tight">学科管理</h2>
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                            为用户配置学科标签，并把每个学科映射到题目原始数据中的 `primary` 取值。普通用户只会看到自己学科范围内的题目。
                        </p>
                    </div>
                    <Button leftIcon={<Plus size={16} />} onClick={openCreateModal}>
                        新建学科
                    </Button>
                </div>

                {!availablePrimaryValues.length && (
                    <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm">
                        <Badge variant="warning" size="sm">
                            提示
                        </Badge>
                        <span className="text-foreground">
                            当前题目数据里还没有可识别的 `primary` 取值；导入数据后，这里会自动列出可绑定选项。
                        </span>
                    </div>
                )}

                {unmappedPrimaryValues.length ? (
                    <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                            <Badge variant="destructive" size="sm">
                                未映射
                            </Badge>
                            <span className="text-foreground">以下 `primary` 取值还没有映射到学科名称，请核对是否遗漏：</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {unmappedPrimaryValues.map((value) => (
                                <Badge key={value} variant="destructive" size="sm">
                                    {value}
                                </Badge>
                            ))}
                        </div>
                    </div>
                ) : availablePrimaryValues.length ? (
                    <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm">
                        <Badge variant="success" size="sm">
                            已核对
                        </Badge>
                        <span className="text-foreground">当前识别到的 `primary` 取值都已经映射到学科名称。</span>
                    </div>
                ) : null}

                <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <div
                        className="grid items-center gap-4 bg-muted/40 px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        style={{ gridTemplateColumns: COL_TEMPLATE }}
                    >
                        <div>学科名称</div>
                        <div>primary 映射</div>
                        <div>已绑定用户</div>
                        <div>更新时间</div>
                        <div>操作</div>
                    </div>
                    {subjects.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-muted-foreground">当前还没有学科定义。</div>
                    ) : (
                        subjects.map((subject) => (
                            <div
                                key={subject.id}
                                className="grid items-center gap-4 border-t border-border/70 px-4 py-4 text-sm"
                                style={{ gridTemplateColumns: COL_TEMPLATE }}
                            >
                                <div>
                                    <div className="font-semibold text-foreground">{subject.name}</div>
                                    {subject.description && (
                                        <div className="mt-1.5 text-xs text-muted-foreground">{subject.description}</div>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {subject.primaryValues.map((value) => (
                                        <Badge key={value} variant="primary" size="sm">
                                            {value}
                                        </Badge>
                                    ))}
                                </div>
                                <div className="text-foreground">{subject.userCount}</div>
                                <div className="text-muted-foreground">{subject.updatedAt}</div>
                                <div>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        leftIcon={<PencilLine size={14} />}
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
                onOpenChange={setOpen}
                title={activeSubject ? "编辑学科" : "创建学科"}
                description="一个学科可以映射多个 `primary` 值；用户勾选该学科后，即可看到这些题目。"
                width={720}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpen(false)} disabled={isPending}>
                            取消
                        </Button>
                        <Button form="subject-form" type="submit" loading={isPending}>
                            保存学科
                        </Button>
                    </>
                }
            >
                <form id="subject-form" ref={formRef} action={formAction} className="space-y-4">
                    {activeSubject && <input type="hidden" name="subjectId" value={activeSubject.id} />}

                    <div className="space-y-1.5">
                        <label htmlFor="subject-name" className="text-sm font-medium">
                            学科名称
                        </label>
                        <Input
                            id="subject-name"
                            name="name"
                            defaultValue={activeSubject?.name ?? ""}
                            placeholder="例如：数学、物理、金融"
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="subject-description" className="text-sm font-medium">
                            说明
                        </label>
                        <Textarea
                            id="subject-description"
                            name="description"
                            rows={3}
                            defaultValue={activeSubject?.description ?? ""}
                            placeholder="可选，用于补充学科范围说明"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="subject-primaryValues" className="text-sm font-medium">
                            绑定 primary 取值
                        </label>
                        <MultiSelect
                            id="subject-primaryValues"
                            value={selectedPrimaryValues}
                            onChange={setSelectedPrimaryValues}
                            options={primaryValueOptions}
                            placeholder="选择当前数据里的 primary 取值"
                        />
                        {selectedPrimaryValues.map((value) => (
                            <input key={value} type="hidden" name="primaryValues" value={value} />
                        ))}
                    </div>
                </form>
            </Modal>
        </>
    );
}
