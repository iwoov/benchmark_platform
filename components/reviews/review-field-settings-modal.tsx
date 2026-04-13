"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Checkbox, Empty, Input, Modal, Tag } from "antd";
import {
    ArrowDown,
    ArrowUp,
    GripVertical,
    RotateCcw,
    Search,
} from "lucide-react";
import {
    resetUserProjectReviewFieldPreferenceAction,
    saveUserProjectReviewFieldPreferenceAction,
} from "@/app/actions/review-field-preferences";
import type { ResolvedReviewFieldPreference } from "@/lib/reviews/field-preferences";

type FieldVisibilityDraft = {
    fieldOrder: string[];
    listVisibleFieldKeys: string[];
    detailVisibleFieldKeys: string[];
};

function reorderFieldKeys(fieldOrder: string[], sourceKey: string, targetKey: string) {
    if (sourceKey === targetKey) {
        return fieldOrder;
    }

    const nextFieldOrder = [...fieldOrder];
    const sourceIndex = nextFieldOrder.indexOf(sourceKey);
    const targetIndex = nextFieldOrder.indexOf(targetKey);

    if (sourceIndex < 0 || targetIndex < 0) {
        return fieldOrder;
    }

    const [movedFieldKey] = nextFieldOrder.splice(sourceIndex, 1);
    nextFieldOrder.splice(targetIndex, 0, movedFieldKey);

    return nextFieldOrder;
}

function moveField(fieldOrder: string[], fieldKey: string, direction: -1 | 1) {
    const currentIndex = fieldOrder.indexOf(fieldKey);
    const targetIndex = currentIndex + direction;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= fieldOrder.length) {
        return fieldOrder;
    }

    const nextFieldOrder = [...fieldOrder];
    const [movedFieldKey] = nextFieldOrder.splice(currentIndex, 1);
    nextFieldOrder.splice(targetIndex, 0, movedFieldKey);
    return nextFieldOrder;
}

function createDraft(fieldPreference: ResolvedReviewFieldPreference): FieldVisibilityDraft {
    return {
        fieldOrder: fieldPreference.fieldOrder,
        listVisibleFieldKeys: fieldPreference.listVisibleFieldKeys,
        detailVisibleFieldKeys: fieldPreference.detailVisibleFieldKeys,
    };
}

export function ReviewFieldSettingsModal({
    open,
    projectId,
    projectLabel,
    fieldPreference,
    onClose,
    onSaved,
}: {
    open: boolean;
    projectId: string;
    projectLabel?: string;
    fieldPreference: ResolvedReviewFieldPreference;
    onClose: () => void;
    onSaved: () => void;
}) {
    const { notification } = App.useApp();
    const [searchValue, setSearchValue] = useState("");
    const [draft, setDraft] = useState<FieldVisibilityDraft>(() =>
        createDraft(fieldPreference),
    );
    const [draggingFieldKey, setDraggingFieldKey] = useState<string | null>(null);
    const [dropTargetFieldKey, setDropTargetFieldKey] = useState<string | null>(
        null,
    );
    const [isSaving, setIsSaving] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    useEffect(() => {
        if (open) {
            setSearchValue("");
            setDraft(createDraft(fieldPreference));
            setDraggingFieldKey(null);
            setDropTargetFieldKey(null);
        }
    }, [fieldPreference, open, projectId]);

    const fieldLabelMap = useMemo(
        () =>
            Object.fromEntries(
                fieldPreference.fieldCatalog.map((field) => [field.key, field.label]),
            ) as Record<string, string>,
        [fieldPreference.fieldCatalog],
    );
    const filteredFieldKeys = useMemo(() => {
        const normalizedSearchValue = searchValue.trim().toLowerCase();

        return draft.fieldOrder.filter((fieldKey) => {
            if (!normalizedSearchValue) {
                return true;
            }

            return (
                fieldKey.toLowerCase().includes(normalizedSearchValue) ||
                (fieldLabelMap[fieldKey] ?? "")
                    .toLowerCase()
                    .includes(normalizedSearchValue)
            );
        });
    }, [draft.fieldOrder, fieldLabelMap, searchValue]);
    const listVisibleSet = useMemo(
        () => new Set(draft.listVisibleFieldKeys),
        [draft.listVisibleFieldKeys],
    );
    const detailVisibleSet = useMemo(
        () => new Set(draft.detailVisibleFieldKeys),
        [draft.detailVisibleFieldKeys],
    );

    function updateVisibility(
        fieldKey: string,
        scope: "list" | "detail",
        checked: boolean,
    ) {
        setDraft((current) => {
            const targetKey =
                scope === "list" ? "listVisibleFieldKeys" : "detailVisibleFieldKeys";
            const nextValues = checked
                ? current[targetKey].includes(fieldKey)
                    ? current[targetKey]
                    : [...current[targetKey], fieldKey]
                : current[targetKey].filter((value) => value !== fieldKey);

            return {
                ...current,
                [targetKey]: nextValues,
            };
        });
    }

    async function savePreference() {
        setIsSaving(true);

        try {
            const result = await saveUserProjectReviewFieldPreferenceAction({
                projectId,
                fieldOrder: draft.fieldOrder,
                listVisibleFieldKeys: draft.listVisibleFieldKeys,
                detailVisibleFieldKeys: draft.detailVisibleFieldKeys,
            });

            if (result.error) {
                notification.error({
                    message: "保存字段配置失败",
                    description: result.error,
                    placement: "topRight",
                });
                return;
            }

            notification.success({
                message: "字段配置已保存",
                description: result.success,
                placement: "topRight",
            });
            onSaved();
            onClose();
        } finally {
            setIsSaving(false);
        }
    }

    async function resetPreference() {
        setIsResetting(true);

        try {
            const result = await resetUserProjectReviewFieldPreferenceAction({
                projectId,
            });

            if (result.error) {
                notification.error({
                    message: "恢复默认失败",
                    description: result.error,
                    placement: "topRight",
                });
                return;
            }

            notification.success({
                message: "已恢复默认配置",
                description: result.success,
                placement: "topRight",
            });
            onSaved();
            onClose();
        } finally {
            setIsResetting(false);
        }
    }

    return (
        <Modal
            open={open}
            rootClassName="review-dialog review-field-settings-dialog"
            onCancel={onClose}
            onOk={savePreference}
            okText="保存配置"
            cancelText="取消"
            width={920}
            confirmLoading={isSaving}
            title="字段设置"
            destroyOnHidden
        >
            <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
                <div className="workspace-tip">
                    <Tag color={fieldPreference.hasSavedPreference ? "blue" : "gold"}>
                        {fieldPreference.hasSavedPreference ? "已保存配置" : "当前默认"}
                    </Tag>
                    <span>
                        {projectLabel ? `${projectLabel}：` : ""}
                        拖动调整字段顺序，并分别控制“列表显示”和“详情显示”。保存后新字段默认隐藏。
                    </span>
                </div>

                <div
                    style={{
                        display: "flex",
                        gap: 12,
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                    }}
                >
                    <Input
                        allowClear
                        size="middle"
                        placeholder="搜索字段名"
                        prefix={<Search size={16} />}
                        value={searchValue}
                        onChange={(event) => setSearchValue(event.target.value)}
                        style={{ maxWidth: 320 }}
                    />
                    <Button
                        size="middle"
                        icon={<RotateCcw size={16} />}
                        onClick={resetPreference}
                        loading={isResetting}
                        disabled={!fieldPreference.hasSavedPreference}
                    >
                        恢复默认
                    </Button>
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(240px, 1fr) 120px 120px 104px",
                        gap: 12,
                        padding: "0 12px",
                        fontSize: 12,
                        color: "var(--color-text-muted, #667085)",
                    }}
                >
                    <div>字段</div>
                    <div>列表显示</div>
                    <div>详情显示</div>
                    <div>排序</div>
                </div>

                {!filteredFieldKeys.length ? (
                    <Empty description="没有匹配的字段" />
                ) : (
                    <div
                        style={{
                            display: "grid",
                            gap: 10,
                            maxHeight: 540,
                            overflowY: "auto",
                            paddingRight: 4,
                        }}
                    >
                        {filteredFieldKeys.map((fieldKey) => {
                            const fieldLabel = fieldLabelMap[fieldKey] ?? fieldKey;
                            const fullIndex = draft.fieldOrder.indexOf(fieldKey);
                            const isDragging = draggingFieldKey === fieldKey;
                            const isDropTarget =
                                dropTargetFieldKey === fieldKey &&
                                draggingFieldKey !== fieldKey;

                            return (
                                <div
                                    key={fieldKey}
                                    draggable
                                    onDragStart={() => {
                                        setDraggingFieldKey(fieldKey);
                                        setDropTargetFieldKey(fieldKey);
                                    }}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = "move";
                                        setDropTargetFieldKey(fieldKey);
                                    }}
                                    onDrop={(event) => {
                                        event.preventDefault();

                                        if (!draggingFieldKey) {
                                            return;
                                        }

                                        setDraft((current) => ({
                                            ...current,
                                            fieldOrder: reorderFieldKeys(
                                                current.fieldOrder,
                                                draggingFieldKey,
                                                fieldKey,
                                            ),
                                        }));
                                        setDraggingFieldKey(null);
                                        setDropTargetFieldKey(null);
                                    }}
                                    onDragEnd={() => {
                                        setDraggingFieldKey(null);
                                        setDropTargetFieldKey(null);
                                    }}
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns:
                                            "minmax(240px, 1fr) 120px 120px 104px",
                                        gap: 12,
                                        alignItems: "center",
                                        padding: "14px 12px",
                                        borderRadius: 12,
                                        border: isDropTarget
                                            ? "1px solid rgba(22, 119, 255, 0.65)"
                                            : "1px solid rgba(217, 224, 234, 0.85)",
                                        background: isDragging
                                            ? "rgba(240, 247, 255, 0.95)"
                                            : "rgba(255, 255, 255, 0.96)",
                                        boxShadow: isDropTarget
                                            ? "0 0 0 3px rgba(22, 119, 255, 0.08)"
                                            : "none",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 10,
                                            minWidth: 0,
                                        }}
                                    >
                                        <GripVertical
                                            size={16}
                                            style={{ color: "#98a2b3", flexShrink: 0 }}
                                        />
                                        <div style={{ minWidth: 0 }}>
                                            <div
                                                style={{
                                                    fontWeight: 600,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                                title={fieldLabel}
                                            >
                                                {fieldLabel}
                                            </div>
                                            <div
                                                className="muted"
                                                style={{
                                                    fontSize: 12,
                                                    marginTop: 4,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                                title={fieldKey}
                                            >
                                                {fieldKey}
                                            </div>
                                        </div>
                                    </div>

                                    <Checkbox
                                        checked={listVisibleSet.has(fieldKey)}
                                        onChange={(event) =>
                                            updateVisibility(
                                                fieldKey,
                                                "list",
                                                event.target.checked,
                                            )
                                        }
                                    >
                                        列表
                                    </Checkbox>

                                    <Checkbox
                                        checked={detailVisibleSet.has(fieldKey)}
                                        onChange={(event) =>
                                            updateVisibility(
                                                fieldKey,
                                                "detail",
                                                event.target.checked,
                                            )
                                        }
                                    >
                                        详情
                                    </Checkbox>

                                    <div style={{ display: "flex", gap: 8 }}>
                                        <Button
                                            size="small"
                                            icon={<ArrowUp size={14} />}
                                            disabled={fullIndex <= 0}
                                            onClick={() =>
                                                setDraft((current) => ({
                                                    ...current,
                                                    fieldOrder: moveField(
                                                        current.fieldOrder,
                                                        fieldKey,
                                                        -1,
                                                    ),
                                                }))
                                            }
                                        />
                                        <Button
                                            size="small"
                                            icon={<ArrowDown size={14} />}
                                            disabled={
                                                fullIndex < 0 ||
                                                fullIndex >=
                                                    draft.fieldOrder.length - 1
                                            }
                                            onClick={() =>
                                                setDraft((current) => ({
                                                    ...current,
                                                    fieldOrder: moveField(
                                                        current.fieldOrder,
                                                        fieldKey,
                                                        1,
                                                    ),
                                                }))
                                            }
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Modal>
    );
}
