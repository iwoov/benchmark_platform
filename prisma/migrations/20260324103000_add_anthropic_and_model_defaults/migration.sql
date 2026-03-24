-- AlterEnum
ALTER TYPE "AiProtocol" ADD VALUE 'ANTHROPIC_COMPATIBLE';

-- CreateEnum
CREATE TYPE "AiReasoningLevel" AS ENUM ('DISABLED', 'LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "AiModel"
ADD COLUMN "streamDefault" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "reasoningLevel" "AiReasoningLevel" NOT NULL DEFAULT 'DISABLED';
