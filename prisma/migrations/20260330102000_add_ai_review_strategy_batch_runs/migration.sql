CREATE TYPE "BatchRunStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCEL_REQUESTED',
  'CANCELLED'
);

CREATE TYPE "BatchRunItemStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'SKIPPED',
  'CANCELLED'
);

CREATE TABLE "AiReviewStrategyBatchRun" (
  "id" TEXT NOT NULL,
  "strategyId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "status" "BatchRunStatus" NOT NULL DEFAULT 'PENDING',
  "concurrency" INTEGER NOT NULL DEFAULT 1,
  "totalCount" INTEGER NOT NULL DEFAULT 0,
  "pendingCount" INTEGER NOT NULL DEFAULT 0,
  "runningCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "requestPayload" JSONB NOT NULL,
  "summaryPayload" JSONB,
  "errorMessage" TEXT,
  "workerId" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiReviewStrategyBatchRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiReviewStrategyBatchRunItem" (
  "id" TEXT NOT NULL,
  "batchRunId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "BatchRunItemStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "runId" TEXT,
  "errorMessage" TEXT,
  "resultPayload" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiReviewStrategyBatchRunItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiReviewStrategyBatchRunItem_batchRunId_questionId_key"
ON "AiReviewStrategyBatchRunItem"("batchRunId", "questionId");

CREATE UNIQUE INDEX "AiReviewStrategyBatchRunItem_batchRunId_sequence_key"
ON "AiReviewStrategyBatchRunItem"("batchRunId", "sequence");

CREATE INDEX "AiReviewStrategyBatchRun_projectId_createdAt_idx"
ON "AiReviewStrategyBatchRun"("projectId", "createdAt");

CREATE INDEX "AiReviewStrategyBatchRun_status_createdAt_idx"
ON "AiReviewStrategyBatchRun"("status", "createdAt");

CREATE INDEX "AiReviewStrategyBatchRun_createdById_createdAt_idx"
ON "AiReviewStrategyBatchRun"("createdById", "createdAt");

CREATE INDEX "AiReviewStrategyBatchRun_workerId_status_idx"
ON "AiReviewStrategyBatchRun"("workerId", "status");

CREATE INDEX "AiReviewStrategyBatchRunItem_batchRunId_status_sequence_idx"
ON "AiReviewStrategyBatchRunItem"("batchRunId", "status", "sequence");

CREATE INDEX "AiReviewStrategyBatchRunItem_questionId_createdAt_idx"
ON "AiReviewStrategyBatchRunItem"("questionId", "createdAt");

ALTER TABLE "AiReviewStrategyBatchRun"
ADD CONSTRAINT "AiReviewStrategyBatchRun_strategyId_fkey"
FOREIGN KEY ("strategyId") REFERENCES "AiReviewStrategy"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiReviewStrategyBatchRun"
ADD CONSTRAINT "AiReviewStrategyBatchRun_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiReviewStrategyBatchRun"
ADD CONSTRAINT "AiReviewStrategyBatchRun_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiReviewStrategyBatchRunItem"
ADD CONSTRAINT "AiReviewStrategyBatchRunItem_batchRunId_fkey"
FOREIGN KEY ("batchRunId") REFERENCES "AiReviewStrategyBatchRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiReviewStrategyBatchRunItem"
ADD CONSTRAINT "AiReviewStrategyBatchRunItem_questionId_fkey"
FOREIGN KEY ("questionId") REFERENCES "Question"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
