CREATE TABLE "UserProjectReviewFieldPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProjectReviewFieldPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserProjectReviewFieldPreference_userId_projectId_key"
ON "UserProjectReviewFieldPreference"("userId", "projectId");

ALTER TABLE "UserProjectReviewFieldPreference"
ADD CONSTRAINT "UserProjectReviewFieldPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserProjectReviewFieldPreference"
ADD CONSTRAINT "UserProjectReviewFieldPreference_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
