"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Modal, Select, Space, Tag } from "antd";
import { PencilLine } from "lucide-react";
import {
    type CreateUserFormState,
    updateUserAction,
} from "@/app/actions/users";
import { useActionNotification } from "@/components/feedback/use-action-notification";
import {
    getPlatformRoleColor,
    getPlatformRoleLabel,
    getProjectRoleColor,
    getProjectRoleLabel,
} from "@/lib/auth/role-display";
import { isSuperAdminRole, type PlatformRoleValue } from "@/lib/auth/roles";

type UserItem = {
    id: string;
    username: string | null;
    name: string;
    email: string | null;
    platformRole: PlatformRoleValue;
    status: "ACTIVE" | "INACTIVE";
    ownerAdminId: string | null;
    ownerAdminName: string | null;
    createdAt: string;
    projectRoleSummary: Array<"AUTHOR" | "REVIEWER">;
    projectCount: number;
    subjectTags: Array<{
        id: string;
        name: string;
    }>;
};

const initialState: CreateUserFormState = {};

const editRoleOptionsByCurrentRole: Record<
    PlatformRoleValue,
    PlatformRoleValue[]
> = {
    SUPER_ADMIN: ["USER", "PLATFORM_ADMIN", "SUPER_ADMIN"],
    PLATFORM_ADMIN: ["USER"],
    USER: ["USER"],
};

export function UserManagementTable({
    users,
    currentPlatformRole,
    currentUserId,
    adminOptions,
    superAdminOptions,
    subjects,
}: {
    users: UserItem[];
    currentPlatformRole: PlatformRoleValue;
    currentUserId: string;
    adminOptions: Array<{
        id: string;
        name: string;
        username: string | null;
    }>;
    superAdminOptions: Array<{
        id: string;
        name: string;
        username: string | null;
    }>;
    subjects: Array<{
        id: string;
        name: string;
    }>;
}) {
    const router = useRouter();
    const [activeUserId, setActiveUserId] = useState<string | null>(null);
    const [editingPlatformRole, setEditingPlatformRole] =
        useState<PlatformRoleValue>("USER");
    const [state, formAction, isPending] = useActionState(
        updateUserAction,
        initialState,
    );
    const formRef = useRef<HTMLFormElement>(null);
    const [dialogKey, setDialogKey] = useState(0);
    const [editingSubjectIds, setEditingSubjectIds] = useState<string[]>([]);

    useActionNotification(state, {
        successTitle: "用户更新成功",
        errorTitle: "用户更新失败",
    });

    const activeUser = useMemo(
        () => users.find((user) => user.id === activeUserId) ?? null,
        [users, activeUserId],
    );
    const editablePlatformRoles =
        editRoleOptionsByCurrentRole[currentPlatformRole];
    const activeEditablePlatformRoles =
        activeUser &&
        currentPlatformRole !== "SUPER_ADMIN" &&
        activeUser.id === currentUserId
            ? [activeUser.platformRole]
            : editablePlatformRoles;

    useEffect(() => {
        if (state.success) {
            const frame = requestAnimationFrame(() => {
                formRef.current?.reset();
                setActiveUserId(null);
                setEditingPlatformRole("USER");
                setEditingSubjectIds([]);
                setDialogKey((value) => value + 1);
                router.refresh();
            });

            return () => cancelAnimationFrame(frame);
        }
    }, [router, state.success]);

    useEffect(() => {
        if (!activeUser) {
            setEditingSubjectIds([]);
            return;
        }

        setEditingSubjectIds(activeUser.subjectTags.map((subject) => subject.id));
    }, [activeUser]);

    return (
        <>
            <div className="table-surface">
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "0.95fr 0.9fr 1fr 0.8fr 1fr 1fr 1fr 0.7fr 0.8fr",
                        gap: 16,
                        padding: "14px 16px",
                        background: "rgba(248, 250, 252, 0.9)",
                        fontWeight: 700,
                    }}
                >
                    <div>用户名</div>
                    <div>姓名</div>
                    <div>邮箱</div>
                    <div>平台角色</div>
                    <div>所属管理员</div>
                    <div>学科标签</div>
                    <div>项目功能角色</div>
                    <div>状态</div>
                    <div>操作</div>
                </div>

                {users.length === 0 ? (
                    <div style={{ padding: 24 }} className="muted">
                        当前还没有用户数据。
                    </div>
                ) : (
                    users.map((user) => (
                        <div
                            key={user.id}
                            style={{
                                display: "grid",
                                gridTemplateColumns:
                                    "0.95fr 0.9fr 1fr 0.8fr 1fr 1fr 1fr 0.7fr 0.8fr",
                                gap: 16,
                                padding: "16px",
                                borderTop:
                                    "1px solid rgba(217, 224, 234, 0.85)",
                                alignItems: "center",
                            }}
                        >
                            <div style={{ fontWeight: 700 }}>
                                {user.username ?? "-"}
                            </div>
                            <div>{user.name}</div>
                            <div className="muted">{user.email ?? "-"}</div>
                            <div>
                                <Tag
                                    color={getPlatformRoleColor(
                                        user.platformRole,
                                    )}
                                >
                                    {getPlatformRoleLabel(user.platformRole)}
                                </Tag>
                            </div>
                            <div className="muted">
                                {user.platformRole !== "SUPER_ADMIN"
                                    ? user.ownerAdminName ?? "-"
                                    : "-"}
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 8,
                                    flexWrap: "wrap",
                                }}
                            >
                                {user.subjectTags.length ? (
                                    user.subjectTags.map((subject) => (
                                        <Tag key={subject.id} color="blue">
                                            {subject.name}
                                        </Tag>
                                    ))
                                ) : (
                                    <span className="muted">未分配</span>
                                )}
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 8,
                                    flexWrap: "wrap",
                                }}
                            >
                                {user.projectRoleSummary.length ? (
                                    user.projectRoleSummary.map((role) => (
                                        <Tag
                                            key={role}
                                            color={getProjectRoleColor(role)}
                                        >
                                            {getProjectRoleLabel(role)}
                                        </Tag>
                                    ))
                                ) : (
                                    <span className="muted">未分配</span>
                                )}
                            </div>
                            <div>
                                <Tag
                                    color={
                                        user.status === "ACTIVE"
                                            ? "green"
                                            : "default"
                                    }
                                >
                                    {user.status}
                                </Tag>
                            </div>
                            <div>
                                {currentPlatformRole === "SUPER_ADMIN" ||
                                user.platformRole === "USER" ||
                                user.id === currentUserId ? (
                                    <Button
                                        icon={<PencilLine size={16} />}
                                        onClick={() => {
                                            setDialogKey((value) => value + 1);
                                            setEditingPlatformRole(
                                                user.platformRole,
                                            );
                                            setActiveUserId(user.id);
                                        }}
                                    >
                                        编辑
                                    </Button>
                                ) : (
                                    <Tag>仅超级管理员可编辑</Tag>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <Modal
                open={Boolean(activeUser)}
                onCancel={() => setActiveUserId(null)}
                footer={null}
                width={640}
                destroyOnHidden
                title={
                    activeUser ? (
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>
                                编辑用户
                            </div>
                            <div
                                className="muted"
                                style={{ marginTop: 4, fontSize: 13 }}
                            >
                                超级管理员可维护管理员角色，平台管理员仅维护普通账号。项目功能角色请到项目管理页中的“成员管理”分配。
                            </div>
                        </div>
                    ) : null
                }
            >
                {activeUser ? (
                    <Space
                        key={dialogKey}
                        direction="vertical"
                        size={16}
                        style={{ width: "100%", marginTop: 8 }}
                    >
                        <form ref={formRef} action={formAction}>
                            <input
                                type="hidden"
                                name="userId"
                                value={activeUser.id}
                            />

                            <Space
                                direction="vertical"
                                size={16}
                                style={{ width: "100%" }}
                            >
                                <div>
                                    <label
                                        className="field-label"
                                        htmlFor="edit-username"
                                    >
                                        用户名
                                    </label>
                                    <Input
                                        id="edit-username"
                                        name="username"
                                        size="large"
                                        defaultValue={activeUser.username ?? ""}
                                    />
                                </div>

                                <div>
                                    <label
                                        className="field-label"
                                        htmlFor="edit-name"
                                    >
                                        姓名
                                    </label>
                                    <Input
                                        id="edit-name"
                                        name="name"
                                        size="large"
                                        defaultValue={activeUser.name}
                                    />
                                </div>

                                <div>
                                    <label
                                        className="field-label"
                                        htmlFor="edit-email"
                                    >
                                        邮箱
                                    </label>
                                    <Input
                                        id="edit-email"
                                        name="email"
                                        size="large"
                                        defaultValue={activeUser.email ?? ""}
                                    />
                                </div>

                                <div>
                                    <label
                                        className="field-label"
                                        htmlFor="edit-password"
                                    >
                                        新密码
                                    </label>
                                    <Input
                                        id="edit-password"
                                        name="password"
                                        type="password"
                                        size="large"
                                        placeholder="留空表示不修改密码"
                                    />
                                </div>

                                {editingPlatformRole !== "SUPER_ADMIN" ? (
                                    <div>
                                        <label
                                            className="field-label"
                                            htmlFor="edit-subjectIds"
                                        >
                                            学科标签
                                        </label>
                                        <Select
                                            id="edit-subjectIds"
                                            mode="multiple"
                                            size="large"
                                            value={editingSubjectIds}
                                            onChange={setEditingSubjectIds}
                                            placeholder="选择该用户可见的学科"
                                            options={subjects.map((subject) => ({
                                                value: subject.id,
                                                label: subject.name,
                                            }))}
                                            style={{ width: "100%" }}
                                            maxTagCount="responsive"
                                        />
                                        {editingSubjectIds.map((subjectId) => (
                                            <input
                                                key={subjectId}
                                                type="hidden"
                                                name="subjectIds"
                                                value={subjectId}
                                            />
                                        ))}
                                    </div>
                                ) : null}

                                <div className="member-form-grid">
                                    <div>
                                        <label
                                            className="field-label"
                                            htmlFor="edit-platformRole"
                                        >
                                            平台角色
                                        </label>
                                        <select
                                            id="edit-platformRole"
                                            name="platformRole"
                                            value={editingPlatformRole}
                                            onChange={(event) =>
                                                setEditingPlatformRole(
                                                    event.target
                                                        .value as PlatformRoleValue,
                                                )
                                            }
                                            className="field-select"
                                        >
                                            {activeEditablePlatformRoles.map(
                                                (role) => (
                                                    <option
                                                        key={role}
                                                        value={role}
                                                    >
                                                        {getPlatformRoleLabel(
                                                            role,
                                                        )}
                                                    </option>
                                                ),
                                            )}
                                        </select>
                                    </div>

                                    {currentPlatformRole === "SUPER_ADMIN" &&
                                    editingPlatformRole === "USER" ? (
                                        <div>
                                            <label
                                                className="field-label"
                                                htmlFor="edit-ownerAdminId"
                                            >
                                                所属管理员
                                            </label>
                                            <select
                                                id="edit-ownerAdminId"
                                                name="ownerAdminId"
                                                defaultValue={
                                                    activeUser.ownerAdminId ??
                                                    adminOptions[0]?.id ??
                                                    ""
                                                }
                                                className="field-select"
                                            >
                                                {adminOptions.map((admin) => (
                                                    <option
                                                        key={admin.id}
                                                        value={admin.id}
                                                    >
                                                        {admin.name}
                                                        {admin.username
                                                            ? ` (${admin.username})`
                                                            : ""}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : currentPlatformRole === "SUPER_ADMIN" &&
                                      editingPlatformRole ===
                                          "PLATFORM_ADMIN" ? (
                                        <div>
                                            <label
                                                className="field-label"
                                                htmlFor="edit-platform-ownerAdminId"
                                            >
                                                所属管理员
                                            </label>
                                            <select
                                                id="edit-platform-ownerAdminId"
                                                name="ownerAdminId"
                                                defaultValue={
                                                    activeUser.ownerAdminId ??
                                                    superAdminOptions[0]?.id ??
                                                    ""
                                                }
                                                className="field-select"
                                            >
                                                {superAdminOptions.map(
                                                    (admin) => (
                                                        <option
                                                            key={admin.id}
                                                            value={admin.id}
                                                        >
                                                            {admin.name}
                                                            {admin.username
                                                                ? ` (${admin.username})`
                                                                : ""}
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                        </div>
                                    ) : editingPlatformRole === "USER" ? (
                                        <input
                                            type="hidden"
                                            name="ownerAdminId"
                                            value={
                                                activeUser.ownerAdminId ??
                                                (currentPlatformRole ===
                                                "PLATFORM_ADMIN"
                                                    ? currentUserId
                                                    : "")
                                            }
                                        />
                                    ) : null}

                                    <div>
                                        <label
                                            className="field-label"
                                            htmlFor="edit-status"
                                        >
                                            状态
                                        </label>
                                        <select
                                            id="edit-status"
                                            name="status"
                                            defaultValue={activeUser.status}
                                            className="field-select"
                                        >
                                            <option value="ACTIVE">启用</option>
                                            <option value="INACTIVE">
                                                停用
                                            </option>
                                        </select>
                                    </div>

                                    <div className="member-form-submit">
                                        <Button
                                            type="primary"
                                            htmlType="submit"
                                            loading={isPending}
                                        >
                                            保存修改
                                        </Button>
                                    </div>
                                </div>

                                <div className="workspace-tip">
                                    <Tag color="blue">说明</Tag>
                                    <span>
                                        当前用户参与项目数：
                                        {activeUser.projectCount}。
                                        {isSuperAdminRole(currentPlatformRole)
                                            ? "超级管理员可维护管理员角色与用户归属。"
                                            : "平台管理员只可维护自己名下的普通账号。"}
                                        {editingPlatformRole !== "SUPER_ADMIN"
                                            ? " 未分配学科时，该用户将无法看到任何题目。"
                                            : ""}
                                        功能角色不在这里设置，请到项目管理页中的“成员管理”进行分配。
                                    </span>
                                </div>
                            </Space>
                        </form>
                    </Space>
                ) : null}
            </Modal>
        </>
    );
}
