"use client";

import { useState } from "react";
import { formatTime } from "@/lib/calendar-utils";
import LessonPrepModal from "@/components/LessonPrepModal";

type Material = {
  id: string;
  type: string;
  title: string;
  url: string;
};

type Lesson = {
  id: string;
  startAt: string;
  duration: number;
  teacherNotes: string | null;
  homework: string | null;
  student: { firstName: string; lastName: string | null };
  materials: Material[];
  // Попередній урок цього учня з нотаткою або ДЗ (лише для перегляду)
  previous: { startAt: string; teacherNotes: string | null; homework: string | null } | null;
};

export default function LessonsPrepView({ lessons }: { lessons: Lesson[] }) {
  const [lessonsState, setLessonsState] = useState<Lesson[]>(lessons);
  const [openLessonId, setOpenLessonId] = useState<string | null>(null);

  const materialTypeLabels: Record<string, string> = {
    LINK: "Посилання",
    YOUTUBE: "YouTube",
    PDF: "PDF",
    IMAGE: "Скріншот",
  };

  function openLesson(lessonId: string) {
    setOpenLessonId(lessonId);
  }

  const grouped: Record<string, Lesson[]> = {};
  for (const lesson of lessonsState) {
    const dayKey = new Date(lesson.startAt).toLocaleDateString("uk-UA", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    if (!grouped[dayKey]) grouped[dayKey] = [];
    grouped[dayKey].push(lesson);
  }

  // Урок вважається підготовленим, якщо є нотатка, ДЗ або хоча б один матеріал
  function isPrepared(l: Lesson): boolean {
    return Boolean(l.teacherNotes?.trim() || l.homework?.trim() || l.materials.length > 0);
  }

  const openLesson_ = lessonsState.find((l) => l.id === openLessonId) || null;

  return (
    <div className="space-y-6">
      {lessonsState.length === 0 ? (
        <p className="text-gray-500">На найближчий тиждень запланованих уроків немає.</p>
      ) : (
        Object.entries(grouped).map(([day, dayLessons]) => {
          const readyCount = dayLessons.filter(isPrepared).length;
          const allReady = readyCount === dayLessons.length;
          return (
            <div key={day} className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h2 className="text-lg font-semibold text-gray-800 capitalize">{day}</h2>
                <span className={`text-xs sm:text-sm whitespace-nowrap ${allReady ? "text-green-600" : "text-gray-400"}`}>
                  Підготовлено {readyCount} з {dayLessons.length}
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {dayLessons.map((lesson) => {
                  const ready = isPrepared(lesson);
                  return (
                    <div key={lesson.id} className="py-2.5 flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <p className="font-medium text-gray-800">
                            {lesson.student.firstName} {lesson.student.lastName ?? ""}
                          </p>
                          <span className="text-sm text-gray-400">
                            {formatTime(new Date(lesson.startAt))} · {lesson.duration} хв
                          </span>
                          {ready ? (
                            <span className="text-xs text-green-600 font-medium">✓ готово</span>
                          ) : (
                            <span className="text-xs text-gray-400">не підготовлено</span>
                          )}
                        </div>
                        {(lesson.teacherNotes || lesson.homework || lesson.materials.length > 0) && (
                          <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                            {lesson.teacherNotes && (
                              <p className="line-clamp-2">
                                <span className="text-gray-400">Нотатка:</span> {lesson.teacherNotes}
                              </p>
                            )}
                            {lesson.homework && (
                              <p className="line-clamp-2">
                                <span className="text-gray-400">ДЗ:</span> {lesson.homework}
                              </p>
                            )}
                            {lesson.materials.length > 0 && (
                              <p className="flex flex-wrap gap-x-2 gap-y-0.5">
                                <span className="text-gray-400">Матеріали:</span>
                                {lesson.materials.map((m) => (
                                  <a
                                    key={m.id}
                                    href={m.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-pink-600 underline decoration-pink-200 hover:decoration-pink-600"
                                  >
                                    {materialTypeLabels[m.type] || m.type}: {m.title}
                                  </a>
                                ))}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => openLesson(lesson.id)}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${
                          ready
                            ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            : "bg-pink-600 text-white hover:bg-pink-700"
                        }`}
                      >
                        {ready ? "Відкрити" : "Підготувати"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {openLesson_ && (
        <LessonPrepModal
          key={openLesson_.id}
          lesson={openLesson_}
          onClose={() => setOpenLessonId(null)}
          onSaved={(fields) =>
            setLessonsState((prev) => prev.map((l) => (l.id === openLesson_.id ? { ...l, ...fields } : l)))
          }
          onMaterialsChange={(materials) =>
            setLessonsState((prev) => prev.map((l) => (l.id === openLesson_.id ? { ...l, materials } : l)))
          }
        />
      )}
    </div>
  );
}