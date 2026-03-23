-- AlterEnum
ALTER TYPE "DataSourceType" ADD VALUE 'JSON_UPLOAD';

-- AlterEnum
ALTER TYPE "DataSourceType" ADD VALUE 'EXCEL_UPLOAD';

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED'
);

-- AlterTable
ALTER TABLE "ProjectDataSource"
ALTER COLUMN "externalTableId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "datasourceId" TEXT NOT NULL,
    "externalRecordId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "answer" TEXT,
    "analysis" TEXT,
    "questionType" TEXT,
    "difficulty" TEXT,
    "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB,
    "sourceUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Question_datasourceId_externalRecordId_key" ON "Question"("datasourceId", "externalRecordId");

-- CreateIndex
CREATE INDEX "Question_projectId_status_idx" ON "Question"("projectId", "status");

-- CreateIndex
CREATE INDEX "Question_projectId_datasourceId_idx" ON "Question"("projectId", "datasourceId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_datasourceId_fkey" FOREIGN KEY ("datasourceId") REFERENCES "ProjectDataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
