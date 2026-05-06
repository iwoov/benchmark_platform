ALTER TABLE "Question"
ADD COLUMN     "businessQuestionKey" TEXT,
ADD COLUMN     "revisionNo" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "isLatestRevision" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "previousRevisionId" TEXT;

ALTER TABLE "Question"
ADD CONSTRAINT "Question_previousRevisionId_fkey"
FOREIGN KEY ("previousRevisionId") REFERENCES "Question"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Question_projectId_businessQuestionKey_revisionNo_key"
ON "Question"("projectId", "businessQuestionKey", "revisionNo");

CREATE INDEX "Question_projectId_businessQuestionKey_idx"
ON "Question"("projectId", "businessQuestionKey");

CREATE INDEX "Question_projectId_businessQuestionKey_isLatestRevision_idx"
ON "Question"("projectId", "businessQuestionKey", "isLatestRevision");

CREATE INDEX "Question_previousRevisionId_idx"
ON "Question"("previousRevisionId");
