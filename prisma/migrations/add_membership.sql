-- Migration: introduce Membership model for multi-group support
-- Run this BEFORE prisma db push

BEGIN;

-- 1. Create the Membership table
CREATE TABLE IF NOT EXISTS "Membership" (
  "id"               TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "invitationCodeId" TEXT NOT NULL,
  "favoriteTeamId"   TEXT,
  "championPickId"   TEXT,
  "bonusPoints"      INTEGER NOT NULL DEFAULT 0,
  "joinedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Membership_invitationCodeId_fkey" FOREIGN KEY ("invitationCodeId") REFERENCES "InvitationCode"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Membership_favoriteTeamId_fkey" FOREIGN KEY ("favoriteTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Membership_championPickId_fkey" FOREIGN KEY ("championPickId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Membership_userId_invitationCodeId_key"
  ON "Membership"("userId", "invitationCodeId");

CREATE INDEX IF NOT EXISTS "Membership_invitationCodeId_idx"
  ON "Membership"("invitationCodeId");

-- 2. Migrate existing user data into Membership rows
INSERT INTO "Membership" ("id", "userId", "invitationCodeId", "favoriteTeamId", "championPickId", "bonusPoints", "joinedAt")
SELECT
  gen_random_uuid()::text,
  u."id",
  u."invitationCodeId",
  u."favoriteTeamId",
  u."championPickId",
  COALESCE(u."bonusPoints", 0),
  u."createdAt"
FROM "User" u
WHERE u."invitationCodeId" IS NOT NULL
ON CONFLICT ("userId", "invitationCodeId") DO NOTHING;

-- 3. Recalculate User.totalPoints to be prediction points only
--    (current totalPoints includes bonusPoints + manualPoints)
UPDATE "User"
SET "totalPoints" = GREATEST(0, "totalPoints" - COALESCE("bonusPoints", 0) - COALESCE("manualPoints", 0));

-- 4. Drop obsolete columns from User
ALTER TABLE "User"
  DROP COLUMN IF EXISTS "invitationCodeId",
  DROP COLUMN IF EXISTS "favoriteTeamId",
  DROP COLUMN IF EXISTS "championPickId",
  DROP COLUMN IF EXISTS "bonusPoints";

COMMIT;
