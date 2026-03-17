export type SessionUser = {
  id: string;
  name: string;
  email: string;
  platformRole: "PLATFORM_ADMIN" | "USER";
};
