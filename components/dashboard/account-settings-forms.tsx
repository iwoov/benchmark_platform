"use client";

import {
    useActionState,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, UserRound } from "lucide-react";
import {
    type AccountFormState,
    getDistinctSubjectsAction,
    updateOwnPasswordAction,
    updateOwnProfileAction,
    updateSubjectPreferencesAction,
} from "@/app/actions/account-settings";
import { useActionNotification } from "@/components/feedback/use-action-notification";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToast } from "@/components/ui/toast";
import {
    getPlatformRoleLabel,
    getPlatformRoleVariant,
    getProjectRoleLabel,
    getProjectRoleVariant,
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
    const toast = useToast();
    const passwordFormRef = useRef<HTMLFormElement>(null);
    const [subjectOptions, setSubjectOptions] = useState<Array<{ value: string; label: string }>>([]);
    const [selectedSubjects, setSelectedSubjects] = useState<string[]>(user.subjectPreferences);
    const [subjectLoading, setSubjectLoading] = useState(false);
    const [subjectSaving, setSubjectSaving] = useState(false);
    const [profileState, profileAction, profilePending] = useActionState(updateOwnProfileAction, initialState);
    const [passwordState, passwordAction, passwordPending] = useActionState(updateOwnPasswordAction, initialState);

    useActionNotification(profileState, { successTitle: "资料已保存", errorTitle: "资料保存失败" });
    useActionNotification(passwordState, { successTitle: "密码已更新", errorTitle: "密码更新失败" });

    useEffect(() => {
        if (profileState.success) router.refresh();
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
            const result = await updateSubjectPreferencesAction(selectedSubjects);
            if (result.error) {
                toast.error({ title: "保存失败", description: result.error });
                return;
            }
            toast.success({
                title: "学科偏好已保存",
                description: result.success ?? "题目列表将自动按此偏好筛选学科。",
            });
            router.refresh();
        } finally {
            setSubjectSaving(false);
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h2 className="text-base font-semibold tracking-tight">账户资料</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                修改你自己的用户名、姓名和邮箱信息。
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            <Badge variant={getPlatformRoleVariant(user.platformRole)} size="sm">
                                {getPlatformRoleLabel(user.platformRole)}
                            </Badge>
                            {user.projectRoles.length ? (
                                user.projectRoles.map((role) => (
                                    <Badge key={role} variant={getProjectRoleVariant(role)} size="sm">
                                        {getProjectRoleLabel(role)}
                                    </Badge>
                                ))
                            ) : (
                                <Badge variant="outline" size="sm">
                                    未分配项目角色
                                </Badge>
                            )}
                        </div>
                    </div>

                    <form action={profileAction} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <label htmlFor="settings-username" className="text-sm font-medium">
                                    用户名
                                </label>
                                <Input
                                    id="settings-username"
                                    name="username"
                                    defaultValue={user.username}
                                    leftIcon={<UserRound size={14} />}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="settings-name" className="text-sm font-medium">
                                    姓名
                                </label>
                                <Input id="settings-name" name="name" defaultValue={user.name} />
                            </div>

                            <div className="space-y-1.5 md:col-span-2">
                                <label htmlFor="settings-email" className="text-sm font-medium">
                                    邮箱
                                </label>
                                <Input
                                    id="settings-email"
                                    name="email"
                                    defaultValue={user.email ?? ""}
                                    leftIcon={<Mail size={14} />}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Button type="submit" loading={profilePending}>
                                保存资料
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="space-y-4">
                    <div>
                        <h2 className="text-base font-semibold tracking-tight">修改密码</h2>
                        <p className="mt-1 text-sm text-muted-foreground">输入当前密码后，可以设置新的登录密码。</p>
                    </div>

                    <form ref={passwordFormRef} action={passwordAction} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-1.5 md:col-span-2">
                                <label htmlFor="currentPassword" className="text-sm font-medium">
                                    当前密码
                                </label>
                                <Input
                                    id="currentPassword"
                                    name="currentPassword"
                                    type="password"
                                    leftIcon={<KeyRound size={14} />}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="newPassword" className="text-sm font-medium">
                                    新密码
                                </label>
                                <Input id="newPassword" name="newPassword" type="password" leftIcon={<KeyRound size={14} />} />
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="confirmPassword" className="text-sm font-medium">
                                    确认新密码
                                </label>
                                <Input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type="password"
                                    leftIcon={<KeyRound size={14} />}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Button type="submit" loading={passwordPending}>
                                更新密码
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="space-y-4">
                    <div>
                        <h2 className="text-base font-semibold tracking-tight">学科偏好</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            选择你关注的学科，题目列表页面将自动按此偏好筛选，无需每次手动选择。
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="settings-subjects" className="text-sm font-medium">
                            学科选择（可多选）
                        </label>
                        <MultiSelect
                            id="settings-subjects"
                            value={selectedSubjects}
                            onChange={setSelectedSubjects}
                            options={subjectOptions}
                            placeholder={subjectLoading ? "加载学科列表中..." : "请选择关注的学科"}
                        />
                    </div>

                    <div className="flex justify-end">
                        <Button loading={subjectSaving} onClick={saveSubjectPreferences}>
                            保存学科偏好
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
