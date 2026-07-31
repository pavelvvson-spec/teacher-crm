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
  PAYMENT_STATUS_LABELS,
} from "@/lib/calendar-utils";
import LessonForm from "@/components/LessonForm";

type Student = {
  id: string;
  firstName: string;
  lastName: string | null;
  defaultLessonDuration: number;
  defaultLessonPrice: number;
  lessonFormat: string;
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
  student: { firstName: string; lastName: string | null };
};

type Material = {
  id: string;
  type: string;
  title: string;
  url: string;
  createdAt: string;
};

type ViewMode = "day" | "week" | "month";

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

  const [showMaterials, setShowMaterials] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);

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

  async function markCompleted(lesson: Lesson) {
    await fetch(`/api/lessons/${lesson.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    setSelectedLesson(null);
    loadLessons();
  }

  async function markStatus(lesson: Lesson, status: string) {
    await fetch(`/api/lessons/${lesson.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setSelectedLesson(null);
    loadLessons();
  }

  async function markPaid(lesson: Lesson) {
    await fetch(`/api/lessons/${lesson.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentStatus: "PAID" }),
    });
    setSelectedLesson(null);
    loadLessons();
  }

  async function cancelLesson(lesson: Lesson) {
    if (!confirm("Скасувати цей урок?")) return;
    await fetch(`/api/lessons/${lesson.id}`, { method: "DELETE" });
    setSelectedLesson(null);
    loadLessons();
  }

  async function sendReminder(lesson: Lesson) {
    const res = await fetch(`/api/lessons/${lesson.id}/send-reminder`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Не вдалося надіслати нагадування");
    } else {
      alert("Нагадування надіслано!");
    }
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

  async function loadMaterials(lessonId: string) {
    setMaterialsLoading(true);
    const res = await fetch(`/api/lessons/${lessonId}/materials`);
    const data = await res.json();
    setMaterials(data);
    setMaterialsLoading(false);
  }

  function openMaterials(lesson: Lesson) {
    setSelectedLesson(lesson);
    setShowMaterials(true);
    setNewLinkTitle("");
    setNewLinkUrl("");
    loadMaterials(lesson.id);
  }

  async function addLinkMaterial() {
    if (!selectedLesson || !newLinkTitle || !newLinkUrl) return;
    await fetch(`/api/lessons/${selectedLesson.id}/materials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newLinkTitle, url: newLinkUrl }),
    });
    setNewLinkTitle("");
    setNewLinkUrl("");
    loadMaterials(selectedLesson.id);
  }

  async function uploadFileMaterial(file: File) {
    if (!selectedLesson) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name);
    await fetch(`/api/lessons/${selectedLesson.id}/materials`, {
      method: "POST",
      body: formData,
    });
    setUploading(false);
    loadMaterials(selectedLesson.id);
  }

  async function deleteMaterial(materialId: string) {
    if (!selectedLesson) return;
    if (!confirm("Видалити цей матеріал?")) return;
    await fetch(`/api/lessons/${selectedLesson.id}/materials`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId }),
    });
    loadMaterials(selectedLesson.id);
  }

  const materialTypeLabels: Record<string, string> = {
    LINK: "Посилання",
    YOUTUBE: "YouTube",
    PDF: "PDF",
    IMAGE: "Скріншот",
  };

  const { from } = getRange();
  const daysToShow =
    viewMode === "day" ? 1 : viewMode === "week" ? 7 : endOfMonth(currentDate).getDate();
  const rangeStart = viewMode === "month" ? startOfMonth(currentDate) : from;

  const days = Array.from({ length: daysToShow }, (_, i) => addDays(rangeStart, i));

  function lessonsForDay(day: Date) {
    const dayStr = day.toDateString();
    return lessons
      .filter((l) => new Date(l.startAt).toDateString() === dayStr)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }

  const statusColors: Record<string, string> = {
    SCHEDULED: "bg-blue-100 text-blue-800",
    COMPLETED: "bg-green-100 text-green-800",
    CANCELLED_BY_STUDENT: "bg-gray-100 text-gray-500",
    CANCELLED_BY_TEACHER: "bg-gray-100 text-gray-500",
    RESCHEDULED: "bg-yellow-100 text-yellow-800",
    NO_SHOW: "bg-red-100 text-red-800",
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["day", "week", "month"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-2 rounded-xl font-medium ${
                viewMode === mode ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {mode === "day" ? "День" : mode === "week" ? "Тиждень" : "Місяць"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToPrevious} className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200">
            ←
          </button>
          <button onClick={goToToday} className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-medium">
            Сьогодні
          </button>
          <button onClick={goToNext} className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200">
            →
          </button>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-5 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700"
        >
          + Створити урок
        </button>
      </div>

      <p className="text-gray-500 font-medium">{formatMonthYear(currentDate)}</p>

      {loading ? (
        <p className="text-gray-400">Завантаження...</p>
      ) : (
        <div
          className={`grid gap-3 ${
            viewMode === "day" ? "grid-cols-1" : viewMode === "week" ? "grid-cols-1 sm:grid-cols-7" : "grid-cols-2 sm:grid-cols-7"
          }`}
        >
          {days.map((day) => {
            const dayLessons = lessonsForDay(day);
            const isToday = day.toDateString() === new Date().toDateString();
            return (
              <div
                key={day.toISOString()}
                className={`bg-white rounded-2xl shadow-sm p-3 min-h-[100px] ${
                  isToday ? "ring-2 ring-blue-400" : ""
                }`}
              >
                <p className="text-sm font-medium text-gray-500 mb-2">{formatDayLabel(day)}</p>
                <div className="space-y-1">
                  {dayLessons.map((lesson) => (
                    <button
                      key={lesson.id}
                      onClick={() => setSelectedLesson(lesson)}
                      className={`w-full text-left px-2 py-1 rounded-lg text-xs ${statusColors[lesson.status]}`}
                    >
                      <p className="font-medium">{formatTime(new Date(lesson.startAt))}</p>
                      <p className="truncate">
                        {lesson.student.firstName} {lesson.student.lastName ?? ""}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
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
                <Link href="/students/new" className="text-blue-600 underline">
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
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">
                  {selectedLesson.student.firstName} {selectedLesson.student.lastName ?? ""}
                </h2>
                <p className="text-gray-500 text-sm">
                  {new Date(selectedLesson.startAt).toLocaleDateString("uk-UA")}{" "}
                  {formatTime(new Date(selectedLesson.startAt))} · {selectedLesson.duration} хв
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedLesson(null);
                  setReschedulingLesson(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                Закрити
              </button>
            </div>

            <p className="text-sm">
              Статус: <span className="font-medium">{LESSON_STATUS_LABELS[selectedLesson.status]}</span>
            </p>
            <p className="text-sm">
              Оплата:{" "}
              <span className="font-medium">{PAYMENT_STATUS_LABELS[selectedLesson.paymentStatus]}</span>
            </p>

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
                    onClick={confirmReschedule}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700"
                  >
                    Підтвердити перенесення
                  </button>
                  <button
                    onClick={() => setReschedulingLesson(null)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                  >
                    Скасувати
                  </button>
                </div>
              </div>
            )}

            {selectedLesson.meetingLink && (
              
                <a href={selectedLesson.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline text-sm block"
              >
                Посилання на урок
              </a>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={() => openMaterials(selectedLesson)}
                className="px-4 py-2 bg-pink-50 text-pink-700 rounded-xl text-sm font-medium hover:bg-pink-100"
              >
                Підготувати урок
              </button>
              <button
                onClick={() => markCompleted(selectedLesson)}
                className="px-4 py-2 bg-green-50 text-green-700 rounded-xl text-sm font-medium hover:bg-green-100"
              >
                Проведено
              </button>
              <button
                onClick={() => markStatus(selectedLesson, "NO_SHOW")}
                className="px-4 py-2 bg-red-50 text-red-700 rounded-xl text-sm font-medium hover:bg-red-100"
              >
                Учень не прийшов
              </button>
              <button
                onClick={() => markPaid(selectedLesson)}
                className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-100"
              >
                Позначити оплаченим
              </button>
              <button
                onClick={() => sendReminder(selectedLesson)}
                className="px-4 py-2 bg-purple-50 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-100"
              >
                Надіслати нагадування
              </button>
              <button
                onClick={() => startReschedule(selectedLesson)}
                className="px-4 py-2 bg-yellow-50 text-yellow-700 rounded-xl text-sm font-medium hover:bg-yellow-100"
              >
                Перенести урок
              </button>
              <button
                onClick={() => cancelLesson(selectedLesson)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
              >
                Скасувати урок
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedLesson && showMaterials && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Підготовка до уроку</h2>
                <p className="text-gray-500 text-sm">
                  {selectedLesson.student.firstName} {selectedLesson.student.lastName ?? ""} ·{" "}
                  {new Date(selectedLesson.startAt).toLocaleDateString("uk-UA")}{" "}
                  {formatTime(new Date(selectedLesson.startAt))}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowMaterials(false);
                  setSelectedLesson(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                Закрити
              </button>
            </div>

            <div className="space-y-2">
              {materialsLoading ? (
                <p className="text-gray-400 text-sm">Завантаження...</p>
              ) : materials.length === 0 ? (
                <p className="text-gray-500 text-sm">Матеріалів ще немає.</p>
              ) : (
                materials.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3"
                  >
                    <div>
                      <p className="text-xs text-pink-600 font-medium">
                        {materialTypeLabels[m.type] || m.type}
                      </p>
                      
                        <a href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline text-sm break-all"
                      >
                        {m.title}
                      </a>
                    </div>
                    <button
                      onClick={() => deleteMaterial(m.id)}
                      className="text-gray-400 hover:text-red-500 text-sm px-2"
                    >
                      Видалити
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Додати посилання (YouTube тощо)</p>
              <input
                type="text"
                placeholder="Назва"
                value={newLinkTitle}
                onChange={(e) => setNewLinkTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="https://..."
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={addLinkMaterial}
                className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700"
              >
                Додати посилання
              </button>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Завантажити PDF або скріншот</p>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadFileMaterial(file);
                }}
                className="text-sm"
              />
              {uploading && <p className="text-gray-400 text-sm">Завантаження файлу...</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}