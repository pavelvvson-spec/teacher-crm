import { prisma } from "@/lib/prisma";
import { formatTime } from "@/lib/calendar-utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const todayLessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: startOfToday, lte: endOfToday },
      status: { in: ["SCHEDULED", "COMPLETED", "RESCHEDULED"] },
    },
    include: { student: true },
    orderBy: { startAt: "asc" },
  });

  const todayIncome = todayLessons.reduce(
    (sum: number, l: typeof todayLessons[number]) => sum + l.price,
    0
  );

  return (
    <div className="space-y-6">
      <div className="bg-pink-600 text-white rounded-2xl shadow-sm p-6 text-center">
        <p className="text-xl font-semibold">Сашуню, у тебе все вийде! 💪💖</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm text-gray-500">Уроків сьогодні</p>
          <p className="text-2xl font-semibold text-gray-800">{todayLessons.length}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm text-gray-500">Заробиш сьогодні</p>
          <p className="text-2xl font-semibold text-green-600">{todayIncome} грн</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Заплановано на сьогодні</h2>
        {todayLessons.length === 0 ? (
          <p className="text-gray-500">На сьогодні уроків немає.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {todayLessons.map((lesson: typeof todayLessons[number]) => (
              <div key={lesson.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-gray-800">
                    {lesson.student.firstName} {lesson.student.lastName ?? ""}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatTime(new Date(lesson.startAt))} · {lesson.duration} хв
                  </p>
                </div>
                <p className="font-semibold text-pink-600">{lesson.price} грн</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}