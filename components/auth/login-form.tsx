"use client";

import Image from "next/image";
import { useActionState } from "react";
import { LockKeyhole, UserRound } from "lucide-react";
import { loginAction, type LoginFormState } from "@/app/actions/auth";
import { useActionNotification } from "@/components/feedback/use-action-notification";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const initialState: LoginFormState = {};

export function LoginForm() {
    const [state, formAction, isPending] = useActionState(loginAction, initialState);

    useActionNotification(state, { errorTitle: "登录失败" });

    return (
        <Card className="border-border/80 shadow-xl">
            <CardContent className="space-y-6 px-7 py-8">
                <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-lg border border-border/70 bg-white shadow-md">
                        <Image src="/icon.svg" alt="" width={28} height={28} priority aria-hidden />
                    </span>
                    <div className="leading-tight">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            EvalCheck
                        </p>
                        <h2 className="text-xl font-semibold tracking-tight text-foreground">
                            登录后台
                        </h2>
                    </div>
                </div>

                <p className="text-sm text-muted-foreground">输入账号和密码继续。</p>

                <form action={formAction} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="identifier" className="text-sm font-medium text-foreground">
                            用户名 / 邮箱
                        </label>
                        <Input
                            id="identifier"
                            name="identifier"
                            placeholder="admin 或 admin@example.com"
                            autoComplete="username"
                            leftIcon={<UserRound size={15} />}
                            className="h-11"
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="password" className="text-sm font-medium text-foreground">
                            密码
                        </label>
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            placeholder="请输入密码"
                            autoComplete="current-password"
                            leftIcon={<LockKeyhole size={15} />}
                            className="h-11"
                            required
                        />
                    </div>

                    <Button type="submit" size="lg" loading={isPending} block>
                        登录
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
