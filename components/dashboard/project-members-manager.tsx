"use client";

import { useActionState, useMemo, useState } from "react";
import { Alert, Button, Modal, Space, Tag } from "antd";
import { Settings2, UserPlus, X } from "lucide-react";
import {
  assignProjectMemberAction,
  removeProjectMemberAction,
  type ProjectMemberFormState,
} from "@/app/actions/project-members";
import {
  getProjectRoleColor,
  getProjectRoleLabel,
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
  role: "AUTHOR" | "REVIEWER" | "PROJECT_MANAGER";
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
  datasourcesCount: number;
  members: ProjectMemberItem[];
};

const initialState: ProjectMemberFormState = {};

export function ProjectMembersManager({
  projects,
  users,
  canManageProjectManagerRole = true,
}: {
  projects: ProjectOption[];
  users: UserOption[];
  canManageProjectManagerRole?: boolean;
}) {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [assignState, assignAction, assignPending] = useActionState(
    assignProjectMemberAction,
    initialState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeProjectMemberAction,
    initialState,
  );

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  return (
    <>
      <div className="table-surface">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 0.8fr 0.8fr 1fr 0.9fr",
            gap: 16,
            padding: "14px 16px",
            background: "rgba(248, 250, 252, 0.9)",
            fontWeight: 700,
          }}
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
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 0.8fr 0.8fr 1fr 0.9fr",
              gap: 16,
              padding: "16px",
              borderTop: "1px solid rgba(217, 224, 234, 0.85)",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>{project.name}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                当前状态：{project.status}
              </div>
            </div>
            <div>{project.code}</div>
            <div>{project.members.length}</div>
            <div>{project.datasourcesCount}</div>
            <div>
              <Button
                icon={<Settings2 size={16} />}
                onClick={() => setActiveProjectId(project.id)}
              >
                成员管理
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={Boolean(activeProject)}
        onCancel={() => setActiveProjectId(null)}
        footer={null}
        width={880}
        destroyOnHidden
        title={
          activeProject ? (
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {activeProject.name} · 成员权限
              </div>
              <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                {canManageProjectManagerRole
                  ? "为当前项目分配项目负责人、出题用户或审核用户。"
                  : "为当前项目分配出题用户或审核用户。项目负责人角色仍由平台管理员维护。"}
              </div>
            </div>
          ) : null
        }
      >
        {activeProject ? (
          <div style={{ display: "grid", gap: 20, marginTop: 8 }}>
            {assignState.error ? (
              <Alert type="error" message={assignState.error} showIcon />
            ) : null}
            {assignState.success ? (
              <Alert type="success" message={assignState.success} showIcon />
            ) : null}
            {removeState.error ? (
              <Alert type="error" message={removeState.error} showIcon />
            ) : null}
            {removeState.success ? (
              <Alert type="success" message={removeState.success} showIcon />
            ) : null}

            <form action={assignAction}>
              <input type="hidden" name="projectId" value={activeProject.id} />
              <div className="member-form-grid">
                <div>
                  <label className="field-label" htmlFor="userId">
                    用户
                  </label>
                  <select
                    id="userId"
                    name="userId"
                    defaultValue=""
                    className="field-select"
                  >
                    <option value="" disabled>
                      请选择用户
                    </option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.username ?? user.email ?? user.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="field-label" htmlFor="role">
                    项目角色
                  </label>
                  <select
                    id="role"
                    name="role"
                    defaultValue="AUTHOR"
                    className="field-select"
                  >
                    <option value="AUTHOR">出题用户</option>
                    <option value="REVIEWER">审核用户</option>
                    {canManageProjectManagerRole ? (
                      <option value="PROJECT_MANAGER">项目负责人</option>
                    ) : null}
                  </select>
                </div>

                <div className="member-form-submit">
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<UserPlus size={16} />}
                    loading={assignPending}
                  >
                    添加 / 更新成员
                  </Button>
                </div>
              </div>
            </form>

            <div>
              <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 700 }}>
                当前成员
              </div>

              {!canManageProjectManagerRole ? (
                <div className="workspace-tip" style={{ marginBottom: 12 }}>
                  <Tag color="blue">说明</Tag>
                  <span>
                    项目负责人可以维护自己项目中的出题用户和审核用户，项目负责人角色的新增与调整仍由平台管理员处理。
                  </span>
                </div>
              ) : null}

              {activeProject.members.length ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {activeProject.members.map((member) => (
                    <div
                      key={member.id}
                      className="workspace-tip"
                      style={{ justifyContent: "space-between" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <Tag color={getProjectRoleColor(member.role)}>
                          {getProjectRoleLabel(member.role)}
                        </Tag>
                        <div>
                          <div style={{ fontWeight: 700 }}>
                            {member.user.name}
                          </div>
                          <div className="muted">
                            {member.user.username ??
                              member.user.email ??
                              member.user.id}
                          </div>
                        </div>
                      </div>

                      <Space size={12}>
                        <span className="muted">{member.joinedAt}</span>
                        {canManageProjectManagerRole ||
                        member.role !== "PROJECT_MANAGER" ? (
                          <form action={removeAction}>
                            <input
                              type="hidden"
                              name="membershipId"
                              value={member.id}
                            />
                            <Button
                              danger
                              htmlType="submit"
                              icon={<X size={14} />}
                              loading={removePending}
                            >
                              移除
                            </Button>
                          </form>
                        ) : (
                          <Tag>平台管理员维护</Tag>
                        )}
                      </Space>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted">当前项目还没有成员。</div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
