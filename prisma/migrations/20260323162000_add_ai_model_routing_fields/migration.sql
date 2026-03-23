-- AlterTable
ALTER TABLE "AiModel" ADD COLUMN "protocol" "AiProtocol";

-- Backfill protocol from the first linked endpoint for existing rows
UPDATE "AiModel" AS model
SET "protocol" = route."protocol"
FROM (
    SELECT DISTINCT ON (link."modelId")
        link."modelId",
        endpoint."protocol"
    FROM "AiProviderEndpointModel" AS link
    JOIN "AiProviderEndpoint" AS endpoint
      ON endpoint."id" = link."endpointId"
    ORDER BY link."modelId", link."endpointId"
) AS route
WHERE model."id" = route."modelId";

-- Fallback for legacy rows without endpoint mappings
UPDATE "AiModel"
SET "protocol" = 'OPENAI_COMPATIBLE'
WHERE "protocol" IS NULL;

ALTER TABLE "AiModel" ALTER COLUMN "protocol" SET NOT NULL;

-- AlterTable
ALTER TABLE "AiProviderEndpointModel"
ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "timeoutMs" INTEGER NOT NULL DEFAULT 15000;

-- Backfill route priority for existing rows
WITH ranked_routes AS (
    SELECT
        "endpointId",
        "modelId",
        ROW_NUMBER() OVER (
            PARTITION BY "modelId"
            ORDER BY "endpointId"
        ) AS route_priority
    FROM "AiProviderEndpointModel"
)
UPDATE "AiProviderEndpointModel" AS link
SET "priority" = ranked_routes.route_priority
FROM ranked_routes
WHERE link."endpointId" = ranked_routes."endpointId"
  AND link."modelId" = ranked_routes."modelId";

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderEndpointModel_modelId_priority_key"
ON "AiProviderEndpointModel"("modelId", "priority");

-- CreateIndex
CREATE INDEX "AiProviderEndpointModel_modelId_enabled_priority_idx"
ON "AiProviderEndpointModel"("modelId", "enabled", "priority");
