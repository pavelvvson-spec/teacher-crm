import { prisma } from "@/lib/prisma";
import { findConflictingLesson, findExactDuplicateLesson } from "@/lib/lesson-conflict";
import { kyivWallTimeToUtc, getKyivTimeParts } from "@/lib/kyiv-time";

const WEEKS_AHEAD = 8;

type SyncOptions = {
  dryRun?: boolean;
  excludeLessonIds?: string[];
};

export async function syncStudentLessons(
  studentId: string,
  fromDate?: Date,
  options: SyncOptions = {}
) {
  const dryRun = Boolean(options.dryRun);
  const excludeIds = new Set(options.excludeLessonIds ?? []);

  const activeSchedules = await prisma.recurringSchedule.findMany({
    where: { studentId, isActive: true },
  });

  const earliestFrom =
    fromDate ??
    activeSchedules.reduce<Date | null>((min, s) => {
      if (!min || s.activeFrom < min) return s.activeFrom;
      return min;
    }, null) ??
    new Date();

  const candidateLessons: {
    studentId: string;
    startAt: Date;
    endAt: Date;
    duration: number;
    format: "ONLINE" | "OFFLINE";
    price: number;
  }[] = [];

  for (const schedule of activeSchedules) {
    const [hours, minutes] = schedule.startTime.split(":").map(Number);
    const scheduleStart = schedule.activeFrom > earliestFrom ? schedule.activeFrom : earliestFrom;
    const cursor = new Date(scheduleStart);
    cursor.setHours(0, 0, 0, 0);

    for (let i = 0; i < WEEKS_AHEAD * 7; i++) {
      if (cursor.getDay() === schedule.dayOfWeek) {
        const startAt = kyivWallTimeToUtc(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate(),
          hours,
          minutes
        );

        if (startAt >= schedule.activeFrom && (!schedule.activeUntil || startAt <= schedule.activeUntil)) {
          const endAt = new Date(startAt.getTime() + schedule.duration * 60000);
          candidateLessons.push({
            studentId,
            startAt,
            endAt,
            duration: schedule.duration,
            format: schedule.format,
            price: schedule.price,
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  let lessonsCreated = 0;
  for (const candidate of candidateLessons) {
    const duplicate = await findExactDuplicateLesson(candidate.studentId, candidate.startAt);
    if (duplicate) continue;

    // Урок з цього слота вже перенесено вручну на інший час: не створюємо дубль
    const movedAway = await prisma.lesson.findFirst({
      where: { studentId: candidate.studentId, originalStartAt: candidate.startAt },
    });
    if (movedAway) continue;

    const conflict = await findConflictingLesson(
      candidate.startAt,
      candidate.endAt,
      undefined,
      candidate.studentId
    );
    if (conflict) continue;

    if (!dryRun) {
      await prisma.lesson.create({ data: candidate });
    }
    lessonsCreated++;
  }

  const matchesAnySchedule = (lessonStartAt: Date) => {
    const { hours, minutes, dayOfWeek } = getKyivTimeParts(lessonStartAt);
    const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

    return activeSchedules.some((s) => {
      if (s.dayOfWeek !== dayOfWeek) return false;
      if (s.startTime !== timeStr) return false;
      if (lessonStartAt < s.activeFrom) return false;
      if (s.activeUntil && lessonStartAt > s.activeUntil) return false;
      return true;
    });
  };

  // Уроки, створені або перенесені вручну, при зміні графіка не чіпаємо
  const futureLessons = await prisma.lesson.findMany({
    where: {
      studentId,
      status: "SCHEDULED",
      isManual: false,
      startAt: { gte: earliestFrom },
    },
    include: { _count: { select: { materials: true } } },
  });

  const staleLessons = futureLessons.filter(
    (lesson) => !matchesAnySchedule(lesson.startAt) && !excludeIds.has(lesson.id)
  );

  const cancelledLessons = staleLessons.map((lesson) => ({
    id: lesson.id,
    startAt: lesson.startAt,
    hasPrep: Boolean(lesson.teacherNotes || lesson.homework || lesson._count.materials > 0),
  }));

  let lessonsCancelled = 0;
  let lessonsDeleted = 0;

  if (staleLessons.length > 0) {
    if (dryRun) {
      lessonsCancelled = staleLessons.length;
    } else {
      for (const lesson of staleLessons) {
        const hasPrep = Boolean(
          lesson.teacherNotes || lesson.homework || lesson._count.materials > 0
        );

        if (!hasPrep) {
          // Немає підготовки: видаляємо урок повністю, щоб не було сірих
          try {
            await prisma.reminder.deleteMany({ where: { lessonId: lesson.id } });
            await prisma.lesson.delete({ where: { id: lesson.id } });
            lessonsDeleted++;
            continue;
          } catch {
            // Якщо не вдалося видалити, скасовуємо як раніше
          }
        }

        await prisma.reminder.updateMany({
          where: { lessonId: lesson.id, status: "PENDING" },
          data: { status: "SKIPPED" },
        });
        await prisma.lesson.update({
          where: { id: lesson.id },
          data: {
            status: "CANCELLED_BY_TEACHER",
            cancellationReason: "Автоматично скасовано: змінено графік уроків",
          },
        });
        lessonsCancelled++;
      }
    }
  }

  // Прибираємо вже наявні сірі майбутні уроки, які втратили актуальність
  if (!dryRun) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const grayLessons = await prisma.lesson.findMany({
      where: {
        studentId,
        status: { in: ["CANCELLED_BY_TEACHER", "CANCELLED_BY_STUDENT"] },
        startAt: { gte: today },
      },
      include: { _count: { select: { materials: true } } },
    });

    // Час активних (не скасованих) майбутніх уроків цього учня
    const activeFuture = await prisma.lesson.findMany({
      where: {
        studentId,
        status: { notIn: ["CANCELLED_BY_TEACHER", "CANCELLED_BY_STUDENT"] },
        startAt: { gte: today },
      },
      select: { startAt: true },
    });
    const activeTimes = new Set(activeFuture.map((l) => l.startAt.getTime()));

    for (const lesson of grayLessons) {
      const hasPrep = Boolean(
        lesson.teacherNotes || lesson.homework || lesson._count.materials > 0
      );
      if (hasPrep) continue;

      const autoCancelled = Boolean(
        lesson.cancellationReason?.startsWith("Автоматично скасовано")
      );
      const outdated =
        lesson.status === "CANCELLED_BY_TEACHER" &&
        !lesson.isManual &&
        !matchesAnySchedule(lesson.startAt);
      // Сірий дубль: на цей самий час уже є активний урок
      const duplicateOfActive = activeTimes.has(lesson.startAt.getTime());

      if (!autoCancelled && !outdated && !duplicateOfActive) continue;

      try {
        await prisma.reminder.deleteMany({ where: { lessonId: lesson.id } });
        await prisma.lesson.delete({ where: { id: lesson.id } });
        lessonsDeleted++;
      } catch {
        // Не вдалося видалити: лишаємо як є
      }
    }
  }

  return { lessonsCreated, lessonsCancelled, lessonsDeleted, cancelledLessons };
}