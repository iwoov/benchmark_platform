"use client";

import { useActionState } from "react";
import { Button, Card, Input, Space } from "antd";
import { LockKeyhole, UserRound } from "lucide-react";
import { loginAction, type LoginFormState } from "@/app/actions/auth";
import { useActionNotification } from "@/components/feedback/use-action-notification";

const initialState: LoginFormState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState,
  );

  useActionNotification(state, {
    errorTitle: "登录失败",
  });

  return (
    <Card
      className="panel login-form-card"
      styles={{
        body: {
          padding: 28,
        },
      }}
    >
      <Space direction="vertical" size={24} style={{ width: "100%" }}>
        <Space direction="vertical" size={8}>
          <div style={{ color: "var(--muted)", fontWeight: 700, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Benchmark Platform
          </div>
          <h2 style={{ margin: 0, fontSize: 32, lineHeight: 1.1 }}>登录后台</h2>
          <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
            一期先使用平台内账号密码登录，钉钉 OAuth 后续接入。
          </p>
        </Space>

        <form action={formAction}>
          <Space direction="vertical" size={18} style={{ width: "100%" }}>
            <div>
              <label
                htmlFor="identifier"
                style={{ display: "block", marginBottom: 8, fontWeight: 600 }}
              >
                用户名 / 邮箱
              </label>
              <Input
                id="identifier"
                name="identifier"
                size="large"
                prefix={<UserRound size={16} />}
                placeholder="admin 或 admin@example.com"
                autoComplete="username"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                style={{ display: "block", marginBottom: 8, fontWeight: 600 }}
              >
                密码
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                size="large"
                prefix={<LockKeyhole size={16} />}
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </div>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              loading={isPending}
              block
            >
              登录
            </Button>
          </Space>
        </form>

        <Card
          className="login-hint-card"
        >
          <div style={{ fontWeight: 700 }}>管理员账号</div>
          <p
            style={{
              margin: "8px 0 0",
              color: "var(--muted)",
              lineHeight: 1.7,
            }}
          >
            账号由 `.env` 中的 `ADMIN_USERNAME`、`ADMIN_EMAIL` 和
            `ADMIN_PASSWORD` 控制。
          </p>
        </Card>
      </Space>
    </Card>
  );
}
