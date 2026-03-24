-- Promote platform role model to SUPER_ADMIN / PLATFORM_ADMIN / USER
-- and remove deprecated PROJECT_MANAGER memberships.

DELETE FROM "ProjectMember"
WHERE "role" = 'PROJECT_MANAGER';

ALTER TYPE "PlatformRole" RENAME TO "PlatformRole_old";

CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER');

ALTER TABLE "User"
ALTER COLUMN "platformRole" DROP DEFAULT;

ALTER TABLE "User"
ALTER COLUMN "platformRole"
TYPE "PlatformRole"
USING (
  CASE
    WHEN "platformRole"::text = 'PLATFORM_ADMIN' THEN 'PLATFORM_ADMIN'::"PlatformRole"
    ELSE 'USER'::"PlatformRole"
  END
);

ALTER TABLE "User"
ALTER COLUMN "platformRole" SET DEFAULT 'USER';

DROP TYPE "PlatformRole_old";

ALTER TYPE "ProjectMemberRole" RENAME TO "ProjectMemberRole_old";

CREATE TYPE "ProjectMemberRole" AS ENUM ('AUTHOR', 'REVIEWER');

ALTER TABLE "ProjectMember"
ALTER COLUMN "role"
TYPE "ProjectMemberRole"
USING ("role"::text::"ProjectMemberRole");

DROP TYPE "ProjectMemberRole_old";
