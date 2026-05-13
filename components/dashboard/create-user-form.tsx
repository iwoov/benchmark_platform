"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
    createUserAction,
    type CreateUserFormState,
} from "@/app/actions/users";
import { useActionNotification } from "@/components/feedback/use-action-notification";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MultiSelect } from "@/components/ui/multi-select";
import { getPlatformRoleLabel } from "@/lib/auth/role-display";
import type { PlatformRoleValue } from "@/lib/auth/roles";

const initialState: CreateUserFormState = {};

const createRoleOptionsByCurrentRole: Record<PlatformRoleValue, PlatformRoleValue[]> = {
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
    adminOptions: Array<{ id: string; name: string; username: string | null }>;
    subjects: Array<{ id: string; name: string }>;
}) {
    const router = useRouter();
    const [state, formAction, isPending] = useActionState(createUserAction, initialState);
    const formRef = useRef<HTMLFormElement>(null);
    const [open, setOpen] = useState(false);
    const availablePlatformRoles = createRoleOptionsByCurrentRole[currentPlatformRole];
    const [selectedRole, setSelectedRole] = useState<PlatformRoleValue>(availablePlatformRoles[0]);
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
                size="lg"
                leftIcon={<Plus size={16} />}
                onClick={() => {
                    setSelectedRole(availablePlatformRoles[0]);
                    setSelectedSubjectIds([]);
                    setOpen(true);
                }}
            >
                新建用户
            </Button>

            <Modal
                open={open}
                onOpenChange={setOpen}
                title="创建用户"
                description="当前系统不开放公开注册。超级管理员可创建管理员账号，平台管理员仅创建普通账号；项目功能角色请到项目管理页中分配。"
                width={640}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpen(false)} disabled={isPending}>
                            取消
                        </Button>
                        <Button form="create-user-form" type="submit" loading={isPending}>
                            创建用户
                        </Button>
                    </>
                }
            >
                <form id="create-user-form" ref={formRef} action={formAction} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="username" className="text-sm font-medium text-foreground">
                            用户名
                        </label>
                        <Input id="username" name="username" placeholder="例如 reviewer.liu" autoComplete="username" required />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="name" className="text-sm font-medium text-foreground">
                            姓名
                        </label>
                        <Input id="name" name="name" placeholder="请输入姓名" required />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="email" className="text-sm font-medium text-foreground">
                            邮箱
                        </label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="可选，用于通知或后续 OAuth 绑定"
                            autoComplete="email"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="password" className="text-sm font-medium text-foreground">
                            初始密码
                        </label>
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            placeholder="至少 8 位"
                            autoComplete="new-password"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <label htmlFor="platformRole" className="text-sm font-medium text-foreground">
                                平台角色
                            </label>
                            <Select
                                id="platformRole"
                                name="platformRole"
                                value={selectedRole}
                                onChange={(e) => setSelectedRole(e.target.value as PlatformRoleValue)}
                            >
                                {availablePlatformRoles.map((role) => (
                                    <option key={role} value={role}>
                                        {getPlatformRoleLabel(role)}
                                    </option>
                                ))}
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="status" className="text-sm font-medium text-foreground">
                                状态
                            </label>
                            <Select id="status" name="status" defaultValue="ACTIVE">
                                <option value="ACTIVE">启用</option>
                                <option value="INACTIVE">停用</option>
                            </Select>
                        </div>
                    </div>

                    {selectedRole !== "SUPER_ADMIN" && (
                        <div className="space-y-1.5">
                            <label htmlFor="subjectIds" className="text-sm font-medium text-foreground">
                                学科标签
                            </label>
                            <MultiSelect
                                id="subjectIds"
                                value={selectedSubjectIds}
                                onChange={setSelectedSubjectIds}
                                placeholder="选择该用户可见的学科"
                                options={subjects.map((subject) => ({
                                    value: subject.id,
                                    label: subject.name,
                                }))}
                            />
                            {selectedSubjectIds.map((subjectId) => (
                                <input key={subjectId} type="hidden" name="subjectIds" value={subjectId} />
                            ))}
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                未分配学科的普通用户或平台管理员将看不到任何题目。学科定义可在超级管理员的"学科管理"页面维护。
                            </p>
                            {!subjects.length && (
                                <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm">
                                    <Badge variant="warning" size="sm">
                                        提示
                                    </Badge>
                                    <span className="text-foreground">
                                        当前还没有可分配的学科，请先由超级管理员创建学科并绑定 `primary` 取值。
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {currentPlatformRole === "SUPER_ADMIN" && selectedRole === "USER" && (
                        <div className="space-y-1.5">
                            <label htmlFor="ownerAdminId" className="text-sm font-medium text-foreground">
                                所属管理员
                            </label>
                            <Select id="ownerAdminId" name="ownerAdminId" defaultValue={adminOptions[0]?.id ?? ""}>
                                {adminOptions.map((admin) => (
                                    <option key={admin.id} value={admin.id}>
                                        {admin.name}
                                        {admin.username ? ` (${admin.username})` : ""}
                                    </option>
                                ))}
                            </Select>
                        </div>
                    )}

                    {currentPlatformRole === "SUPER_ADMIN" && selectedRole === "PLATFORM_ADMIN" && (
                        <div className="space-y-1.5">
                            <label htmlFor="platform-admin-owner" className="text-sm font-medium text-foreground">
                                所属管理员
                            </label>
                            <Input id="platform-admin-owner" value="当前超级管理员" disabled />
                        </div>
                    )}
                </form>
            </Modal>
        </>
    );
}
