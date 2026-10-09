-- Бібліотека підручників
CREATE TABLE "Textbook" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" TEXT,
    "summary" TEXT,
    "contents" TEXT,
    "pageCount" INTEGER NOT NULL,
    "chunkSize" INTEGER NOT NULL DEFAULT 10,
    "chunkUrls" TEXT[],
    "pageOffset" INTEGER NOT NULL DEFAULT 0,
    "fileName" TEXT,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "analyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Textbook_pkey" PRIMARY KEY ("id")
);

-- Підручник і поточна сторінка учня, сторінки чернетки
ALTER TABLE "Student" ADD COLUMN "textbookId" TEXT;
ALTER TABLE "Student" ADD COLUMN "textbookPage" INTEGER;
ALTER TABLE "Student" ADD COLUMN "draftTextbookFrom" INTEGER;
ALTER TABLE "Student" ADD COLUMN "draftTextbookTo" INTEGER;

-- Сторінки підручника на урок
ALTER TABLE "Lesson" ADD COLUMN "textbookFrom" INTEGER;
ALTER TABLE "Lesson" ADD COLUMN "textbookTo" INTEGER;

ALTER TABLE "Student" ADD CONSTRAINT "Student_textbookId_fkey" FOREIGN KEY ("textbookId") REFERENCES "Textbook"("id") ON DELETE SET NULL ON UPDATE CASCADE;
