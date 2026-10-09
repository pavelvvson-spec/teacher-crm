-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "draftHomework" TEXT,
ADD COLUMN     "draftNotes" TEXT,
ADD COLUMN     "draftUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LessonMaterial" ADD COLUMN     "draftStudentId" TEXT,
ALTER COLUMN "lessonId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "LessonMaterial" ADD CONSTRAINT "LessonMaterial_draftStudentId_fkey" FOREIGN KEY ("draftStudentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
