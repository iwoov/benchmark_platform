-- CreateTable
CREATE TABLE "AiReviewStrategy" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "projectIds" JSONB,
    "questionTypes" JSONB,
    "definition" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiReviewStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiReviewStrategyRun" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "triggeredById" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "requestPayload" JSONB NOT NULL,
    "responsePayload" JSONB,
    "parsedResult" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiReviewStrategyRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiReviewStrategy_code_key" ON "AiReviewStrategy"("code");

-- CreateIndex
CREATE INDEX "AiReviewStrategy_enabled_createdAt_idx" ON "AiReviewStrategy"("enabled", "createdAt");

-- CreateIndex
CREATE INDEX "AiReviewStrategyRun_questionId_createdAt_idx" ON "AiReviewStrategyRun"("questionId", "createdAt");

-- CreateIndex
CREATE INDEX "AiReviewStrategyRun_strategyId_createdAt_idx" ON "AiReviewStrategyRun"("strategyId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiReviewStrategy" ADD CONSTRAINT "AiReviewStrategy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReviewStrategyRun" ADD CONSTRAINT "AiReviewStrategyRun_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "AiReviewStrategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReviewStrategyRun" ADD CONSTRAINT "AiReviewStrategyRun_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReviewStrategyRun" ADD CONSTRAINT "AiReviewStrategyRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
