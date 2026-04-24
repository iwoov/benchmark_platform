ALTER TABLE "User"
ADD COLUMN "ownerAdminId" TEXT;

ALTER TABLE "AiReviewStrategy"
ADD COLUMN "scopeAdminId" TEXT;

UPDATE "AiReviewStrategy"
SET "scopeAdminId" = "createdById"
WHERE "scopeAdminId" IS NULL;

ALTER TABLE "AiReviewStrategy"
ALTER COLUMN "scopeAdminId" SET NOT NULL;

DROP INDEX "AiReviewStrategy_code_key";

CREATE INDEX "User_ownerAdminId_idx" ON "User"("ownerAdminId");
CREATE INDEX "AiReviewStrategy_scopeAdminId_updatedAt_idx" ON "AiReviewStrategy"("scopeAdminId", "updatedAt");
CREATE UNIQUE INDEX "AiReviewStrategy_scopeAdminId_code_key" ON "AiReviewStrategy"("scopeAdminId", "code");

ALTER TABLE "User"
ADD CONSTRAINT "User_ownerAdminId_fkey"
FOREIGN KEY ("ownerAdminId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiReviewStrategy"
ADD CONSTRAINT "AiReviewStrategy_scopeAdminId_fkey"
FOREIGN KEY ("scopeAdminId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
