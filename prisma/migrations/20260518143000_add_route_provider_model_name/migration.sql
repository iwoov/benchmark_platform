-- Add route-level provider model names so one internal model route can call
-- different provider-side model names per supplier endpoint.
ALTER TABLE "AiProviderEndpointModel"
ADD COLUMN "providerModelName" TEXT;

UPDATE "AiProviderEndpointModel" AS route
SET "providerModelName" = model."code"
FROM "AiModel" AS model
WHERE route."modelId" = model."id"
  AND route."providerModelName" IS NULL;

ALTER TABLE "AiProviderEndpointModel"
ALTER COLUMN "providerModelName" SET NOT NULL;
