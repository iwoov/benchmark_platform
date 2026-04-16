-- CreateTable
CREATE TABLE "AiProviderSupportedModel" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderSupportedModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderSupportedModel_providerId_name_key" ON "AiProviderSupportedModel"("providerId", "name");

-- CreateIndex
CREATE INDEX "AiProviderSupportedModel_providerId_sortOrder_idx" ON "AiProviderSupportedModel"("providerId", "sortOrder");

-- CreateIndex
CREATE INDEX "AiProviderSupportedModel_companyName_idx" ON "AiProviderSupportedModel"("companyName");

-- AddForeignKey
ALTER TABLE "AiProviderSupportedModel" ADD CONSTRAINT "AiProviderSupportedModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AiProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
