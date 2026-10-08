import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import StudentForm from "@/components/StudentForm";
import StudentScheduleManager from "@/components/StudentScheduleManager";
import StudentJournal from "@/components/StudentJournal";
import { getStudentNumber } from "@/lib/student-number";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const student = await prisma.student.findUnique({
    where: { id },
    include: { journalEntries: { orderBy: { createdAt: "desc" } } },
  });

  if (!student) {
    notFound();
  }

  const studentNumber = await getStudentNumber(id);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-400 font-medium">Учень №{studentNumber}</p>
        <h1 className="text-2xl font-semibold text-gray-800">
          {student.firstName} {student.lastName ?? ""}
        </h1>
      </div>
      <StudentForm
        initialValues={{
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName ?? "",
          phone: student.phone ?? "",
          telegramUsername: student.telegramUsername ?? "",
          contactChannel: student.contactChannel,
          viberPhone: student.viberPhone ?? "",
          englishLevel: student.englishLevel,
          lessonFormat: student.lessonFormat,
          defaultLessonDuration: student.defaultLessonDuration,
          defaultLessonPrice: student.defaultLessonPrice,
          paymentFrequency: student.paymentFrequency ?? "PER_LESSON",
          notes: student.notes ?? "",
          isActive: student.isActive,
        }}
      />
      <StudentScheduleManager
        studentId={student.id}
        defaultDuration={student.defaultLessonDuration}
        defaultPrice={student.defaultLessonPrice}
        defaultFormat={student.lessonFormat}
      />
      <StudentJournal
        studentId={student.id}
        initialEntries={student.journalEntries.map((e) => ({
          id: e.id,
          source: e.source,
          content: e.content,
          createdAt: e.createdAt.toISOString(),
        }))}
        initialPortrait={student.aiPortrait}
        initialPortraitAt={student.aiPortraitAt ? student.aiPortraitAt.toISOString() : null}
      />
    </div>
  );
}