"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  startOfDay,
  addDays,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  formatDayLabel,
  formatMonthYear,
  formatTime,
  LESSON_STATUS_LABELS,
} from "@/lib/calendar-utils";
import LessonForm from "@/components/LessonForm";
import CalendarResetMenu from "@/components/CalendarResetMenu";
import SyncAllSchedulesButton from "@/components/SyncAllSchedulesButton";
import PaymentsMoreMenu from "@/components/PaymentsMoreMenu";
import LessonPrepModal from "@/components/LessonPrepModal";
import { byGender, noShowPaidNote } from "@/lib/gender";
import SendLinkButton from "@/components/SendLinkButton";

type Student = {
  id: string;
  firstName: string;
  lastName: string | null;
  defaultLessonDuration: number;
  defaultLessonPrice: number;
  lessonFormat: string;
  paymentFrequency: string;
};

type Lesson = {
  id: string;
  studentId: string;
  startAt: string;
  endAt: string;
  duration: number;
  format: string;
  status: string;
  paymentStatus: string;
  meetingLink: string | null;
  teacherNotes: string | null;
  homework: string | null;
  student: { firstName: string; lastName: string | null; gender?: string | null };
};

type ViewMode = "day" | "week" | "month";

const WEEKDAY_HEADERS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

export default function CalendarView({ students }: { students: Student[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [reschedulingLesson, setReschedulingLesson] = useState<Lesson | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [askNoShowFor, setAskNoShowFor] = useState<string | null>(null);

  const [showMaterials, setShowMaterials] = useState(false);

  const getRange = useCallback(() => {
    if (viewMode === "day") {
      const from = startOfDay(currentDate);
      const to = addDays(from, 1);
      return { from, to };
    }
    if (viewMode === "week") {
      const from = startOfWeek(currentDate);
      const to = addDays(from, 7);
      return { from, to };
    }
    const from = startOfMonth(currentDate);
    const to = endOfMonth(currentDate);
    return { from, to };
  }, [viewMode, currentDate]);

  const loadLessons = useCallback(async () => {
    setLoading(true);
    const { from, to } = getRange();
    const res = await fetch(
      `/api/lessons?from=${from.toISOString()}&to=${to.toISOString()}`
    );
    const data = await res.json();
    setLessons(data);
    setLoading(false);
  }, [getRange]);

  useEffect(() => {
    loadLessons();
  }, [loadLessons]);

  function goToPrevious() {
    if (viewMode === "day") setCurrentDate((d) => addDays(d, -1));
    else if (viewMode === "week") setCurrentDate((d) => addDays(d, -7));
    else setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  function goToNext() {
    if (viewMode === "day") setCurrentDate((d) => addDays(d, 1));
    else if (viewMode === "week") setCurrentDate((d) => addDays(d, 7));
    else setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  // Закриття вікон: хрестик, клік поза вікном, Esc
  function closeLesson() {
    setSelectedLesson(null);
    setReschedulingLesson(null);
    setAskNoShowFor(null);
  }

  function closePrep() {
    setShowMaterials(false);
    setSelectedLesson(null);
  }


  useEffect(() => {
    if (!selectedLesson && !showForm) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showForm) setShowForm(false);
      else if (showMaterials) return; // вікно підготовки закривається само (з перевіркою незбереженого)
      else closeLesson();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  async function updateLessonFields(lesson: Lesson, fields: Record<string, string>) {
    const res = await fetch(`/api/lessons/${lesson.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      const updated = { ...lesson, ...fields };
      setSelectedLesson(updated);
      setLessons((prev) => prev.map((l) => (l.id === lesson.id ? { ...l, ...fields } : l)));
    }
  }

  async function toggleStatus(lesson: Lesson, status: string) {
    const newStatus = lesson.status === status ? "SCHEDULED" : status;
    await updateLessonFields(lesson, { status: newStatus });
  }

  // Знімає стару позначку «оплачено» з уроку (для старих записів).
  // Нові оплати вносяться на сторінці «Оплати».
  async function clearPaidFlag(lesson: Lesson) {
    if (!confirm("Зняти стару позначку «оплачено» з цього уроку?")) return;
    await updateLessonFields(lesson, { paymentStatus: "UNPAID" });
  }

  async function markNoShow(lesson: Lesson, charged: boolean) {
    setAskNoShowFor(null);
    if (charged) {
      // Учень не прийшов, але урок оплачується: рахуємо як проведений, з приміткою
      const noteLine = noShowPaidNote(lesson.student.gender);
      const teacherNotes = lesson.teacherNotes
        ? `${lesson.teacherNotes}\n${noteLine}`
        : noteLine;
      await updateLessonFields(lesson, { status: "COMPLETED", teacherNotes });
    } else {
      await updateLessonFields(lesson, { status: "NO_SHOW" });
    }
  }

  async function cancelLesson(lesson: Lesson) {
    if (!confirm("Скасувати цей урок?")) return;
    await fetch(`/api/lessons/${lesson.id}`, { method: "DELETE" });
    setSelectedLesson(null);
    loadLessons();
  }

  async function deleteLessonPermanently(lesson: Lesson) {
    if (!confirm("Видалити цей урок назавжди? Цю дію не можна скасувати.")) return;
    await fetch(`/api/lessons/${lesson.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hard: true }),
    });
    setSelectedLesson(null);
    loadLessons();
  }

  function startReschedule(lesson: Lesson) {
    const current = new Date(lesson.startAt);
    setRescheduleDate(current.toISOString().slice(0, 10));
    setRescheduleTime(current.toTimeString().slice(0, 5));
    setReschedulingLesson(lesson);
  }

  async function confirmReschedule() {
    if (!reschedulingLesson) return;

    const newStartAt = new Date(`${rescheduleDate}T${rescheduleTime}:00`);

    const res = await fetch(`/api/lessons/${reschedulingLesson.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startAt: newStartAt.toISOString(),
        duration: reschedulingLesson.duration,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Не вдалося перенести урок");
      return;
    }

    setReschedulingLesson(null);
    setSelectedLesson(null);
    loadLessons();
  }

  function openMaterials(lesson: Lesson) {
    setSelectedLesson(lesson);
    setShowMaterials(true);
  }


  const { from } = getRange();

  let days: Date[];
  if (viewMode === "month") {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = addDays(startOfWeek(monthEnd), 6);
    const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000) + 1;
    days = Array.from({ length: totalDays }, (_, i) => addDays(gridStart, i));
  } else {
    const daysToShow = viewMode === "day" ? 1 : 7;
    days = Array.from({ length: daysToShow }, (_, i) => addDays(from, i));
  }

  function lessonsForDay(day: Date) {
    const dayStr = day.toDateString();
    return lessons
      .filter((l) => new Date(l.startAt).toDateString() === dayStr)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }

  const statusColors: Record<string, string> = {
    SCHEDULED: "bg-pink-100 text-pink-800",
    COMPLETED: "bg-green-100 text-green-800",
    CANCELLED_BY_STUDENT: "bg-gray-100 text-gray-500",
    CANCELLED_BY_TEACHER: "bg-gray-100 text-gray-500",
    RESCHEDULED: "bg-yellow-100 text-yellow-800",
    NO_SHOW: "bg-red-100 text-red-800",
  };

  // Кольори крапок для місячного вигляду на телефоні
  const dotColors: Record<string, string> = {
    SCHEDULED: "bg-pink-400",
    COMPLETED: "bg-green-500",
    CANCELLED_BY_STUDENT: "bg-gray-300",
    CANCELLED_BY_TEACHER: "bg-gray-300",
    RESCHEDULED: "bg-yellow-400",
    NO_SHOW: "bg-red-500",
  };

  // На телефоні дотик на день у місячному вигляді відкриває цей день
  function openDayFromMonth(day: Date) {
    if (viewMode !== "month") return;
    if (typeof window !== "undefined" && window.innerWidth >= 640) return;
    setCurrentDate(day);
    setViewMode("day");
  }

  const selectedStudent = selectedLesson
    ? students.find((s) => s.id === selectedLesson.studentId)
    : null;
  const isPrepaidStudent = selectedStudent?.paymentFrequency === "MONTHLY_PREPAID";

  // Підпис періоду між стрілками і кнопка повернення до поточного періоду
  const MONTHS_GEN = [
    "січня", "лютого", "березня", "квітня", "травня", "червня",
    "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
  ];
  function periodLabel(): string {
    if (viewMode === "day") {
      const wd = currentDate.toLocaleDateString("uk-UA", { weekday: "long" });
      return `${wd}, ${currentDate.getDate()} ${MONTHS_GEN[currentDate.getMonth()]}`;
    }
    if (viewMode === "week") {
      const s = startOfWeek(currentDate);
      const e = addDays(s, 6);
      return s.getMonth() === e.getMonth()
        ? `${s.getDate()}–${e.getDate()} ${MONTHS_GEN[e.getMonth()]}`
        : `${s.getDate()} ${MONTHS_GEN[s.getMonth()]} – ${e.getDate()} ${MONTHS_GEN[e.getMonth()]}`;
    }
    return formatMonthYear(currentDate);
  }
  const now = new Date();
  const isCurrentPeriod =
    viewMode === "day"
      ? currentDate.toDateString() === now.toDateString()
      : viewMode === "week"
      ? startOfWeek(currentDate).getTime() === startOfWeek(now).getTime()
      : currentDate.getFullYear() === now.getFullYear() && currentDate.getMonth() === now.getMonth();
  const backLabel = viewMode === "day" ? "Сьогодні" : viewMode === "week" ? "Цей тиждень" : "Цей місяць";

  // Тиждень: порожні субота/неділя вужчі, щоб буднім дням було більше місця
  const weekColumns =
    viewMode === "week"
      ? days.map((d) => ((d.getDay() === 0 || d.getDay() === 6) && lessonsForDay(d).length === 0 ? "0.5fr" : "1fr")).join(" ")
      : undefined;

  const LEGEND: { label: string; dot: string }[] = [
    { label: "заплановано", dot: "bg-pink-400" },
    { label: "проведено", dot: "bg-green-500" },
    { label: "перенесено", dot: "bg-yellow-400" },
    { label: "не з'явився", dot: "bg-red-500" },
    { label: "скасовано", dot: "bg-gray-300" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="order-1 flex gap-1 bg-gray-100 rounded-xl p-1">
          {(["day", "week", "month"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-2.5 sm:px-4 py-1.5 rounded-lg text-sm font-medium ${
                viewMode === mode ? "bg-white text-pink-700 shadow-sm" : "text-gray-600 hover:text-gray-800"
              }`}
            >
              {mode === "day" ? "День" : mode === "week" ? "Тиждень" : "Місяць"}
            </button>
          ))}
        </div>

        <div className="order-3 sm:order-2 w-full sm:w-auto flex items-center gap-1">
          <button
            onClick={goToPrevious}
            aria-label="Назад"
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
          >
            ←
          </button>
          <span className="flex-1 sm:flex-none sm:min-w-[9.5rem] text-center font-medium text-gray-800 first-letter:uppercase">
            {periodLabel()}
          </span>
          <button
            onClick={goToNext}
            aria-label="Вперед"
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
          >
            →
          </button>
          {!isCurrentPeriod && (
            <button
              onClick={goToToday}
              className="ml-1 px-3 py-1.5 rounded-lg text-sm text-pink-700 bg-pink-50 hover:bg-pink-100"
            >
              {backLabel}
            </button>
          )}
        </div>

        <div className="order-2 sm:order-3 flex items-center gap-1 ml-auto">
          <button
            onClick={() => setShowForm(true)}
            className="px-3 sm:px-4 py-2 sm:py-2.5 bg-pink-600 text-white rounded-xl font-medium hover:bg-pink-700 whitespace-nowrap"
          >
            <span className="sm:hidden">+ Урок</span>
            <span className="hidden sm:inline">+ Створити урок</span>
          </button>
          <PaymentsMoreMenu>
            <SyncAllSchedulesButton />
            <CalendarResetMenu onDone={loadLessons} />
          </PaymentsMoreMenu>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1 text-[11px] sm:text-xs text-gray-500">
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${l.dot}`} />
            {l.label}
          </span>
        ))}
      </div>

      {viewMode === "month" && (
        <div className="grid grid-cols-7 gap-1 sm:gap-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {WEEKDAY_HEADERS.map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Завантаження...</p>
      ) : (
        <div
          style={weekColumns ? ({ "--week-cols": weekColumns } as React.CSSProperties) : undefined}
          className={`grid ${
            viewMode === "day"
              ? "grid-cols-1 gap-3"
              : viewMode === "week"
              ? "grid-cols-1 sm:[grid-template-columns:var(--week-cols)] gap-3"
              : "grid-cols-7 gap-1 sm:gap-3"
          }`}
        >
          {days.map((day) => {
            const dayLessons = lessonsForDay(day);
            const isToday = day.toDateString() === new Date().toDateString();
            const isCurrentMonth = viewMode !== "month" || day.getMonth() === currentDate.getMonth();
            const isMonth = viewMode === "month";
            return (
              <div
                key={day.toISOString()}
                onClick={() => openDayFromMonth(day)}
                className={`rounded-2xl shadow-sm ${
                  isMonth ? "p-1 sm:p-3 min-h-[64px] sm:min-h-[100px] cursor-pointer sm:cursor-default" : "p-3 min-h-[100px]"
                } ${isCurrentMonth ? "bg-white" : "bg-gray-50"} ${isToday ? "ring-2 ring-pink-400" : ""}`}
              >
                <p
                  className={`text-sm font-medium mb-2 ${
                    isMonth ? "text-center sm:text-left" : ""
                  } ${isCurrentMonth ? "text-gray-500" : "text-gray-300"}`}
                >
                  {isMonth ? (
                    <>
                      <span className="sm:hidden">{day.getDate()}</span>
                      <span className="hidden sm:inline">{formatDayLabel(day)}</span>
                    </>
                  ) : (
                    formatDayLabel(day)
                  )}
                </p>
                {isCurrentMonth && isMonth && dayLessons.length > 0 && (
                  <div className="sm:hidden flex flex-wrap justify-center gap-1">
                    {dayLessons.map((lesson) => (
                      <span
                        key={lesson.id}
                        className={`w-2 h-2 rounded-full ${dotColors[lesson.status] ?? "bg-gray-300"}`}
                      />
                    ))}
                  </div>
                )}
                {isCurrentMonth && (
                  <div className={isMonth ? "hidden sm:block space-y-1" : "space-y-1"}>
                    {dayLessons.map((lesson) => (
                      <button
                        key={lesson.id}
                        onClick={() => {
                          setAskNoShowFor(null);
                          setSelectedLesson(lesson);
                        }}
                        className={`w-full text-left px-2 py-1 rounded-lg text-xs ${statusColors[lesson.status]}`}
                      >
                        <p className="font-medium flex items-center gap-1">
                          {formatTime(new Date(lesson.startAt))}
                          {lesson.teacherNotes && <span title="Є нотатка">📝</span>}
                          {lesson.homework && <span title="Є ДЗ">📚</span>}
                        </p>
                        <p className="truncate" title={`${lesson.student.firstName} ${lesson.student.lastName ?? ""}`}>
                          {lesson.student.firstName} {lesson.student.lastName ?? ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowForm(false);
          }}
        >
          <div className="bg-gray-50 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Новий урок</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                Закрити
              </button>
            </div>
            {students.length === 0 ? (
              <p className="text-gray-500">
                Спочатку додай учня на сторінці{" "}
                <Link href="/students/new" className="text-pink-600 underline">
                  Учні
                </Link>
                .
              </p>
            ) : (
              <LessonForm
                students={students}
                defaultDate={currentDate.toISOString().slice(0, 10)}
                onSuccess={() => {
                  setShowForm(false);
                  loadLessons();
                }}
              />
            )}
          </div>
        </div>
      )}

      {selectedLesson && !showMaterials && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeLesson();
          }}
        >
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-xl">
            {/* Шапка: ім'я (посилання на картку), дата, статус */}
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <Link
                  href={`/students/${selectedLesson.studentId}`}
                  className="text-lg font-semibold text-gray-800 hover:text-pink-700 truncate block"
                  title="Відкрити картку учня"
                >
                  {selectedLesson.student.firstName} {selectedLesson.student.lastName ?? ""} ›
                </Link>
                <p className="text-gray-500 text-sm">
                  {new Date(selectedLesson.startAt).toLocaleDateString("uk-UA", {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                  })}{" "}
                  · {formatTime(new Date(selectedLesson.startAt))} · {selectedLesson.duration} хв
                </p>
                <span
                  className={`inline-block mt-1.5 text-xs font-medium px-2 py-0.5 rounded-md ${
                    statusColors[selectedLesson.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {selectedLesson.status === "NO_SHOW"
                    ? byGender(selectedLesson.student.gender, "Учень не прийшов", "Учениця не прийшла")
                    : LESSON_STATUS_LABELS[selectedLesson.status]}
                </span>
              </div>
              <button
                type="button"
                onClick={closeLesson}
                aria-label="Закрити"
                title="Закрити"
                className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {isPrepaidStudent && (
              <p className="text-xs text-gray-500">Оплата: з передоплати за місяць</p>
            )}

            {(selectedLesson.teacherNotes || selectedLesson.homework) && (
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm space-y-1">
                {selectedLesson.teacherNotes && (
                  <p className="text-gray-700 whitespace-pre-wrap">
                    <span className="text-gray-400">Нотатка:</span> {selectedLesson.teacherNotes}
                  </p>
                )}
                {selectedLesson.homework && (
                  <p className="text-gray-700 whitespace-pre-wrap">
                    <span className="text-gray-400">ДЗ:</span> {selectedLesson.homework}
                  </p>
                )}
              </div>
            )}

            {/* Як пройшов урок */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Як пройшов урок?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => toggleStatus(selectedLesson, "COMPLETED")}
                  className={`px-3 py-3 rounded-xl text-sm font-medium border-2 ${
                    selectedLesson.status === "COMPLETED"
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-white text-green-700 border-green-200 hover:bg-green-50"
                  }`}
                >
                  ✓ Проведено
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedLesson.status === "NO_SHOW") {
                      toggleStatus(selectedLesson, "NO_SHOW");
                    } else {
                      setAskNoShowFor(selectedLesson.id);
                    }
                  }}
                  className={`px-3 py-3 rounded-xl text-sm font-medium border-2 ${
                    selectedLesson.status === "NO_SHOW"
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-white text-red-700 border-red-200 hover:bg-red-50"
                  }`}
                >
                  {byGender(selectedLesson.student.gender, "Не прийшов", "Не прийшла")}
                </button>
              </div>

              {askNoShowFor === selectedLesson.id && (
                <div className="bg-red-50 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700">
                    {byGender(selectedLesson.student.gender, "Учень не прийшов", "Учениця не прийшла")}. Цей урок
                    оплачується?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => markNoShow(selectedLesson, true)}
                      className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                    >
                      Так, оплачується
                    </button>
                    <button
                      type="button"
                      onClick={() => markNoShow(selectedLesson, false)}
                      className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                    >
                      Ні, не оплачується
                    </button>
                    <button
                      type="button"
                      onClick={() => setAskNoShowFor(null)}
                      className="px-4 py-2.5 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100"
                    >
                      Назад
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Головні дії */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openMaterials(selectedLesson)}
                className="w-full px-4 py-3 bg-pink-600 text-white rounded-xl text-sm font-medium hover:bg-pink-700"
              >
                Підготувати урок
              </button>
              <SendLinkButton key={selectedLesson.id} lessonId={selectedLesson.id} />
            </div>

            {selectedLesson.meetingLink && (
              <a
                href={selectedLesson.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-pink-600 underline text-sm block"
              >
                Посилання на урок
              </a>
            )}

            {reschedulingLesson && reschedulingLesson.id === selectedLesson.id && (
              <div className="bg-yellow-50 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-gray-700">Новий час уроку</p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="time"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={confirmReschedule}
                    className="flex-1 px-4 py-2.5 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700"
                  >
                    Перенести
                  </button>
                  <button
                    type="button"
                    onClick={() => setReschedulingLesson(null)}
                    className="px-4 py-2.5 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100"
                  >
                    Скасувати
                  </button>
                </div>
              </div>
            )}

            {selectedLesson.paymentStatus === "PAID" && !isPrepaidStudent && (
              <button
                type="button"
                onClick={() => clearPaidFlag(selectedLesson)}
                className="text-xs text-gray-500 underline"
              >
                Зняти стару позначку «оплачено»
              </button>
            )}

            {/* Рідкісні дії */}
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-gray-100 pt-3 text-sm">
              <button
                type="button"
                onClick={() => startReschedule(selectedLesson)}
                className="px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100"
              >
                Перенести
              </button>
              <button
                type="button"
                onClick={() => cancelLesson(selectedLesson)}
                className="px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100"
              >
                Скасувати урок
              </button>
              <button
                type="button"
                onClick={() => deleteLessonPermanently(selectedLesson)}
                className="ml-auto px-3 py-2 rounded-lg text-red-600 hover:bg-red-50"
              >
                Видалити
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedLesson && showMaterials && (
        <LessonPrepModal
          key={selectedLesson.id}
          lesson={selectedLesson}
          onClose={closePrep}
          onSaved={(fields) => {
            setSelectedLesson((prev) => (prev ? { ...prev, ...fields } : prev));
            setLessons((prev) => prev.map((l) => (l.id === selectedLesson.id ? { ...l, ...fields } : l)));
          }}
        />
      )}
    </div>
  );
}