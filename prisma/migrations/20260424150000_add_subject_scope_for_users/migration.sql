CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubjectPrimaryValue" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubjectPrimaryValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserSubjectAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSubjectAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");
CREATE UNIQUE INDEX "SubjectPrimaryValue_subjectId_value_key" ON "SubjectPrimaryValue"("subjectId", "value");
CREATE INDEX "SubjectPrimaryValue_value_idx" ON "SubjectPrimaryValue"("value");
CREATE UNIQUE INDEX "UserSubjectAssignment_userId_subjectId_key" ON "UserSubjectAssignment"("userId", "subjectId");
CREATE INDEX "UserSubjectAssignment_subjectId_idx" ON "UserSubjectAssignment"("subjectId");

ALTER TABLE "SubjectPrimaryValue"
ADD CONSTRAINT "SubjectPrimaryValue_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSubjectAssignment"
ADD CONSTRAINT "UserSubjectAssignment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSubjectAssignment"
ADD CONSTRAINT "UserSubjectAssignment_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
