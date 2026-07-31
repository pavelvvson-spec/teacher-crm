"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Student = {
  id: string;
  firstName: string;
  lastName: string | null;
  defaultLessonDuration: number;
  defaultLessonPrice: number;
  lessonFormat: string;
};

const DAYS_OF_WEEK = [
  { value: 1, label: "Понеділок" },
  { value: 2, label: "Вівторок" },
  { value: 3, label: "Середа" },
  { value: 4, label: "Четвер" },
  { value: 5, label: "П'ятниця" },
  { value: 6, label: "Субота" },
  { value: 0, label: "Неділя" },
];

export default function LessonForm({
  students,
  defaultDate,
  onSuccess,
}: {
  students: Student[];
  defaultDate?: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"single" | "recurring">("single");
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("17:00");
  const [duration, setDuration] = useState(students[0]?.defaultLessonDuration ?? 60);
  const [price, setPrice] = useState(students[0]?.defaultLessonPrice ?? 0);
  const [format, setFormat] = useState(students[0]?.lessonFormat ?? "ONLINE");
  const [meetingLink, setMeetingLink] = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleStudentChange(id: string) {
    setStudentId(id);
    const student = students.find((s) => s.id === id);
    if (student) {
      setDuration(student.defaultLessonDuration);
      setPrice(student.defaultLessonPrice);
      setFormat(student.lessonFormat);
    }
  }

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!studentId) {
      setError("Оберіть учня");
      return;
    }

    setLoading(true);

    try {
      if (mode === "single") {
        const startAt = new Date(`${date}T${time}:00`);
        const res = await fetch("/api/lessons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId,
            startAt: startAt.toISOString(),
            duration,
            price,
            format,
            meetingLink,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Помилка створення уроку");
        }
      } else {
        if (selectedDays.length === 0) {
          setError("Оберіть хоча б один день тижня");
          setLoading(false);
          return;
        }
        for (const dayOfWeek of selectedDays) {
          const res = await fetch("/api/recurring-schedules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              studentId,
              dayOfWeek,
              startTime: time,
              duration,
              price,
              format,
              activeFrom: new Date(date).toISOString(),
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Помилка створення розкладу");
          }
        }
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/calendar");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`px-4 py-2 rounded-xl font-medium ${
            mode === "single" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          Одноразовий урок
        </button>
        <button
          type="button"
          onClick={() => setMode("recurring")}
          className={`px-4 py-2 rounded-xl font-medium ${
            mode === "recurring" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          Регулярні заняття
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Учень</label>
        <select
          value={studentId}
          onChange={(e) => handleStudentChange(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName} {s.lastName ?? ""}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {mode === "single" ? "Дата уроку" : "Почати з"}
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Час</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      {mode === "recurring" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Дні тижня</label>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  selectedDays.includes(d.value)
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Тривалість (хв)</label>
          <input
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Вартість (грн)</label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Формат</label>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="ONLINE">Онлайн</option>
          <option value="OFFLINE">Офлайн</option>
        </select>
      </div>

      {format === "ONLINE" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Посилання (Google Meet / Zoom)
          </label>
          <input
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            placeholder="https://..."
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Збереження..." : "Створити"}
      </button>
    </form>
  );
}