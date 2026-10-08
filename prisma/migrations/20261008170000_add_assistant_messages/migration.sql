-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "studentId" TEXT,
    "telegramUpdateId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantMessage_telegramUpdateId_key" ON "AssistantMessage"("telegramUpdateId");

-- CreateIndex
CREATE INDEX "AssistantMessage_createdAt_idx" ON "AssistantMessage"("createdAt");
