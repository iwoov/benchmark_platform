ALTER TABLE "Project" ADD COLUMN "projectFamily" TEXT;

CREATE INDEX "Project_projectFamily_idx" ON "Project"("projectFamily");
