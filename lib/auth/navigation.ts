export type PlatformRole = "PLATFORM_ADMIN" | "USER";

export function getHomePathByRole(platformRole: PlatformRole) {
  return platformRole === "PLATFORM_ADMIN" ? "/admin" : "/workspace";
}
