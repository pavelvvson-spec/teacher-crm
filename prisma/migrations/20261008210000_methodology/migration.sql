-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "birthYear" INTEGER,
ADD COLUMN     "isAdult" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "methodology" TEXT,
ADD COLUMN     "methodologyUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "methodologyNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MethodologyQuestion" (
    "id" TEXT NOT NULL,
    "batch" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MethodologyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MethodologyInbox" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MethodologyInbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MethodologyQuestion_status_idx" ON "MethodologyQuestion"("status");

-- CreateIndex
CREATE INDEX "MethodologyInbox_kind_usedAt_idx" ON "MethodologyInbox"("kind", "usedAt");
