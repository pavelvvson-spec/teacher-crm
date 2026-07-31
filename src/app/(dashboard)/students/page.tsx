import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const students = await prisma.student.findMany({ orderBy: { firstName: "asc" } });

  const activeCount = students.filter((s: typeof students[number]) => s.isActive).length;
  const inactiveCount = students.length - activeCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Учні</h1>
        <Link
          href="/students/new"
          className="px-5 py-3 bg-pink-600 text-white rounded-xl font-medium hover:bg-pink-700"
        >
          + Додати учня
        </Link>
      </div>

      <p className="text-sm text-gray-500">
        Всього: {students.length} · Активних: {activeCount} · Неактивних: {inactiveCount}
      </p>

      {students.length === 0 ? (
        <p className="text-gray-500">Учнів ще немає. Додай першого!</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
          {students.map((student: typeof students[number]) => (
            <Link
              key={student.id}
              href={`/students/${student.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-gray-50"
            >
              <div>
                <p className="font-medium text-gray-800">
                  {student.firstName} {student.lastName ?? ""}
                </p>
                <p className="text-sm text-gray-500">
                  Рівень: {student.englishLevel} ·{" "}
                  {student.lessonFormat === "ONLINE" ? "Онлайн" : "Офлайн"}
                </p>
              </div>
              {!student.isActive && (
                <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-lg">
                  Неактивний
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}