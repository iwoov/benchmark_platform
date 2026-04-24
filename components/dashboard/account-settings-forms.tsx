"use client";

import {
    useActionState,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { useRouter } from "next/navigation";
import { App, Button, Input, Select, Space, Tag } from "antd";
import { BookOpen, KeyRound, Mail, UserRound } from "lucide-react";
import {
    type AccountFormState,
    getDistinctSubjectsAction,
    updateOwnPasswordAction,
    updateOwnProfileAction,
    updateSubjectPreferencesAction,
} from "@/app/actions/account-settings";
import { useActionNotification } from "@/components/feedback/use-action-notification";
import {
    getPlatformRoleColor,
    getPlatformRoleLabel,
    getProjectRoleColor,
    getProjectRoleLabel,
} from "@/lib/auth/role-display";
import type { PlatformRoleValue, ProjectRoleValue } from "@/lib/auth/roles";

const initialState: AccountFormState = {};

export function AccountSettingsForms({
    user,
}: {
    user: {
        username: string;
        name: string;
        email: string | null;
        platformRole: PlatformRoleValue;
        projectRoles: ProjectRoleValue[];
        subjectPreferences: string[];
    };
}) {
    const router = useRouter();
    const { notification } = App.useApp();
    const passwordFormRef = useRef<HTMLFormElement>(null);
    const [subjectOptions, setSubjectOptions] = useState<
        Array<{ value: string; label: string }>
    >([]);
    const [selectedSubjects, setSelectedSubjects] = useState<string[]>(
        user.subjectPreferences,
    );
    const [subjectLoading, setSubjectLoading] = useState(false);
    const [subjectSaving, setSubjectSaving] = useState(false);
    const [profileState, profileAction, profilePending] = useActionState(
        updateOwnProfileAction,
        initialState,
    );
    const [passwordState, passwordAction, passwordPending] = useActionState(
        updateOwnPasswordAction,
        initialState,
    );

    useActionNotification(profileState, {
        successTitle: "资料已保存",
        errorTitle: "资料保存失败",
    });
    useActionNotification(passwordState, {
        successTitle: "密码已更新",
        errorTitle: "密码更新失败",
    });

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

    const loadSubjects = useCallback(async () => {
        setSubjectLoading(true);

        try {
            const subjects = await getDistinctSubjectsAction();
            setSubjectOptions(subjects.map((s) => ({ value: s, label: s })));
        } finally {
            setSubjectLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSubjects();
    }, [loadSubjects]);

    async function saveSubjectPreferences() {
        setSubjectSaving(true);

        try {
            const result =
                await updateSubjectPreferencesAction(selectedSubjects);

            if (result.error) {
                notification.error({
                    message: "保存失败",
                    description: result.error,
                    placement: "topRight",
                });
                return;
            }

            notification.success({
                message: "学科偏好已保存",
                description:
                    result.success ?? "题目列表将自动按此偏好筛选学科。",
                placement: "topRight",
            });
            router.refresh();
        } finally {
            setSubjectSaving(false);
        }
    }

    return (
        <div style={{ display: "grid", gap: 16 }}>
            <section className="content-surface">
                <div className="section-head">
                    <div>
                        <h2
                            style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}
                        >
                            账户资料
                        </h2>
                        <p
                            className="muted"
                            style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                        >
                            修改你自己的用户名、姓名和邮箱信息。
                        </p>
                    </div>
                    <Space size={8}>
                        <Tag color={getPlatformRoleColor(user.platformRole)}>
                            {getPlatformRoleLabel(user.platformRole)}
                        </Tag>
                        {user.projectRoles.length ? (
                            user.projectRoles.map((role) => (
                                <Tag
                                    key={role}
                                    color={getProjectRoleColor(role)}
                                >
                                    {getProjectRoleLabel(role)}
                                </Tag>
                            ))
                        ) : (
                            <Tag>未分配项目角色</Tag>
                        )}
                    </Space>
                </div>

                <form action={profileAction} style={{ marginTop: 16 }}>
                    <div className="settings-form-grid">
                        <div>
                            <label
                                className="field-label"
                                htmlFor="settings-username"
                            >
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
                            <label
                                className="field-label"
                                htmlFor="settings-name"
                            >
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
                            <label
                                className="field-label"
                                htmlFor="settings-email"
                            >
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

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            marginTop: 18,
                        }}
                    >
                        <Button
                            type="primary"
                            htmlType="submit"
                            size="large"
                            loading={profilePending}
                        >
                            保存资料
                        </Button>
                    </div>
                </form>
            </section>

            <section className="content-surface">
                <div>
                    <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                        修改密码
                    </h2>
                    <p
                        className="muted"
                        style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                    >
                        输入当前密码后，可以设置新的登录密码。
                    </p>
                </div>

                <form
                    ref={passwordFormRef}
                    action={passwordAction}
                    style={{ marginTop: 16 }}
                >
                    <div className="settings-form-grid">
                        <div className="settings-form-full">
                            <label
                                className="field-label"
                                htmlFor="currentPassword"
                            >
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
                            <label
                                className="field-label"
                                htmlFor="newPassword"
                            >
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
                            <label
                                className="field-label"
                                htmlFor="confirmPassword"
                            >
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

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            marginTop: 18,
                        }}
                    >
                        <Button
                            type="primary"
                            htmlType="submit"
                            size="large"
                            loading={passwordPending}
                        >
                            更新密码
                        </Button>
                    </div>
                </form>
            </section>

            <section className="content-surface">
                <div>
                    <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                        学科偏好
                    </h2>
                    <p
                        className="muted"
                        style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                    >
                        选择你关注的学科，题目列表页面将自动按此偏好筛选，无需每次手动选择。
                    </p>
                </div>

                <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                    <div>
                        <label
                            className="field-label"
                            htmlFor="settings-subjects"
                        >
                            学科选择（可多选）
                        </label>
                        <Select
                            id="settings-subjects"
                            mode="multiple"
                            size="large"
                            value={selectedSubjects}
                            onChange={(value) => setSelectedSubjects(value)}
                            options={subjectOptions}
                            loading={subjectLoading}
                            placeholder={
                                subjectLoading
                                    ? "加载学科列表中..."
                                    : "请选择关注的学科"
                            }
                            style={{ width: "100%" }}
                            optionFilterProp="label"
                            showSearch
                            allowClear
                            suffixIcon={<BookOpen size={16} />}
                        />
                    </div>

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            marginTop: 6,
                        }}
                    >
                        <Button
                            type="primary"
                            size="large"
                            loading={subjectSaving}
                            onClick={saveSubjectPreferences}
                        >
                            保存学科偏好
                        </Button>
                    </div>
                </div>
            </section>
        </div>
    );
}
