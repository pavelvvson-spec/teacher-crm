import { prisma } from "@/lib/prisma";
import CalendarView from "@/components/CalendarView";
import SyncAllSchedulesButton from "@/components/SyncAllSchedulesButton";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const students = await prisma.student.findMany({
    where: { isActive: true },
    orderBy: { firstName: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold text-gray-800">Календар</h1>
        <SyncAllSchedulesButton />
      </div>
      <CalendarView
        students={students.map((s: typeof students[number]) => ({
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          defaultLessonDuration: s.defaultLessonDuration,
          defaultLessonPrice: s.defaultLessonPrice,
          lessonFormat: s.lessonFormat,
          paymentFrequency: s.paymentFrequency ?? "PER_LESSON",
        }))}
      />
    </div>
  );
}