"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Space, Tag } from "antd";
import { KeyRound, Mail, UserRound } from "lucide-react";
import {
  type AccountFormState,
  updateOwnPasswordAction,
  updateOwnProfileAction,
} from "@/app/actions/account-settings";

type ProjectRole = "AUTHOR" | "REVIEWER" | "PROJECT_MANAGER";

const initialState: AccountFormState = {};

function roleColor(role: ProjectRole) {
  if (role === "AUTHOR") return "blue";
  if (role === "REVIEWER") return "gold";
  return "geekblue";
}

export function AccountSettingsForms({
  user,
}: {
  user: {
    username: string;
    name: string;
    email: string | null;
    platformRole: "PLATFORM_ADMIN" | "USER";
    projectRoles: ProjectRole[];
  };
}) {
  const router = useRouter();
  const passwordFormRef = useRef<HTMLFormElement>(null);
  const [profileState, profileAction, profilePending] = useActionState(
    updateOwnProfileAction,
    initialState,
  );
  const [passwordState, passwordAction, passwordPending] = useActionState(
    updateOwnPasswordAction,
    initialState,
  );

  useEffect(() => {
    if (profileState.success) {
      router.refresh();
    }
  }, [profileState.success, router]);

  useEffect(() => {
    if (passwordState.success) {
      passwordFormRef.current?.reset();
      router.refresh();
    }
  }, [passwordState.success, router]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="content-surface">
        <div className="section-head">
          <div>
            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>账户资料</h2>
            <p className="muted" style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
              修改你自己的用户名、姓名和邮箱信息。
            </p>
          </div>
          <Space size={8}>
            <Tag color="blue">{user.platformRole}</Tag>
            {user.projectRoles.length ? (
              user.projectRoles.map((role) => (
                <Tag key={role} color={roleColor(role)}>
                  {role}
                </Tag>
              ))
            ) : (
              <Tag>未分配项目角色</Tag>
            )}
          </Space>
        </div>

        {profileState.error ? <Alert type="error" message={profileState.error} showIcon /> : null}
        {profileState.success ? (
          <Alert type="success" message={profileState.success} showIcon style={{ marginTop: 12 }} />
        ) : null}

        <form action={profileAction} style={{ marginTop: 16 }}>
          <div className="settings-form-grid">
            <div>
              <label className="field-label" htmlFor="settings-username">
                用户名
              </label>
              <Input
                id="settings-username"
                name="username"
                size="large"
                defaultValue={user.username}
                prefix={<UserRound size={16} />}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="settings-name">
                姓名
              </label>
              <Input
                id="settings-name"
                name="name"
                size="large"
                defaultValue={user.name}
              />
            </div>

            <div className="settings-form-full">
              <label className="field-label" htmlFor="settings-email">
                邮箱
              </label>
              <Input
                id="settings-email"
                name="email"
                size="large"
                defaultValue={user.email ?? ""}
                prefix={<Mail size={16} />}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <Button type="primary" htmlType="submit" size="large" loading={profilePending}>
              保存资料
            </Button>
          </div>
        </form>
      </section>

      <section className="content-surface">
        <div>
          <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>修改密码</h2>
          <p className="muted" style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
            输入当前密码后，可以设置新的登录密码。
          </p>
        </div>

        {passwordState.error ? (
          <Alert type="error" message={passwordState.error} showIcon style={{ marginTop: 16 }} />
        ) : null}
        {passwordState.success ? (
          <Alert type="success" message={passwordState.success} showIcon style={{ marginTop: 16 }} />
        ) : null}

        <form ref={passwordFormRef} action={passwordAction} style={{ marginTop: 16 }}>
          <div className="settings-form-grid">
            <div className="settings-form-full">
              <label className="field-label" htmlFor="currentPassword">
                当前密码
              </label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                size="large"
                prefix={<KeyRound size={16} />}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="newPassword">
                新密码
              </label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                size="large"
                prefix={<KeyRound size={16} />}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="confirmPassword">
                确认新密码
              </label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                size="large"
                prefix={<KeyRound size={16} />}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <Button type="primary" htmlType="submit" size="large" loading={passwordPending}>
              更新密码
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
