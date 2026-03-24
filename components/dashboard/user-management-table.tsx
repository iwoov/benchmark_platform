"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Modal, Space, Tag } from "antd";
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
    createdAt: string;
    projectRoleSummary: Array<"AUTHOR" | "REVIEWER">;
    projectCount: number;
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
}: {
    users: UserItem[];
    currentPlatformRole: PlatformRoleValue;
}) {
    const router = useRouter();
    const [activeUserId, setActiveUserId] = useState<string | null>(null);
    const [state, formAction, isPending] = useActionState(
        updateUserAction,
        initialState,
    );
    const formRef = useRef<HTMLFormElement>(null);
    const [dialogKey, setDialogKey] = useState(0);

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

    useEffect(() => {
        if (state.success) {
            const frame = requestAnimationFrame(() => {
                formRef.current?.reset();
                setActiveUserId(null);
                setDialogKey((value) => value + 1);
                router.refresh();
            });

            return () => cancelAnimationFrame(frame);
        }
    }, [router, state.success]);

    return (
        <>
            <div className="table-surface">
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "1fr 0.95fr 1.15fr 0.9fr 1.15fr 0.7fr 0.9fr",
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
                                    "1fr 0.95fr 1.15fr 0.9fr 1.15fr 0.7fr 0.9fr",
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
                                user.platformRole === "USER" ? (
                                    <Button
                                        icon={<PencilLine size={16} />}
                                        onClick={() => {
                                            setDialogKey((value) => value + 1);
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
                                            defaultValue={
                                                activeUser.platformRole
                                            }
                                            className="field-select"
                                        >
                                            {editablePlatformRoles.map(
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
                                            ? "超级管理员可维护管理员角色。"
                                            : "平台管理员只可维护普通账号。"}
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
