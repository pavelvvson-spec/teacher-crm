"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StudentFormValues = {
  id?: string;
  firstName: string;
  lastName: string;
  phone: string;
  telegramUsername: string;
  englishLevel: string;
  lessonFormat: string;
  defaultLessonDuration: number;
  defaultLessonPrice: number;
  paymentFrequency: string;
  notes: string;
  isActive: boolean;
};

const ENGLISH_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

const PAYMENT_FREQUENCY_LABELS: Record<string, string> = {
  PER_LESSON: "Поурочна",
  WEEKLY: "Щотижнева",
  MONTHLY: "Щомісячна",
  END_OF_WEEK: "В кінці тижня",
  END_OF_MONTH: "В кінці місяця",
};

export default function StudentForm({ initialValues }: { initialValues?: Partial<StudentFormValues> }) {
  const router = useRouter();
  const isEditing = Boolean(initialValues?.id);

  const [values, setValues] = useState<StudentFormValues>({
    firstName: initialValues?.firstName ?? "",
    lastName: initialValues?.lastName ?? "",
    phone: initialValues?.phone ?? "",
    telegramUsername: initialValues?.telegramUsername ?? "",
    englishLevel: initialValues?.englishLevel ?? "A1",
    lessonFormat: initialValues?.lessonFormat ?? "ONLINE",
    defaultLessonDuration: initialValues?.defaultLessonDuration ?? 60,
    defaultLessonPrice: initialValues?.defaultLessonPrice ?? 300,
    paymentFrequency: initialValues?.paymentFrequency ?? "PER_LESSON",
    notes: initialValues?.notes ?? "",
    isActive: initialValues?.isActive ?? true,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const url = isEditing ? `/api/students/${initialValues!.id}` : "/api/students";
    const method = isEditing ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Помилка збереження");
      return;
    }

    router.push("/students");
    router.refresh();
  }

  async function handleDeactivate() {
    if (!initialValues?.id) return;
    if (!confirm("Деактивувати цього учня?")) return;

    await fetch(`/api/students/${initialValues.id}`, { method: "DELETE" });
    router.push("/students");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6 space-y-5 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ім&apos;я *</label>
          <input
            required
            value={values.firstName}
            onChange={(e) => setValues({ ...values, firstName: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Прізвище</label>
          <input
            value={values.lastName}
            onChange={(e) => setValues({ ...values, lastName: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
          <input
            value={values.phone}
            onChange={(e) => setValues({ ...values, phone: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Telegram username</label>
          <input
            value={values.telegramUsername}
            onChange={(e) => setValues({ ...values, telegramUsername: e.target.value })}
            placeholder="@username"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Рівень англійської</label>
          <select
            value={values.englishLevel}
            onChange={(e) => setValues({ ...values, englishLevel: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {ENGLISH_LEVELS.map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Формат занять</label>
          <select
            value={values.lessonFormat}
            onChange={(e) => setValues({ ...values, lessonFormat: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="ONLINE">Онлайн</option>
            <option value="OFFLINE">Офлайн</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Тривалість уроку (хв)</label>
          <input
            type="number"
            min={1}
            value={values.defaultLessonDuration}
            onChange={(e) => setValues({ ...values, defaultLessonDuration: Number(e.target.value) })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Вартість уроку (грн)</label>
          <input
            type="number"
            min={0}
            value={values.defaultLessonPrice}
            onChange={(e) => setValues({ ...values, defaultLessonPrice: Number(e.target.value) })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Тип оплати</label>
          <select
            value={values.paymentFrequency}
            onChange={(e) => setValues({ ...values, paymentFrequency: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {Object.entries(PAYMENT_FREQUENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Нотатки</label>
        <textarea
          value={values.notes}
          onChange={(e) => setValues({ ...values, notes: e.target.value })}
          rows={3}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {isEditing && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(e) => setValues({ ...values, isActive: e.target.checked })}
          />
          <span className="text-sm text-gray-700">Активний учень</span>
        </label>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Збереження..." : "Зберегти"}
        </button>
        {isEditing && (
          <button
            type="button"
            onClick={handleDeactivate}
            className="px-6 py-3 bg-red-50 text-red-600 font-medium rounded-xl hover:bg-red-100"
          >
            Деактивувати
          </button>
        )}
      </div>
    </form>
  );
}