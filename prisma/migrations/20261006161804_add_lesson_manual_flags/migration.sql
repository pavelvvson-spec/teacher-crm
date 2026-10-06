-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "isManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalStartAt" TIMESTAMP(3);
