import { isAdminRole, type PlatformRoleValue } from "@/lib/auth/roles";

export function getHomePathByRole(platformRole: PlatformRoleValue) {
    return isAdminRole(platformRole) ? "/admin" : "/workspace";
}
