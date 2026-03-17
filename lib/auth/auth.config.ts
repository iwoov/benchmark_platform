import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(8),
});

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

        const isValid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );

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
          | "PLATFORM_ADMIN"
          | "USER";
      }

      return session;
    },
  },
} satisfies NextAuthConfig;
