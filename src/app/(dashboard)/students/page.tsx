import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ResetAllStudentsButton from "@/components/ResetAllStudentsButton";
import PaymentsMoreMenu from "@/components/PaymentsMoreMenu";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const studentsByCreation = await prisma.student.findMany({ orderBy: { createdAt: "asc" } });
  const students = studentsByCreation.map((s: typeof studentsByCreation[number], i: number) => ({
    ...s,
    displayNumber: i + 1,
  }));

  const activeCount = students.filter((s: typeof students[number]) => s.isActive).length;
  const inactiveCount = students.length - activeCount;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Учні</h1>
          <p className="text-sm text-gray-400">
            {activeCount} активних{inactiveCount > 0 ? ` · ${inactiveCount} неактивних` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/students/new"
            className="px-4 py-2.5 bg-pink-600 text-white rounded-xl font-medium hover:bg-pink-700"
          >
            + Додати учня
          </Link>
          <PaymentsMoreMenu>
            <ResetAllStudentsButton />
          </PaymentsMoreMenu>
        </div>
      </div>

      {students.length === 0 ? (
        <p className="text-gray-500">Учнів ще немає. Додай першого!</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {students.map((student: typeof students[number]) => (
            <Link
              key={student.id}
              href={`/students/${student.id}`}
              className={`flex items-center gap-3 bg-white rounded-xl shadow-sm px-4 py-3 hover:bg-pink-50/40 hover:shadow ${
                student.isActive ? "" : "opacity-60"
              }`}
            >
              <span className="w-7 text-xs text-gray-400 tabular-nums shrink-0">№{student.displayNumber}</span>
              <span className="flex-1 min-w-0 font-medium text-gray-800 truncate">
                {student.firstName} {student.lastName ?? ""}
              </span>
              {student.lessonFormat !== "ONLINE" && (
                <span className="text-xs text-gray-400 shrink-0">офлайн</span>
              )}
              {!student.isActive && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md shrink-0">
                  неактивний
                </span>
              )}
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 shrink-0">
                {student.englishLevel}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
