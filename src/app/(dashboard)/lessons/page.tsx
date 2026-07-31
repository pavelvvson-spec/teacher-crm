import { prisma } from "@/lib/prisma";
import LessonsPrepView from "@/components/LessonsPrepView";

export const dynamic = "force-dynamic";

export default async function LessonsPage() {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const lessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: now, lte: weekAhead },
      status: "SCHEDULED",
    },
    include: { student: true },
    orderBy: { startAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800">Підготовка до уроку</h1>
      <LessonsPrepView
        lessons={lessons.map((l: typeof lessons[number]) => ({
          id: l.id,
          startAt: l.startAt.toISOString(),
          duration: l.duration,
          student: { firstName: l.student.firstName, lastName: l.student.lastName },
        }))}
      />
    </div>
  );
}