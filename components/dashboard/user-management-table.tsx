"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilLine } from "lucide-react";
import { type CreateUserFormState, updateUserAction } from "@/app/actions/users";
import { useActionNotification } from "@/components/feedback/use-action-notification";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MultiSelect } from "@/components/ui/multi-select";
import {
    getPlatformRoleLabel,
    getPlatformRoleVariant,
    getProjectRoleLabel,
    getProjectRoleVariant,
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
    subjectTags: Array<{ id: string; name: string }>;
};

const initialState: CreateUserFormState = {};

const editRoleOptionsByCurrentRole: Record<PlatformRoleValue, PlatformRoleValue[]> = {
    SUPER_ADMIN: ["USER", "PLATFORM_ADMIN", "SUPER_ADMIN"],
    PLATFORM_ADMIN: ["USER"],
    USER: ["USER"],
};

const COL_TEMPLATE = "0.95fr 0.9fr 1fr 0.8fr 1fr 1fr 1fr 0.7fr 0.8fr";

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
    adminOptions: Array<{ id: string; name: string; username: string | null }>;
    superAdminOptions: Array<{ id: string; name: string; username: string | null }>;
    subjects: Array<{ id: string; name: string }>;
}) {
    const router = useRouter();
    const [activeUserId, setActiveUserId] = useState<string | null>(null);
    const [editingPlatformRole, setEditingPlatformRole] = useState<PlatformRoleValue>("USER");
    const [state, formAction, isPending] = useActionState(updateUserAction, initialState);
    const formRef = useRef<HTMLFormElement>(null);
    const [editingSubjectIds, setEditingSubjectIds] = useState<string[]>([]);

    useActionNotification(state, {
        successTitle: "用户更新成功",
        errorTitle: "用户更新失败",
    });

    const activeUser = useMemo(
        () => users.find((user) => user.id === activeUserId) ?? null,
        [users, activeUserId],
    );
    const editablePlatformRoles = editRoleOptionsByCurrentRole[currentPlatformRole];
    const activeEditablePlatformRoles =
        activeUser && currentPlatformRole !== "SUPER_ADMIN" && activeUser.id === currentUserId
            ? [activeUser.platformRole]
            : editablePlatformRoles;

    useEffect(() => {
        if (state.success) {
            const frame = requestAnimationFrame(() => {
                formRef.current?.reset();
                setActiveUserId(null);
                setEditingPlatformRole("USER");
                setEditingSubjectIds([]);
                router.refresh();
            });
            return () => cancelAnimationFrame(frame);
        }
    }, [router, state.success]);

    return (
        <>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
                <div
                    className="grid items-center gap-4 bg-muted/40 px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    style={{ gridTemplateColumns: COL_TEMPLATE }}
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
                    <div className="px-4 py-6 text-sm text-muted-foreground">当前还没有用户数据。</div>
                ) : (
                    users.map((user) => (
                        <div
                            key={user.id}
                            className="grid items-center gap-4 border-t border-border/70 px-4 py-3.5 text-sm"
                            style={{ gridTemplateColumns: COL_TEMPLATE }}
                        >
                            <div className="font-semibold text-foreground">{user.username ?? "-"}</div>
                            <div className="text-foreground">{user.name}</div>
                            <div className="text-muted-foreground">{user.email ?? "-"}</div>
                            <div>
                                <Badge variant={getPlatformRoleVariant(user.platformRole)} size="sm">
                                    {getPlatformRoleLabel(user.platformRole)}
                                </Badge>
                            </div>
                            <div className="text-muted-foreground">
                                {user.platformRole !== "SUPER_ADMIN" ? (user.ownerAdminName ?? "-") : "-"}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {user.subjectTags.length ? (
                                    user.subjectTags.map((subject) => (
                                        <Badge key={subject.id} variant="primary" size="sm">
                                            {subject.name}
                                        </Badge>
                                    ))
                                ) : (
                                    <span className="text-muted-foreground">未分配</span>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {user.projectRoleSummary.length ? (
                                    user.projectRoleSummary.map((role) => (
                                        <Badge key={role} variant={getProjectRoleVariant(role)} size="sm">
                                            {getProjectRoleLabel(role)}
                                        </Badge>
                                    ))
                                ) : (
                                    <span className="text-muted-foreground">未分配</span>
                                )}
                            </div>
                            <div>
                                <Badge variant={user.status === "ACTIVE" ? "success" : "default"} size="sm" dot>
                                    {user.status}
                                </Badge>
                            </div>
                            <div>
                                {currentPlatformRole === "SUPER_ADMIN" ||
                                user.platformRole === "USER" ||
                                user.id === currentUserId ? (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        leftIcon={<PencilLine size={14} />}
                                        onClick={() => {
                                            setEditingPlatformRole(user.platformRole);
                                            setEditingSubjectIds(user.subjectTags.map((s) => s.id));
                                            setActiveUserId(user.id);
                                        }}
                                    >
                                        编辑
                                    </Button>
                                ) : (
                                    <Badge variant="outline" size="sm">
                                        仅超级管理员可编辑
                                    </Badge>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <Modal
                open={Boolean(activeUser)}
                onOpenChange={(o) => !o && setActiveUserId(null)}
                title="编辑用户"
                description={'超级管理员可维护管理员角色，平台管理员仅维护普通账号。项目功能角色请到项目管理页中的「成员管理」分配。'}
                width={640}
                footer={
                    activeUser ? (
                        <>
                            <Button variant="secondary" onClick={() => setActiveUserId(null)} disabled={isPending}>
                                取消
                            </Button>
                            <Button form="edit-user-form" type="submit" loading={isPending}>
                                保存修改
                            </Button>
                        </>
                    ) : null
                }
            >
                {activeUser && (
                    <form id="edit-user-form" ref={formRef} action={formAction} className="space-y-4">
                        <input type="hidden" name="userId" value={activeUser.id} />

                        <div className="space-y-1.5">
                            <label htmlFor="edit-username" className="text-sm font-medium">
                                用户名
                            </label>
                            <Input id="edit-username" name="username" defaultValue={activeUser.username ?? ""} />
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="edit-name" className="text-sm font-medium">
                                姓名
                            </label>
                            <Input id="edit-name" name="name" defaultValue={activeUser.name} />
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="edit-email" className="text-sm font-medium">
                                邮箱
                            </label>
                            <Input id="edit-email" name="email" defaultValue={activeUser.email ?? ""} />
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="edit-password" className="text-sm font-medium">
                                新密码
                            </label>
                            <Input id="edit-password" name="password" type="password" placeholder="留空表示不修改密码" />
                        </div>

                        {editingPlatformRole !== "SUPER_ADMIN" && (
                            <div className="space-y-1.5">
                                <label htmlFor="edit-subjectIds" className="text-sm font-medium">
                                    学科标签
                                </label>
                                <MultiSelect
                                    id="edit-subjectIds"
                                    value={editingSubjectIds}
                                    onChange={setEditingSubjectIds}
                                    placeholder="选择该用户可见的学科"
                                    options={subjects.map((s) => ({ value: s.id, label: s.name }))}
                                />
                                {editingSubjectIds.map((subjectId) => (
                                    <input key={subjectId} type="hidden" name="subjectIds" value={subjectId} />
                                ))}
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div className="space-y-1.5">
                                <label htmlFor="edit-platformRole" className="text-sm font-medium">
                                    平台角色
                                </label>
                                <Select
                                    id="edit-platformRole"
                                    name="platformRole"
                                    value={editingPlatformRole}
                                    onChange={(e) => setEditingPlatformRole(e.target.value as PlatformRoleValue)}
                                >
                                    {activeEditablePlatformRoles.map((role) => (
                                        <option key={role} value={role}>
                                            {getPlatformRoleLabel(role)}
                                        </option>
                                    ))}
                                </Select>
                            </div>

                            {currentPlatformRole === "SUPER_ADMIN" && editingPlatformRole === "USER" ? (
                                <div className="space-y-1.5">
                                    <label htmlFor="edit-ownerAdminId" className="text-sm font-medium">
                                        所属管理员
                                    </label>
                                    <Select
                                        id="edit-ownerAdminId"
                                        name="ownerAdminId"
                                        defaultValue={activeUser.ownerAdminId ?? adminOptions[0]?.id ?? ""}
                                    >
                                        {adminOptions.map((admin) => (
                                            <option key={admin.id} value={admin.id}>
                                                {admin.name}
                                                {admin.username ? ` (${admin.username})` : ""}
                                            </option>
                                        ))}
                                    </Select>
                                </div>
                            ) : currentPlatformRole === "SUPER_ADMIN" && editingPlatformRole === "PLATFORM_ADMIN" ? (
                                <div className="space-y-1.5">
                                    <label htmlFor="edit-platform-ownerAdminId" className="text-sm font-medium">
                                        所属管理员
                                    </label>
                                    <Select
                                        id="edit-platform-ownerAdminId"
                                        name="ownerAdminId"
                                        defaultValue={activeUser.ownerAdminId ?? superAdminOptions[0]?.id ?? ""}
                                    >
                                        {superAdminOptions.map((admin) => (
                                            <option key={admin.id} value={admin.id}>
                                                {admin.name}
                                                {admin.username ? ` (${admin.username})` : ""}
                                            </option>
                                        ))}
                                    </Select>
                                </div>
                            ) : editingPlatformRole === "USER" ? (
                                <input
                                    type="hidden"
                                    name="ownerAdminId"
                                    value={
                                        activeUser.ownerAdminId ??
                                        (currentPlatformRole === "PLATFORM_ADMIN" ? currentUserId : "")
                                    }
                                />
                            ) : null}

                            <div className="space-y-1.5">
                                <label htmlFor="edit-status" className="text-sm font-medium">
                                    状态
                                </label>
                                <Select id="edit-status" name="status" defaultValue={activeUser.status}>
                                    <option value="ACTIVE">启用</option>
                                    <option value="INACTIVE">停用</option>
                                </Select>
                            </div>
                        </div>

                        <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info-soft px-3 py-2 text-sm">
                            <Badge variant="info" size="sm">
                                说明
                            </Badge>
                            <span className="text-foreground">
                                当前用户参与项目数：{activeUser.projectCount}。
                                {isSuperAdminRole(currentPlatformRole)
                                    ? "超级管理员可维护管理员角色与用户归属。"
                                    : "平台管理员只可维护自己名下的普通账号。"}
                                {editingPlatformRole !== "SUPER_ADMIN" ? " 未分配学科时，该用户将无法看到任何题目。" : ""}
                                功能角色不在这里设置，请到项目管理页中的「成员管理」进行分配。
                            </span>
                        </div>
                    </form>
                )}
            </Modal>
        </>
    );
}
