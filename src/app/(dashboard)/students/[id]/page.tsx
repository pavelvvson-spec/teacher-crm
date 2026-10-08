import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import StudentForm from "@/components/StudentForm";
import StudentScheduleManager from "@/components/StudentScheduleManager";
import StudentJournal from "@/components/StudentJournal";
import StudentActionsMenu from "@/components/StudentActionsMenu";
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

  const formValues = {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName ?? "",
    phone: student.phone ?? "",
    telegramUsername: student.telegramUsername ?? "",
    contactChannel: student.contactChannel,
    viberPhone: student.viberPhone ?? "",
    birthYear: student.birthYear ? String(student.birthYear) : "",
    isAdult: student.isAdult,
    birthDay: student.birthDay ? String(student.birthDay) : "",
    birthMonth: student.birthMonth ? String(student.birthMonth) : "",
    englishLevel: student.englishLevel,
    lessonFormat: student.lessonFormat,
    defaultLessonDuration: student.defaultLessonDuration,
    defaultLessonPrice: student.defaultLessonPrice,
    paymentFrequency: student.paymentFrequency ?? "PER_LESSON",
    notes: student.notes ?? "",
    isActive: student.isActive,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-400">
            Учень №{studentNumber} · {student.englishLevel}
            {!student.isActive && (
              <span className="ml-2 text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md">неактивний</span>
            )}
          </p>
          <h1 className="text-2xl font-semibold text-gray-800 truncate">
            {student.firstName} {student.lastName ?? ""}
          </h1>
        </div>
        <StudentActionsMenu studentId={student.id} isActive={student.isActive} activatePayload={formValues} />
      </div>

      {/* На телефоні спершу журнал і графік (щоденне), потім анкета; на комп'ютері — дві колонки */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="space-y-4 lg:order-2">
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
          <StudentScheduleManager
            studentId={student.id}
            defaultDuration={student.defaultLessonDuration}
            defaultPrice={student.defaultLessonPrice}
            defaultFormat={student.lessonFormat}
          />
        </div>
        <div className="lg:order-1">
          <StudentForm initialValues={formValues} />
        </div>
      </div>
    </div>
  );
}
