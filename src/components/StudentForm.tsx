"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ChangePriceButton from "@/components/ChangePriceButton";

type StudentFormValues = {
  id?: string;
  firstName: string;
  lastName: string;
  phone: string;
  telegramUsername: string;
  contactChannel: string;
  viberPhone: string;
  birthYear: string;
  birthDay: string;
  birthMonth: string;
  isAdult: boolean;
  gender: string; // "M" | "F" | ""
  englishLevel: string;
  lessonFormat: string;
  defaultLessonDuration: number;
  defaultLessonPrice: number;
  paymentFrequency: string;
  notes: string;
  isActive: boolean;
};

const ENGLISH_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

const MONTHS_UA = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
];

const PAYMENT_FREQUENCY_LABELS: Record<string, string> = {
  PER_LESSON: "Поурочна",
  WEEKLY: "Щотижнева",
  MONTHLY: "Щомісячна",
  END_OF_WEEK: "В кінці тижня",
  END_OF_MONTH: "В кінці місяця",
  MONTHLY_PREPAID: "Помісячна (оплата наперед)",
};

export default function StudentForm({
  initialValues,
  telegramConnected,
}: {
  initialValues?: Partial<StudentFormValues>;
  telegramConnected?: boolean; // чи учень уже натиснув «Start» у боті (лише для картки учня)
}) {
  const router = useRouter();
  const isEditing = Boolean(initialValues?.id);

  const [values, setValues] = useState<StudentFormValues>({
    firstName: initialValues?.firstName ?? "",
    lastName: initialValues?.lastName ?? "",
    phone: initialValues?.phone ?? "",
    telegramUsername: initialValues?.telegramUsername ?? "",
    contactChannel: initialValues?.contactChannel ?? "TELEGRAM",
    viberPhone: initialValues?.viberPhone ?? "",
    birthYear: initialValues?.birthYear ?? "",
    birthDay: initialValues?.birthDay ?? "",
    birthMonth: initialValues?.birthMonth ?? "",
    isAdult: initialValues?.isAdult ?? false,
    gender: initialValues?.gender ?? "",
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
  const [savedMsg, setSavedMsg] = useState("");
  // Знімок збережених даних — щоб показувати «є незбережені зміни»
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(values));
  const isDirty = isEditing && JSON.stringify(values) !== savedSnapshot;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSavedMsg("");
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

    if (isEditing) {
      // Залишаємось на картці учня
      setSavedSnapshot(JSON.stringify(values));
      setSavedMsg("✓ Збережено");
      setTimeout(() => setSavedMsg(""), 3000);
      router.refresh();
      return;
    }

    router.push("/students");
    router.refresh();
  }

  const inputCls =
    "w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300";
  const labelCls = "block text-sm text-gray-600 mb-1";

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 space-y-6">
      {/* Основне */}
      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="text-sm text-gray-600">Ім&apos;я *</label>
              {/* Стать — для правильних відмінків у CRM, Telegram і порадах ШІ */}
              <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Стать">
                {[
                  { v: "M", title: "Хлопець", cls: "bg-sky-500", ring: "ring-sky-300" },
                  { v: "F", title: "Дівчина", cls: "bg-pink-500", ring: "ring-pink-300" },
                ].map((g) => (
                  <button
                    key={g.v}
                    type="button"
                    role="radio"
                    aria-checked={values.gender === g.v}
                    title={g.title}
                    aria-label={g.title}
                    onClick={() => setValues({ ...values, gender: values.gender === g.v ? "" : g.v })}
                    className={`w-6 h-6 rounded-full ${g.cls} ${
                      values.gender === g.v ? `ring-2 ring-offset-2 ${g.ring}` : "opacity-25 hover:opacity-60"
                    }`}
                  />
                ))}
              </div>
            </div>
            <input
              required
              value={values.firstName}
              onChange={(e) => setValues({ ...values, firstName: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Прізвище</label>
            <input
              value={values.lastName}
              onChange={(e) => setValues({ ...values, lastName: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>
      </section>

      {/* Контакти */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Контакти</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Телефон</label>
            <input
              type="tel"
              inputMode="tel"
              value={values.phone}
              onChange={(e) => setValues({ ...values, phone: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Telegram</label>
            <input
              value={values.telegramUsername}
              onChange={(e) => setValues({ ...values, telegramUsername: e.target.value })}
              placeholder="@username"
              autoCapitalize="none"
              className={inputCls}
            />
            {isEditing &&
              (telegramConnected ? (
                <p className="mt-1 text-xs text-green-700">✓ Підключено до бота</p>
              ) : values.telegramUsername.trim() ? (
                <p className="mt-1 text-xs text-red-600">
                  Ще не підключено до бота — попросіть {values.gender === "F" ? "ученицю" : "учня"} знайти бота в Telegram і натиснути «Start»
                </p>
              ) : (
                <p className="mt-1 text-xs text-gray-400">
                  Вкажіть username, щоб {values.gender === "F" ? "учениця могла" : "учень міг"} підключитися до бота
                </p>
              ))}
          </div>
          <div>
            <label className={labelCls}>Куди надсилати посилання на урок</label>
            <select
              value={values.contactChannel}
              onChange={(e) => setValues({ ...values, contactChannel: e.target.value })}
              className={inputCls}
            >
              <option value="TELEGRAM">Telegram</option>
              <option value="VIBER">Viber</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Номер Viber</label>
            <input
              type="tel"
              inputMode="tel"
              value={values.viberPhone}
              onChange={(e) => setValues({ ...values, viberPhone: e.target.value })}
              placeholder="Якщо порожньо — з поля «Телефон»"
              className={inputCls}
            />
          </div>
        </div>
      </section>

      {/* Про учня */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Про учня</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>День народження</label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={values.birthDay}
                onChange={(e) => setValues({ ...values, birthDay: e.target.value })}
                placeholder="День"
                className="w-16 px-2 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300"
              />
              <select
                value={values.birthMonth}
                onChange={(e) => setValues({ ...values, birthMonth: e.target.value })}
                className="flex-1 min-w-0 px-2 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300"
              >
                <option value="">Місяць</option>
                {MONTHS_UA.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="numeric"
                value={values.birthYear}
                onChange={(e) => setValues({ ...values, birthYear: e.target.value })}
                placeholder="Рік"
                className="w-20 px-2 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300"
              />
            </div>
            <div className="flex items-center justify-between gap-2 mt-1.5">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={values.isAdult}
                  onChange={(e) => setValues({ ...values, isAdult: e.target.checked })}
                />
                <span className="text-xs text-gray-500">Дорослий (якщо рік не вказуєте)</span>
              </label>
              {values.birthYear && Number(values.birthYear) > 1920 && (
                <span className="text-xs text-gray-400">≈ {new Date().getFullYear() - Number(values.birthYear)} р.</span>
              )}
            </div>
          </div>
          <div>
            <label className={labelCls}>Рівень англійської</label>
            <div className="grid grid-cols-6 gap-1">
              {ENGLISH_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setValues({ ...values, englishLevel: level })}
                  className={`py-2.5 rounded-lg text-sm font-medium ${
                    values.englishLevel === level
                      ? "bg-pink-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className={labelCls}>Нотатки</label>
          <textarea
            value={values.notes}
            onChange={(e) => setValues({ ...values, notes: e.target.value })}
            rows={3}
            placeholder="Постійні факти про учня: вік, мета, з чим займаєтесь, особливості. ШІ читає це перед кожною відповіддю."
            className={inputCls}
          />
        </div>
      </section>

      {/* Уроки й оплата */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Уроки й оплата</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Тривалість (хв)</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={values.defaultLessonDuration}
              onChange={(e) => setValues({ ...values, defaultLessonDuration: Number(e.target.value) })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Ціна уроку (грн)</label>
            {isEditing ? (
              <div className="flex items-center gap-1.5">
                <input
                  readOnly
                  value={values.defaultLessonPrice}
                  className="w-full min-w-0 px-3 py-2.5 border border-gray-100 bg-gray-50 rounded-xl text-gray-700"
                />
                <ChangePriceButton
                  studentId={initialValues!.id!}
                  currentPrice={values.defaultLessonPrice}
                  onDone={(newPrice) => {
                    setValues((prev) => ({ ...prev, defaultLessonPrice: newPrice }));
                    // ціна вже збережена окремо — оновлюємо знімок, щоб не було «незбережених змін»
                    setSavedSnapshot((snap) => {
                      try {
                        return JSON.stringify({ ...JSON.parse(snap), defaultLessonPrice: newPrice });
                      } catch {
                        return snap;
                      }
                    });
                    router.refresh();
                  }}
                />
              </div>
            ) : (
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={values.defaultLessonPrice}
                onChange={(e) => setValues({ ...values, defaultLessonPrice: Number(e.target.value) })}
                className={inputCls}
              />
            )}
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Тип оплати</label>
            <select
              value={values.paymentFrequency}
              onChange={(e) => setValues({ ...values, paymentFrequency: e.target.value })}
              className={inputCls}
            >
              {Object.entries(PAYMENT_FREQUENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {/* Кнопка збереження; на телефоні «прилипає» до низу екрана, коли є зміни */}
      <div
        className={`flex items-center gap-3 ${
          isDirty ? "sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:bottom-3 z-10 bg-white/95 backdrop-blur rounded-2xl shadow-lg p-2 -mx-2" : ""
        }`}
      >
        <button
          type="submit"
          disabled={loading || (isEditing && !isDirty)}
          className="flex-1 sm:flex-none px-6 py-3 bg-pink-600 text-white font-medium rounded-xl hover:bg-pink-700 disabled:opacity-40"
        >
          {loading ? "Збереження..." : isEditing ? "Зберегти" : "Додати учня"}
        </button>
        {isDirty && !loading && <span className="text-xs text-amber-600">Є незбережені зміни</span>}
        {savedMsg && <span className="text-sm text-green-600">{savedMsg}</span>}
      </div>
    </form>
  );
}
