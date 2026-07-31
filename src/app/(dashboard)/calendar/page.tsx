import { prisma } from "@/lib/prisma";
import CalendarView from "@/components/CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const students = await prisma.student.findMany({
    where: { isActive: true },
    orderBy: { firstName: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800">Календар</h1>
      <CalendarView
        students={students.map((s: typeof students[number]) => ({
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          defaultLessonDuration: s.defaultLessonDuration,
          defaultLessonPrice: s.defaultLessonPrice,
          lessonFormat: s.lessonFormat,
        }))}
      />
    </div>
  );
}