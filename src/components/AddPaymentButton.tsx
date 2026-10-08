"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type UnpaidLesson = {
  id: string;
  date: string; // наприклад "05.10"
  time: string; // наприклад "17:00"
  amount: number; // скільки ще не оплачено за цей урок
};

function todayStr(): string {
  return new Date().toLocaleDateString("sv-SE"); // РРРР-ММ-ДД за місцевим часом
}

function lessonsWord(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "уроків";
  if (last === 1) return "урок";
  if (last >= 2 && last <= 4) return "уроки";
  return "уроків";
}

export default function AddPaymentButton({
  studentId,
  studentName,
  lessons,
  lessonPrice,
  primary = false,
}: {
  studentId: string;
  studentName: string;
  lessons: UnpaidLesson[];
  lessonPrice: number;
  primary?: boolean; // яскрава головна кнопка (для списку на сторінці оплат)
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [ahead, setAhead] = useState(0);
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [comment, setComment] = useState("");
  const [commentTouched, setCommentTouched] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const showLessonTools = lessons.length > 0 || lessonPrice > 0;

  function autoAmount(nextChecked: string[], nextAhead: number): number {
    const sum = lessons
      .filter((l) => nextChecked.includes(l.id))
      .reduce((s, l) => s + l.amount, 0);
    return sum + nextAhead * lessonPrice;
  }

  function autoComment(nextChecked: string[], nextAhead: number): string {
    const parts: string[] = [];
    const chosen = lessons.filter((l) => nextChecked.includes(l.id));
    if (chosen.length > 0) {
      parts.push(`за ${chosen.length === 1 ? "урок" : "уроки"} ${chosen.map((l) => l.date).join(", ")}`);
    }
    if (nextAhead > 0) {
      parts.push(`${nextAhead} ${lessonsWord(nextAhead)} наперед`);
    }
    return parts.join(" + ");
  }

  function applyAuto(nextChecked: string[], nextAhead: number, amtTouched: boolean, cmtTouched: boolean) {
    if (!amtTouched) {
      const a = autoAmount(nextChecked, nextAhead);
      setAmount(a > 0 ? String(a) : "");
    }
    if (!cmtTouched) {
      setComment(autoComment(nextChecked, nextAhead));
    }
  }

  function openModal() {
    const allIds = lessons.map((l) => l.id);
    setChecked(allIds);
    setAhead(0);
    setAmountTouched(false);
    setCommentTouched(false);
    setDate(todayStr());
    setError("");
    setLoading(false);
    const a = autoAmount(allIds, 0);
    setAmount(a > 0 ? String(a) : "");
    setComment(autoComment(allIds, 0));
    setOpen(true);
  }

  function toggleLesson(id: string) {
    const next = checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id];
    setChecked(next);
    applyAuto(next, ahead, amountTouched, commentTouched);
  }

  function changeAhead(delta: number) {
    const next = Math.max(0, Math.min(20, ahead + delta));
    setAhead(next);
    applyAuto(checked, next, amountTouched, commentTouched);
  }

  function recalcAmount() {
    setAmountTouched(false);
    const a = autoAmount(checked, ahead);
    setAmount(a > 0 ? String(a) : "");
  }

  async function handleConfirm() {
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("Введи суму більше нуля");
      return;
    }
    if (!date) {
      setError("Вкажи дату оплати");
      return;
    }

    const paidAt =
      date === todayStr() ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString();

    setLoading(true);
    setError("");
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        amount: value,
        paidAt,
        comment: comment.trim() || null,
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Помилка збереження");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={openModal}
        className={
          primary
            ? "px-3 py-2 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700 whitespace-nowrap"
            : "px-3 py-1.5 bg-pink-50 text-pink-700 rounded-lg text-xs font-medium hover:bg-pink-100"
        }
      >
        Внести оплату
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-start">
              <h2 className="text-lg font-semibold text-gray-800">Оплата: {studentName}</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                Закрити
              </button>
            </div>

            {showLessonTools && (
              <div className="space-y-3">
                {lessons.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Проведені неоплачені уроки</p>
                    <div className="space-y-1">
                      {lessons.map((l) => (
                        <label
                          key={l.id}
                          className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2 cursor-pointer"
                        >
                          <span className="flex items-center gap-2 text-sm text-gray-800">
                            <input
                              type="checkbox"
                              checked={checked.includes(l.id)}
                              onChange={() => toggleLesson(l.id)}
                              className="w-4 h-4"
                            />
                            {l.date} · {l.time}
                          </span>
                          <span className="text-sm font-medium text-gray-700">{l.amount} грн</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Неоплачених проведених уроків немає.</p>
                )}

                {lessonPrice > 0 && (
                  <div className="flex items-center justify-between bg-purple-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-purple-800">
                      Ще уроків наперед ({lessonPrice} грн за урок)
                    </span>
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => changeAhead(-1)}
                        className="w-7 h-7 rounded-lg bg-white text-purple-700 font-semibold border border-purple-200"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm font-semibold text-purple-800">{ahead}</span>
                      <button
                        type="button"
                        onClick={() => changeAhead(1)}
                        className="w-7 h-7 rounded-lg bg-white text-purple-700 font-semibold border border-purple-200"
                      >
                        +
                      </button>
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Сума, грн</label>
                {amountTouched && showLessonTools && (
                  <button
                    type="button"
                    onClick={recalcAmount}
                    className="text-xs text-pink-600 underline"
                  >
                    порахувати заново
                  </button>
                )}
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setAmountTouched(true);
                }}
                placeholder="Сума, грн"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Дата оплати</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Коментар (за що оплата)</label>
              <textarea
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                  setCommentTouched(true);
                }}
                rows={2}
                placeholder="Наприклад: 1500 за вересень, решта за жовтень"
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="px-4 py-2 bg-pink-600 text-white rounded-xl text-sm font-medium hover:bg-pink-700 disabled:opacity-50"
              >
                {loading ? "Збереження..." : "Підтвердити"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}