import { prisma } from "@/lib/prisma";
import LessonsPrepView from "@/components/LessonsPrepView";
import StudentDraftBlock from "@/components/StudentDraftBlock";

export const dynamic = "force-dynamic";

export default async function LessonsPage() {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const lessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: now, lte: weekAhead },
      status: "SCHEDULED",
    },
    include: { student: true, materials: true },
    orderBy: { startAt: "asc" },
  });

  // Для блоку «Минулий урок»: недавні уроки цих учнів, де є нотатка або ДЗ
  const studentIds = [...new Set(lessons.map((l) => l.studentId))];
  const history = studentIds.length
    ? await prisma.lesson.findMany({
        where: {
          studentId: { in: studentIds },
          startAt: { gte: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000), lte: weekAhead },
          OR: [{ teacherNotes: { not: null } }, { homework: { not: null } }],
        },
        select: { id: true, studentId: true, startAt: true, teacherNotes: true, homework: true },
        orderBy: { startAt: "desc" },
      })
    : [];

  function previousFor(lesson: (typeof lessons)[number]) {
    const prev = history.find(
      (h) => h.studentId === lesson.studentId && h.id !== lesson.id && h.startAt < lesson.startAt
    );
    return prev
      ? { startAt: prev.startAt.toISOString(), teacherNotes: prev.teacherNotes, homework: prev.homework }
      : null;
  }

  // Чернетки «Наступний урок · дата ще не відома»
  const draftStudents = await prisma.student.findMany({
    where: {
      isActive: true,
      OR: [{ draftNotes: { not: null } }, { draftHomework: { not: null } }, { draftMaterials: { some: {} } }],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      draftNotes: true,
      draftHomework: true,
      _count: { select: { draftMaterials: true } },
    },
    orderBy: { firstName: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800">Підготовка до уроку</h1>
      {draftStudents.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Без дати</h2>
          {draftStudents.map((d) => (
            <StudentDraftBlock
              key={d.id}
              studentId={d.id}
              studentName={`${d.firstName} ${d.lastName ?? ""}`.trim()}
              showName
              hasFutureLesson={false}
              draft={{ teacherNotes: d.draftNotes, homework: d.draftHomework, materialsCount: d._count.draftMaterials }}
            />
          ))}
        </section>
      )}
      <LessonsPrepView
        lessons={lessons.map((l: typeof lessons[number]) => ({
          id: l.id,
          startAt: l.startAt.toISOString(),
          duration: l.duration,
          teacherNotes: l.teacherNotes,
          homework: l.homework,
          student: { firstName: l.student.firstName, lastName: l.student.lastName },
          materials: l.materials.map((m: typeof l.materials[number]) => ({
            id: m.id,
            type: m.type,
            title: m.title,
            url: m.url,
          })),
          previous: previousFor(l),
        }))}
      />
    </div>
  );
}