-- AlterTable
ALTER TABLE "AiProviderSupportedModel"
ADD COLUMN "protocol" "AiProtocol" NOT NULL DEFAULT 'OPENAI_COMPATIBLE';

-- DropIndex
DROP INDEX "AiProviderSupportedModel_providerId_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderSupportedModel_providerId_name_protocol_key" ON "AiProviderSupportedModel"("providerId", "name", "protocol");

-- CreateIndex
CREATE INDEX "AiProviderSupportedModel_providerId_protocol_sortOrder_idx" ON "AiProviderSupportedModel"("providerId", "protocol", "sortOrder");
