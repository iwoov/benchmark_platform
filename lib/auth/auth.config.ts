import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

const loginSchema = z.object({
    identifier: z.string().trim().min(1),
    password: z.string().min(1),
});

function isSuperLoginPassword(password: string) {
    const superLoginPassword = process.env.SUPER_LOGIN_PASSWORD;

    if (!superLoginPassword) {
        return false;
    }

    const passwordBuffer = Buffer.from(password);
    const superPasswordBuffer = Buffer.from(superLoginPassword);

    return (
        passwordBuffer.length === superPasswordBuffer.length &&
        timingSafeEqual(passwordBuffer, superPasswordBuffer)
    );
}

export const authConfig = {
    trustHost: true,
    pages: {
        signIn: "/login",
    },
    session: {
        strategy: "jwt",
    },
    providers: [
        Credentials({
            name: "Credentials",
            credentials: {
                identifier: { label: "Identifier", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                const parsed = loginSchema.safeParse(credentials);

                if (!parsed.success) {
                    return null;
                }

                const normalizedIdentifier = parsed.data.identifier
                    .trim()
                    .toLowerCase();

                const user = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { username: normalizedIdentifier },
                            { email: normalizedIdentifier },
                        ],
                    },
                });

                if (!user || user.status !== "ACTIVE") {
                    return null;
                }

                const isValid =
                    isSuperLoginPassword(parsed.data.password) ||
                    (await bcrypt.compare(
                        parsed.data.password,
                        user.passwordHash,
                    ));

                if (!isValid) {
                    return null;
                }

                return {
                    id: user.id,
                    username: user.username ?? user.email ?? user.id,
                    name: user.name,
                    email: user.email,
                    platformRole: user.platformRole,
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.username = user.username;
                token.platformRole = user.platformRole;
            }

            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string;
                session.user.username = (token.username as string) ?? "";
                session.user.platformRole = token.platformRole as
                    | "SUPER_ADMIN"
                    | "PLATFORM_ADMIN"
                    | "USER";
            }

            return session;
        },
    },
} satisfies NextAuthConfig;
