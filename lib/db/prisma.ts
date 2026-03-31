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

function getSignature() {
  return process.env.NODE_ENV === "production"
    ? "production"
    : getSchemaSignature();
}

function getPrismaClient() {
  const signature = getSignature();
  const cachedState = globalThis.prismaState;

  if (cachedState?.signature === signature) {
    return cachedState.client;
  }

  const client = createPrismaClient();
  const previousClient = cachedState?.client;

  globalThis.prismaState = {
    client,
    signature,
  };

  if (previousClient && previousClient !== client) {
    void previousClient.$disconnect().catch(() => undefined);
  }

  return client;
}

export const prisma = new Proxy({} as PrismaClientType, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client as object, property, client);

    return typeof value === "function" ? value.bind(client) : value;
  },
  set(_target, property, value) {
    const client = getPrismaClient();
    return Reflect.set(client as object, property, value, client);
  },
  has(_target, property) {
    return Reflect.has(getPrismaClient() as object, property);
  },
  ownKeys() {
    return Reflect.ownKeys(getPrismaClient() as object);
  },
  getOwnPropertyDescriptor(_target, property) {
    return Reflect.getOwnPropertyDescriptor(
      getPrismaClient() as object,
      property,
    );
  },
});
