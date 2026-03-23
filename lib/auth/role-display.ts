export type PlatformRoleValue = "PLATFORM_ADMIN" | "USER";
export type ProjectRoleValue = "PROJECT_MANAGER" | "AUTHOR" | "REVIEWER";

export function getPlatformRoleLabel(role: PlatformRoleValue) {
  return role === "PLATFORM_ADMIN" ? "平台管理员" : "平台用户";
}

export function getPlatformRoleColor(role: PlatformRoleValue) {
  return role === "PLATFORM_ADMIN" ? "blue" : "default";
}

export function getProjectRoleLabel(role: ProjectRoleValue) {
  if (role === "PROJECT_MANAGER") return "项目负责人";
  if (role === "AUTHOR") return "出题用户";
  return "审核用户";
}

export function getProjectRoleColor(role: ProjectRoleValue) {
  if (role === "PROJECT_MANAGER") return "geekblue";
  if (role === "AUTHOR") return "blue";
  return "gold";
}
