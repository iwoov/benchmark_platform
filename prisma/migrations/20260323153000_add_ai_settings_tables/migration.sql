-- CreateEnum
CREATE TYPE "AiProtocol" AS ENUM (
    'OPENAI_COMPATIBLE',
    'GEMINI_COMPATIBLE'
);

-- CreateTable
CREATE TABLE "AiProvider" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProviderEndpoint" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "protocol" "AiProtocol" NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiModel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProviderEndpointModel" (
    "endpointId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,

    CONSTRAINT "AiProviderEndpointModel_pkey" PRIMARY KEY ("endpointId","modelId")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiProvider_code_key" ON "AiProvider"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderEndpoint_code_key" ON "AiProviderEndpoint"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderEndpoint_providerId_protocol_key" ON "AiProviderEndpoint"("providerId", "protocol");

-- CreateIndex
CREATE INDEX "AiProviderEndpoint_providerId_sortOrder_idx" ON "AiProviderEndpoint"("providerId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AiModel_code_key" ON "AiModel"("code");

-- CreateIndex
CREATE INDEX "AiProviderEndpointModel_modelId_idx" ON "AiProviderEndpointModel"("modelId");

-- AddForeignKey
ALTER TABLE "AiProviderEndpoint" ADD CONSTRAINT "AiProviderEndpoint_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AiProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProviderEndpointModel" ADD CONSTRAINT "AiProviderEndpointModel_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "AiProviderEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProviderEndpointModel" ADD CONSTRAINT "AiProviderEndpointModel_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "AiModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
