-- AlterTable
ALTER TABLE "StudentJournalEntry" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "lessonId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StudentJournalEntry_externalId_key" ON "StudentJournalEntry"("externalId");
