-- CreateTable
CREATE TABLE IF NOT EXISTS "AiChatConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelCode" TEXT NOT NULL,
    "modelCodes" JSONB,
    "systemPrompt" TEXT,
    "presetFields" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiChatConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiChatConfig_enabled_updatedAt_idx" ON "AiChatConfig"("enabled", "updatedAt");
