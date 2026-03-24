import type { PlatformRoleValue, ProjectRoleValue } from "@/lib/auth/roles";

export function getPlatformRoleLabel(role: PlatformRoleValue) {
    if (role === "SUPER_ADMIN") return "超级管理员";
    if (role === "PLATFORM_ADMIN") return "平台管理员";
    return "普通账号";
}

export function getPlatformRoleColor(role: PlatformRoleValue) {
    if (role === "SUPER_ADMIN") return "red";
    if (role === "PLATFORM_ADMIN") return "blue";
    return "default";
}

export function getProjectRoleLabel(role: ProjectRoleValue) {
    if (role === "AUTHOR") return "出题用户";
    return "审核用户";
}

export function getProjectRoleColor(role: ProjectRoleValue) {
    if (role === "AUTHOR") return "blue";
    return "gold";
}
