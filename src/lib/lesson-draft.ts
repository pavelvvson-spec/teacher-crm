// Чернетка наступного уроку учня — коли дати ще немає.
// Щойно в календарі створюють новий урок для учня, чернетка сама переїжджає в нього.
import { prisma } from "@/lib/prisma";

export function draftHasContent(s: { draftNotes: string | null; draftHomework: string | null }, materialsCount: number) {
  return Boolean(s.draftNotes?.trim() || s.draftHomework?.trim() || materialsCount > 0);
}

// Переносить чернетку в урок. Нотатку/ДЗ кладе лише в порожні поля (щоб нічого не затерти).
// Повертає true, якщо щось перенесено.
export async function moveDraftToLesson(studentId: string, lessonId: string): Promise<boolean> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { draftNotes: true, draftHomework: true, _count: { select: { draftMaterials: true } } },
  });
  if (!student || !draftHasContent(student, student._count.draftMaterials)) return false;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { teacherNotes: true, homework: true },
  });
  if (!lesson) return false;

  const join = (a: string | null, b: string | null) => {
    const x = (a ?? "").trim();
    const y = (b ?? "").trim();
    if (!y) return x || null;
    if (!x) return y;
    return `${x}\n\n${y}`;
  };

  await prisma.$transaction([
    prisma.lesson.update({
      where: { id: lessonId },
      data: {
        teacherNotes: join(lesson.teacherNotes, student.draftNotes),
        homework: join(lesson.homework, student.draftHomework),
      },
    }),
    prisma.lessonMaterial.updateMany({
      where: { draftStudentId: studentId },
      data: { lessonId, draftStudentId: null },
    }),
    prisma.student.update({
      where: { id: studentId },
      data: { draftNotes: null, draftHomework: null, draftUpdatedAt: null },
    }),
  ]);
  return true;
}

// Найближчий запланований урок учня (якщо є — готуємо його, а не чернетку)
export async function nextScheduledLesson(studentId: string) {
  return prisma.lesson.findFirst({
    where: { studentId, startAt: { gt: new Date() }, status: { in: ["SCHEDULED", "RESCHEDULED"] } },
    orderBy: { startAt: "asc" },
    include: { student: { select: { firstName: true, lastName: true } } },
  });
}

// Останній урок із нотаткою чи ДЗ — для блоку «Минулий урок»
export async function lastLessonWithNotes(studentId: string) {
  const prev = await prisma.lesson.findFirst({
    where: {
      studentId,
      startAt: { lt: new Date() },
      OR: [{ teacherNotes: { not: null } }, { homework: { not: null } }],
    },
    orderBy: { startAt: "desc" },
    select: { startAt: true, teacherNotes: true, homework: true },
  });
  return prev ? { startAt: prev.startAt.toISOString(), teacherNotes: prev.teacherNotes, homework: prev.homework } : null;
}
