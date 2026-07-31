"use client";

import { useEffect, useState, useCallback } from "react";

type Schedule = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  duration: number;
  price: number;
  format: string;
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

export default function StudentScheduleManager({
  studentId,
  defaultDuration,
  defaultPrice,
  defaultFormat,
}: {
  studentId: string;
  defaultDuration: number;
  defaultPrice: number;
  defaultFormat: string;
}) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDay, setNewDay] = useState(1);
  const [newTime, setNewTime] = useState("17:00");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/students/${studentId}/schedules`);
    const data = await res.json();
    setSchedules(data);
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  async function handleAdd() {
    setError("");
    setSaving(true);

    const res = await fetch("/api/recurring-schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        dayOfWeek: newDay,
        startTime: newTime,
        duration: defaultDuration,
        price: defaultPrice,
        format: defaultFormat,
        activeFrom: new Date().toISOString(),
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Помилка створення розкладу");
      return;
    }

    setShowAddForm(false);
    loadSchedules();
  }

  async function handleDelete(scheduleId: string) {
    if (!confirm("Видалити цей розклад? Уже створені уроки залишаться, нові генеруватись не будуть.")) {
      return;
    }
    await fetch(`/api/recurring-schedules/${scheduleId}`, { method: "DELETE" });
    loadSchedules();
  }

  function dayLabel(dayOfWeek: number) {
    return DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.label ?? "";
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Сталий графік</h2>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="px-4 py-2 bg-pink-50 text-pink-700 rounded-xl text-sm font-medium hover:bg-pink-100"
        >
          {showAddForm ? "Скасувати" : "+ Додати день"}
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Завантаження...</p>
      ) : schedules.length === 0 ? (
        <p className="text-gray-500 text-sm">Сталого графіку ще немає. Уроки можна створювати вручну в календарі.</p>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl"
            >
              <p className="font-medium text-gray-800">
                {dayLabel(s.dayOfWeek)} {s.startTime}
              </p>
              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                className="text-red-600 text-sm font-medium hover:underline"
              >
                Видалити
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddForm && (
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">День тижня</label>
              <select
                value={newDay}
                onChange={(e) => setNewDay(Number(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Час</label>
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="button"
            onClick={handleAdd}
            disabled={saving}
            className="px-5 py-3 bg-pink-600 text-white rounded-xl font-medium hover:bg-pink-700 disabled:opacity-50"
          >
            {saving ? "Збереження..." : "Зберегти день"}
          </button>
        </div>
      )}
    </div>
  );
}