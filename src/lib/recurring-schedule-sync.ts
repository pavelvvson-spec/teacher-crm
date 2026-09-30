import { prisma } from "@/lib/prisma";
import { findConflictingLesson, findExactDuplicateLesson } from "@/lib/lesson-conflict";
import { kyivWallTimeToUtc, getKyivTimeParts } from "@/lib/kyiv-time";

const WEEKS_AHEAD = 8;

export async function syncStudentLessons(studentId: string, fromDate?: Date) {
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

    const conflict = await findConflictingLesson(
      candidate.startAt,
      candidate.endAt,
      undefined,
      candidate.studentId
    );
    if (conflict) continue;

    await prisma.lesson.create({ data: candidate });
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

  const futureLessons = await prisma.lesson.findMany({
    where: {
      studentId,
      status: "SCHEDULED",
      startAt: { gte: earliestFrom },
    },
  });

  const staleLessonIds = futureLessons
    .filter((lesson) => !matchesAnySchedule(lesson.startAt))
    .map((lesson) => lesson.id);

  let lessonsCancelled = 0;
  if (staleLessonIds.length > 0) {
    await prisma.reminder.updateMany({
      where: { lessonId: { in: staleLessonIds }, status: "PENDING" },
      data: { status: "SKIPPED" },
    });

    const result = await prisma.lesson.updateMany({
      where: { id: { in: staleLessonIds } },
      data: {
        status: "CANCELLED_BY_TEACHER",
        cancellationReason: "Автоматично скасовано: змінено графік уроків",
      },
    });
    lessonsCancelled = result.count;
  }

  return { lessonsCreated, lessonsCancelled };
}