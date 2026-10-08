-- CreateEnum
CREATE TYPE "JournalSource" AS ENUM ('TEXT', 'VOICE', 'FIREFLIES');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "aiPortrait" TEXT,
ADD COLUMN     "aiPortraitAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StudentJournalEntry" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "source" "JournalSource" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentJournalEntry_studentId_createdAt_idx" ON "StudentJournalEntry"("studentId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudentJournalEntry" ADD CONSTRAINT "StudentJournalEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
