-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "lastCheckupSentAt" TIMESTAMP(3),
ADD COLUMN     "lastSummarySentAt" TIMESTAMP(3),
ADD COLUMN     "teacherTelegramChatId" TEXT;
