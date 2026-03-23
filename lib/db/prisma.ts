import { statSync } from "fs";
import { createRequire } from "module";
import { join, sep } from "path";
import type { PrismaClient as PrismaClientType } from "@prisma/client";

declare global {
  var prismaState:
    | {
        client: PrismaClientType;
        signature: string;
      }
    | undefined;
}

const require = createRequire(import.meta.url);

function getSchemaSignature() {
  try {
    const schemaStat = statSync(join(process.cwd(), "prisma", "schema.prisma"));
    return `${schemaStat.size}:${schemaStat.mtimeMs}`;
  } catch {
    return "schema-missing";
  }
}

function clearPrismaRequireCache() {
  for (const cacheKey of Object.keys(require.cache)) {
    if (
      cacheKey.includes(`${sep}@prisma${sep}client${sep}`) ||
      cacheKey.includes(`${sep}.prisma${sep}client${sep}`) ||
      cacheKey.includes(`${sep}@prisma+client@`)
    ) {
      delete require.cache[cacheKey];
    }
  }
}

function createPrismaClient() {
  if (process.env.NODE_ENV !== "production") {
    clearPrismaRequireCache();
  }

  const { PrismaClient } =
    require("@prisma/client") as typeof import("@prisma/client");

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const signature =
  process.env.NODE_ENV === "production" ? "production" : getSchemaSignature();
const cachedState = globalThis.prismaState;

export const prisma =
  cachedState?.signature === signature
    ? cachedState.client
    : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaState = {
    client: prisma,
    signature,
  };
}
