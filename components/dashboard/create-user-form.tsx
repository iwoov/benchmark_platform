"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Modal, Select, Space, Tag } from "antd";
import { KeyRound, Mail, Plus, UserRound } from "lucide-react";
import {
    createUserAction,
    type CreateUserFormState,
} from "@/app/actions/users";
import { useActionNotification } from "@/components/feedback/use-action-notification";
import { getPlatformRoleLabel } from "@/lib/auth/role-display";
import type { PlatformRoleValue } from "@/lib/auth/roles";

const initialState: CreateUserFormState = {};

const createRoleOptionsByCurrentRole: Record<
    PlatformRoleValue,
    PlatformRoleValue[]
> = {
    SUPER_ADMIN: ["USER", "PLATFORM_ADMIN", "SUPER_ADMIN"],
    PLATFORM_ADMIN: ["USER"],
    USER: ["USER"],
};

export function CreateUserForm({
    currentPlatformRole,
    adminOptions,
    subjects,
}: {
    currentPlatformRole: PlatformRoleValue;
    adminOptions: Array<{
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
    const [state, formAction, isPending] = useActionState(
        createUserAction,
        initialState,
    );
    const formRef = useRef<HTMLFormElement>(null);
    const [open, setOpen] = useState(false);
    const [dialogKey, setDialogKey] = useState(0);
    const availablePlatformRoles =
        createRoleOptionsByCurrentRole[currentPlatformRole];
    const [selectedRole, setSelectedRole] = useState<PlatformRoleValue>(
        availablePlatformRoles[0],
    );
    const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);

    useActionNotification(state, {
        successTitle: "用户创建成功",
        errorTitle: "用户创建失败",
    });

    useEffect(() => {
        if (state.success) {
            const frame = requestAnimationFrame(() => {
                formRef.current?.reset();
                setOpen(false);
                setDialogKey((value) => value + 1);
                setSelectedRole(availablePlatformRoles[0]);
                setSelectedSubjectIds([]);
                router.refresh();
            });

            return () => cancelAnimationFrame(frame);
        }
    }, [availablePlatformRoles, router, state.success]);

    return (
        <>
            <Button
                type="primary"
                size="large"
                icon={<Plus size={16} />}
                onClick={() => {
                    setDialogKey((value) => value + 1);
                    setSelectedRole(availablePlatformRoles[0]);
                    setSelectedSubjectIds([]);
                    setOpen(true);
                }}
            >
                新建用户
            </Button>

            <Modal
                open={open}
                onCancel={() => setOpen(false)}
                footer={null}
                width={640}
                destroyOnHidden
                title={
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>
                            创建用户
                        </div>
                        <div
                            className="muted"
                            style={{ marginTop: 4, fontSize: 13 }}
                        >
                            当前系统不开放公开注册。超级管理员可创建管理员账号，平台管理员仅创建普通账号；项目功能角色请到项目管理页中分配。
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
                        <Space
                            direction="vertical"
                            size={16}
                            style={{ width: "100%" }}
                        >
                            <div>
                                <label
                                    htmlFor="username"
                                    style={{
                                        display: "block",
                                        marginBottom: 8,
                                        fontWeight: 600,
                                    }}
                                >
                                    用户名
                                </label>
                                <Input
                                    id="username"
                                    name="username"
                                    size="large"
                                    prefix={<UserRound size={16} />}
                                    placeholder="例如 reviewer.liu"
                                    autoComplete="username"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="name"
                                    style={{
                                        display: "block",
                                        marginBottom: 8,
                                        fontWeight: 600,
                                    }}
                                >
                                    姓名
                                </label>
                                <Input
                                    id="name"
                                    name="name"
                                    size="large"
                                    placeholder="请输入姓名"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="email"
                                    style={{
                                        display: "block",
                                        marginBottom: 8,
                                        fontWeight: 600,
                                    }}
                                >
                                    邮箱
                                </label>
                                <Input
                                    id="email"
                                    name="email"
                                    size="large"
                                    prefix={<Mail size={16} />}
                                    placeholder="可选，用于通知或后续 OAuth 绑定"
                                    autoComplete="email"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="password"
                                    style={{
                                        display: "block",
                                        marginBottom: 8,
                                        fontWeight: 600,
                                    }}
                                >
                                    初始密码
                                </label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    size="large"
                                    prefix={<KeyRound size={16} />}
                                    placeholder="至少 8 位"
                                    autoComplete="new-password"
                                />
                            </div>

                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                        "repeat(2, minmax(0, 1fr))",
                                    gap: 16,
                                }}
                            >
                                <div>
                                    <label
                                        htmlFor="platformRole"
                                        style={{
                                            display: "block",
                                            marginBottom: 8,
                                            fontWeight: 600,
                                        }}
                                    >
                                        平台角色
                                    </label>
                                    <select
                                        id="platformRole"
                                        name="platformRole"
                                        value={selectedRole}
                                        onChange={(event) =>
                                            setSelectedRole(
                                                event.target
                                                    .value as PlatformRoleValue,
                                            )
                                        }
                                        className="field-select"
                                    >
                                        {availablePlatformRoles.map((role) => (
                                            <option key={role} value={role}>
                                                {getPlatformRoleLabel(role)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label
                                        htmlFor="status"
                                        style={{
                                            display: "block",
                                            marginBottom: 8,
                                            fontWeight: 600,
                                        }}
                                    >
                                        状态
                                    </label>
                                    <select
                                        id="status"
                                        name="status"
                                        defaultValue="ACTIVE"
                                        className="field-select"
                                    >
                                        <option value="ACTIVE">启用</option>
                                        <option value="INACTIVE">停用</option>
                                    </select>
                                </div>
                            </div>

                            {selectedRole !== "SUPER_ADMIN" ? (
                                <div>
                                    <label
                                        htmlFor="subjectIds"
                                        style={{
                                            display: "block",
                                            marginBottom: 8,
                                            fontWeight: 600,
                                        }}
                                    >
                                        学科标签
                                    </label>
                                    <Select
                                        id="subjectIds"
                                        mode="multiple"
                                        size="large"
                                        value={selectedSubjectIds}
                                        onChange={setSelectedSubjectIds}
                                        placeholder="选择该用户可见的学科"
                                        options={subjects.map((subject) => ({
                                            value: subject.id,
                                            label: subject.name,
                                        }))}
                                        style={{ width: "100%" }}
                                        maxTagCount="responsive"
                                    />
                                    {selectedSubjectIds.map((subjectId) => (
                                        <input
                                            key={subjectId}
                                            type="hidden"
                                            name="subjectIds"
                                            value={subjectId}
                                        />
                                    ))}
                                    <div
                                        className="muted"
                                        style={{
                                            marginTop: 8,
                                            fontSize: 12,
                                            lineHeight: 1.6,
                                        }}
                                    >
                                        未分配学科的普通用户或平台管理员将看不到任何题目。学科定义可在超级管理员的“学科管理”页面维护。
                                    </div>
                                    {!subjects.length ? (
                                        <div
                                            className="workspace-tip"
                                            style={{ marginTop: 12 }}
                                        >
                                            <Tag color="gold">提示</Tag>
                                            <span>
                                                当前还没有可分配的学科，请先由超级管理员创建学科并绑定
                                                `primary` 取值。
                                            </span>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}

                            {currentPlatformRole === "SUPER_ADMIN" &&
                            selectedRole === "USER" ? (
                                <div>
                                    <label
                                        htmlFor="ownerAdminId"
                                        style={{
                                            display: "block",
                                            marginBottom: 8,
                                            fontWeight: 600,
                                        }}
                                    >
                                        所属管理员
                                    </label>
                                    <select
                                        id="ownerAdminId"
                                        name="ownerAdminId"
                                        defaultValue={adminOptions[0]?.id ?? ""}
                                        className="field-select"
                                    >
                                        {adminOptions.map((admin) => (
                                            <option key={admin.id} value={admin.id}>
                                                {admin.name}
                                                {admin.username
                                                    ? ` (${admin.username})`
                                                    : ""}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : currentPlatformRole === "SUPER_ADMIN" &&
                              selectedRole === "PLATFORM_ADMIN" ? (
                                <div>
                                    <label
                                        htmlFor="platform-admin-owner"
                                        style={{
                                            display: "block",
                                            marginBottom: 8,
                                            fontWeight: 600,
                                        }}
                                    >
                                        所属管理员
                                    </label>
                                    <Input
                                        id="platform-admin-owner"
                                        size="large"
                                        value="当前超级管理员"
                                        disabled
                                    />
                                </div>
                            ) : null}

                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "flex-end",
                                    gap: 12,
                                    marginTop: 8,
                                }}
                            >
                                <Button
                                    size="large"
                                    onClick={() => setOpen(false)}
                                >
                                    取消
                                </Button>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    size="large"
                                    loading={isPending}
                                >
                                    创建用户
                                </Button>
                            </div>
                        </Space>
                    </form>
                </Space>
            </Modal>
        </>
    );
}
