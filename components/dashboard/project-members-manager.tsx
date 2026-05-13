"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Map, Settings2, Trash2, UserPlus, X } from "lucide-react";
import {
    assignProjectMemberAction,
    removeProjectMemberAction,
    type ProjectMemberFormState,
} from "@/app/actions/project-members";
import {
    deleteProjectAction,
    saveProjectFieldLabelMapAction,
} from "@/app/actions/projects";
import { useActionNotification } from "@/components/feedback/use-action-notification";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
    getProjectRoleLabel,
    getProjectRoleVariant,
} from "@/lib/auth/role-display";

type UserOption = {
    id: string;
    username: string | null;
    name: string;
    email: string | null;
    status: "ACTIVE" | "INACTIVE";
};

type ProjectMemberItem = {
    id: string;
    role: "AUTHOR" | "REVIEWER";
    joinedAt: string;
    user: {
        id: string;
        username: string | null;
        name: string;
        email: string | null;
        status: "ACTIVE" | "INACTIVE";
    };
};

type ProjectOption = {
    id: string;
    name: string;
    code: string;
    status: string;
    canManage: boolean;
    datasourcesCount: number;
    rawFieldKeys: string[];
    fieldLabelMap: Record<string, string>;
    members: ProjectMemberItem[];
};

const initialState: ProjectMemberFormState = {};
const COL_TEMPLATE = "1.1fr 0.8fr 0.8fr 1fr 0.9fr";

export function ProjectMembersManager({
    projects,
    users,
}: {
    projects: ProjectOption[];
    users: UserOption[];
}) {
    const router = useRouter();
    const toast = useToast();
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
    const [assignState, assignAction, assignPending] = useActionState(
        assignProjectMemberAction,
        initialState,
    );
    const [removeState, removeAction, removePending] = useActionState(
        removeProjectMemberAction,
        initialState,
    );
    const [isDeletePending, startDeleteTransition] = useTransition();
    const [pendingDeleteProject, setPendingDeleteProject] = useState<ProjectOption | null>(null);
    const [fieldMapProjectId, setFieldMapProjectId] = useState<string | null>(null);
    const [fieldMapDraft, setFieldMapDraft] = useState<Record<string, string>>({});
    const [isSavingFieldMap, setIsSavingFieldMap] = useState(false);

    useActionNotification(assignState, { successTitle: "成员已更新", errorTitle: "成员更新失败" });
    useActionNotification(removeState, { successTitle: "成员已移除", errorTitle: "成员移除失败" });

    function handleDeleteConfirm() {
        if (!pendingDeleteProject) return;
        const project = pendingDeleteProject;
        startDeleteTransition(async () => {
            const formData = new FormData();
            formData.append("projectId", project.id);
            const result = await deleteProjectAction({}, formData);
            if (result.success) {
                toast.success({ title: "项目已删除", description: result.success });
                router.refresh();
            }
            if (result.error) {
                toast.error({ title: "项目删除失败", description: result.error });
            }
        });
        setPendingDeleteProject(null);
    }

    const activeProject = useMemo(
        () => projects.find((p) => p.id === activeProjectId) ?? null,
        [projects, activeProjectId],
    );

    const fieldMapProject = useMemo(
        () => projects.find((p) => p.id === fieldMapProjectId) ?? null,
        [projects, fieldMapProjectId],
    );

    function openFieldMapModal(project: ProjectOption) {
        setFieldMapDraft({ ...project.fieldLabelMap });
        setFieldMapProjectId(project.id);
    }

    async function saveFieldMap() {
        if (!fieldMapProjectId) return;
        setIsSavingFieldMap(true);
        try {
            const result = await saveProjectFieldLabelMapAction({
                projectId: fieldMapProjectId,
                labelMap: fieldMapDraft,
            });
            if (result.error) {
                toast.error({ title: "保存失败", description: result.error });
                return;
            }
            toast.success({ title: "字段映射已保存", description: result.success });
            setFieldMapProjectId(null);
            router.refresh();
        } finally {
            setIsSavingFieldMap(false);
        }
    }

    return (
        <>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
                <div
                    className="grid items-center gap-4 bg-muted/40 px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    style={{ gridTemplateColumns: COL_TEMPLATE }}
                >
                    <div>项目名称</div>
                    <div>项目标识</div>
                    <div>成员数</div>
                    <div>数据源数</div>
                    <div>操作</div>
                </div>

                {projects.map((project) => (
                    <div
                        key={project.id}
                        className="grid items-center gap-4 border-t border-border/70 px-4 py-4 text-sm"
                        style={{ gridTemplateColumns: COL_TEMPLATE }}
                    >
                        <div>
                            <div className="font-semibold text-foreground">{project.name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                                当前状态：{project.status}
                            </div>
                        </div>
                        <div className="text-foreground">{project.code}</div>
                        <div className="text-foreground">{project.members.length}</div>
                        <div className="text-foreground">{project.datasourcesCount}</div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                leftIcon={<Settings2 size={14} />}
                                disabled={!project.canManage}
                                title={project.canManage ? undefined : "只能管理自己创建的项目"}
                                onClick={() => setActiveProjectId(project.id)}
                            >
                                成员管理
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                leftIcon={<Map size={14} />}
                                disabled={!project.canManage}
                                title={project.canManage ? undefined : "只能修改自己创建项目的字段映射"}
                                onClick={() => openFieldMapModal(project)}
                            >
                                字段映射
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                leftIcon={<Trash2 size={14} />}
                                loading={isDeletePending}
                                disabled={!project.canManage}
                                title={project.canManage ? undefined : "只能删除自己创建的项目"}
                                onClick={() => setPendingDeleteProject(project)}
                            >
                                删除
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            <Modal
                open={Boolean(activeProject)}
                onOpenChange={(o) => !o && setActiveProjectId(null)}
                title={activeProject ? `${activeProject.name} · 成员权限` : ""}
                description="为当前项目分配出题用户或审核用户。"
                width={880}
            >
                {activeProject && (
                    <div className="space-y-6">
                        <form action={assignAction}>
                            <input type="hidden" name="projectId" value={activeProject.id} />
                            <div className="grid items-end gap-3 md:grid-cols-[1.2fr_0.9fr_auto]">
                                <div className="space-y-1.5">
                                    <label htmlFor="userId" className="text-sm font-medium">
                                        用户
                                    </label>
                                    <Select id="userId" name="userId" defaultValue="" required>
                                        <option value="" disabled>
                                            请选择用户
                                        </option>
                                        {users.map((user) => (
                                            <option key={user.id} value={user.id}>
                                                {user.name} ({user.username ?? user.email ?? user.id})
                                            </option>
                                        ))}
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <label htmlFor="role" className="text-sm font-medium">
                                        项目角色
                                    </label>
                                    <Select id="role" name="role" defaultValue="AUTHOR">
                                        <option value="AUTHOR">出题用户</option>
                                        <option value="REVIEWER">审核用户</option>
                                    </Select>
                                </div>

                                <Button type="submit" leftIcon={<UserPlus size={14} />} loading={assignPending}>
                                    添加 / 更新
                                </Button>
                            </div>
                        </form>

                        <div className="space-y-3">
                            <div className="text-sm font-semibold text-foreground">当前成员</div>

                            {activeProject.members.length ? (
                                <div className="space-y-2">
                                    {activeProject.members.map((member) => (
                                        <div
                                            key={member.id}
                                            className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-sm"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Badge variant={getProjectRoleVariant(member.role)} size="sm">
                                                    {getProjectRoleLabel(member.role)}
                                                </Badge>
                                                <div>
                                                    <div className="font-semibold text-foreground">
                                                        {member.user.name}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {member.user.username ?? member.user.email ?? member.user.id}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-muted-foreground">
                                                    {member.joinedAt}
                                                </span>
                                                <form action={removeAction}>
                                                    <input
                                                        type="hidden"
                                                        name="membershipId"
                                                        value={member.id}
                                                    />
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        type="submit"
                                                        leftIcon={<X size={12} />}
                                                        loading={removePending}
                                                    >
                                                        移除
                                                    </Button>
                                                </form>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">当前项目还没有成员。</p>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                open={Boolean(pendingDeleteProject)}
                onOpenChange={(o) => !o && setPendingDeleteProject(null)}
                title="确认删除项目"
                description="此操作不可恢复"
                width={520}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setPendingDeleteProject(null)}>
                            取消
                        </Button>
                        <Button variant="destructive" loading={isDeletePending} onClick={handleDeleteConfirm}>
                            确认删除
                        </Button>
                    </>
                }
            >
                {pendingDeleteProject && (
                    <div className="space-y-3 text-sm leading-relaxed text-foreground">
                        <p>
                            确定要删除项目 <strong>{pendingDeleteProject.name}</strong> 吗？
                        </p>
                        <p>删除后将同时删除该项目下的所有关联数据，包括：</p>
                        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                            <li>{pendingDeleteProject.datasourcesCount} 个数据源</li>
                            <li>{pendingDeleteProject.members.length} 个成员</li>
                            <li>所有题目、审核记录、AI 审核结果等</li>
                        </ul>
                        <p className="text-destructive">此操作不可恢复，请谨慎操作。</p>
                    </div>
                )}
            </Modal>

            <Modal
                open={Boolean(fieldMapProject)}
                onOpenChange={(o) => !o && setFieldMapProjectId(null)}
                title={fieldMapProject ? `字段名称映射 · ${fieldMapProject.name}` : ""}
                description="为原始字段配置显示名称，空白则沿用原始字段名。"
                width={680}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setFieldMapProjectId(null)} disabled={isSavingFieldMap}>
                            取消
                        </Button>
                        <Button onClick={saveFieldMap} loading={isSavingFieldMap}>
                            保存映射
                        </Button>
                    </>
                }
            >
                {fieldMapProject && (
                    <div className="space-y-4">
                        <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info-soft px-3 py-2 text-sm">
                            <Badge variant="info" size="sm">
                                说明
                            </Badge>
                            <span className="text-foreground">
                                配置后，题目列表、详情页及筛选条件中将显示映射后的名称，原始字段名作为辅助标注。
                            </span>
                        </div>

                        {fieldMapProject.rawFieldKeys.length === 0 ? (
                            <EmptyState
                                title="暂无字段"
                                description="该项目暂无已导入的原始字段，请先导入数据源。"
                            />
                        ) : (
                            <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-3 px-1 text-xs font-semibold text-muted-foreground">
                                    <div>原始字段名</div>
                                    <div>显示名称</div>
                                </div>

                                {fieldMapProject.rawFieldKeys.map((key) => (
                                    <div key={key} className="grid grid-cols-2 items-center gap-3">
                                        <div
                                            className="truncate font-mono text-xs text-muted-foreground"
                                            title={key}
                                        >
                                            {key}
                                        </div>
                                        <Input
                                            value={fieldMapDraft[key] ?? ""}
                                            placeholder={key}
                                            onChange={(e) =>
                                                setFieldMapDraft((prev) => ({
                                                    ...prev,
                                                    [key]: e.target.value,
                                                }))
                                            }
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </>
    );
}
