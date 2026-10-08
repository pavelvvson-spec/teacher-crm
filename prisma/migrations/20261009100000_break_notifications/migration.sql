-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "endNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "breakMinMinutes" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "breakNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
