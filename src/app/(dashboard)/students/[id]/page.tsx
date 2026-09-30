import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import StudentForm from "@/components/StudentForm";
import StudentScheduleManager from "@/components/StudentScheduleManager";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const student = await prisma.student.findUnique({ where: { id } });

  if (!student) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-400 font-medium">Учень №{student.studentNumber}</p>
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
    </div>
  );
}