export type PlatformRoleValue = "SUPER_ADMIN" | "PLATFORM_ADMIN" | "USER";
export type AdminRoleValue = "SUPER_ADMIN" | "PLATFORM_ADMIN";
export type ProjectRoleValue = "AUTHOR" | "REVIEWER";

export function isSuperAdminRole(
  role: PlatformRoleValue | null | undefined,
): role is "SUPER_ADMIN" {
  return role === "SUPER_ADMIN";
}

export function isAdminRole(
  role: PlatformRoleValue | null | undefined,
): role is AdminRoleValue {
  return role === "SUPER_ADMIN" || role === "PLATFORM_ADMIN";
}
