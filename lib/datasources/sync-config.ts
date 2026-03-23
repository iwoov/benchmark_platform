import type { Prisma } from "@prisma/client";

export function readOriginalFileName(syncConfig: Prisma.JsonValue | null) {
  if (
    !syncConfig ||
    typeof syncConfig !== "object" ||
    Array.isArray(syncConfig)
  ) {
    return null;
  }

  const fileName = (syncConfig as Record<string, unknown>).originalFileName;
  return typeof fileName === "string" ? fileName : null;
}
