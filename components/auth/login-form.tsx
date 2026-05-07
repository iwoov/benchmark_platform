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
                <Space direction="vertical" size={6}>
                    <h2 style={{ margin: 0, fontSize: 34, lineHeight: 1.05 }}>
                        登录后台
                    </h2>
                    <p
                        className="muted"
                        style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}
                    >
                        输入账号和密码继续。
                    </p>
                </Space>

                <form action={formAction}>
                    <Space
                        direction="vertical"
                        size={18}
                        style={{ width: "100%" }}
                    >
                        <div>
                            <label
                                htmlFor="identifier"
                                style={{
                                    display: "block",
                                    marginBottom: 8,
                                    fontWeight: 600,
                                }}
                            >
                                用户名 / 邮箱
                            </label>
                            <div className="login-input-shell">
                                <UserRound
                                    className="login-input-icon"
                                    size={16}
                                    aria-hidden="true"
                                />
                                <Input
                                    id="identifier"
                                    name="identifier"
                                    size="large"
                                    className="login-input-control"
                                    placeholder="admin 或 admin@example.com"
                                    autoComplete="username"
                                />
                            </div>
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
                                密码
                            </label>
                            <div className="login-input-shell">
                                <LockKeyhole
                                    className="login-input-icon"
                                    size={16}
                                    aria-hidden="true"
                                />
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    size="large"
                                    className="login-input-control"
                                    placeholder="请输入密码"
                                    autoComplete="current-password"
                                />
                            </div>
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
            </Space>
        </Card>
    );
}
