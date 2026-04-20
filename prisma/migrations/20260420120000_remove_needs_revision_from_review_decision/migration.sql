-- AlterEnum: Remove NEEDS_REVISION from ReviewDecision
-- First update any existing records that have NEEDS_REVISION to REJECT
UPDATE "Review" SET "decision" = 'REJECT' WHERE "decision" = 'NEEDS_REVISION';

-- Remove the enum value
CREATE TYPE "ReviewDecision_new" AS ENUM ('PASS', 'REJECT');
ALTER TABLE "Review" ALTER COLUMN "decision" TYPE "ReviewDecision_new" USING ("decision"::text::"ReviewDecision_new");
ALTER TYPE "ReviewDecision" RENAME TO "ReviewDecision_old";
ALTER TYPE "ReviewDecision_new" RENAME TO "ReviewDecision";
DROP TYPE "ReviewDecision_old";
