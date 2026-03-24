export type SessionUser = {
    id: string;
    name: string;
    email: string;
    platformRole: "SUPER_ADMIN" | "PLATFORM_ADMIN" | "USER";
};
