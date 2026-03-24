import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            username: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
            platformRole: "SUPER_ADMIN" | "PLATFORM_ADMIN" | "USER";
        };
    }

    interface User {
        username: string;
        platformRole: "SUPER_ADMIN" | "PLATFORM_ADMIN" | "USER";
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id?: string;
        username?: string;
        platformRole?: "SUPER_ADMIN" | "PLATFORM_ADMIN" | "USER";
    }
}
