"use client";

import { useState } from "react";

const MONTHS = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

export default function CalendarResetMenu({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"choose" | "month" | "confirm">("choose");
  const [scope, setScope] = useState<"current" | "all" | "month">("current");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function openMenu() {
    setStep("choose");
    setOpen(true);
  }

  function chooseScope(s: "current" | "all" | "month") {
    setScope(s);
    if (s === "month") {
      setStep("month");
    } else {
      goToConfirm();
    }
  }

  function goToConfirm() {
    setA(Math.floor(Math.random() * 9) + 1);
    setB(Math.floor(Math.random() * 9) + 1);
    setAnswer("");
    setError("");
    setStep("confirm");
  }

  async function handleConfirm() {
    if (Number(answer) !== a + b) {
      setError("Невірна відповідь. Спробуй ще раз.");
      return;
    }
    setLoading(true);
    await fetch(`/api/lessons/reset`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, year, month }),
    });
    setLoading(false);
    setOpen(false);
    onDone();
  }

  return (
    <>
      <button
        onClick={openMenu}
        className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100"
      >
        Скинути дані календаря
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4">
            {step === "choose" && (
              <>
                <h2 className="text-lg font-semibold text-gray-800">Що очистити?</h2>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => chooseScope("current")}
                    className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 text-left"
                  >
                    Поточний місяць
                  </button>
                  <button
                    onClick={() => chooseScope("month")}
                    className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 text-left"
                  >
                    Обрати місяць
                  </button>
                  <button
                    onClick={() => chooseScope("all")}
                    className="px-4 py-3 bg-red-50 text-red-700 rounded-xl text-sm font-medium hover:bg-red-100 text-left"
                  >
                    Весь календар
                  </button>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 w-full"
                >
                  Скасувати
                </button>
              </>
            )}

            {step === "month" && (
              <>
                <h2 className="text-lg font-semibold text-gray-800">Обери місяць</h2>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    {MONTHS.map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={goToConfirm}
                    className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700"
                  >
                    Далі
                  </button>
                  <button
                    onClick={() => setStep("choose")}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                  >
                    Назад
                  </button>
                </div>
              </>
            )}

            {step === "confirm" && (
              <>
                <h2 className="text-lg font-semibold text-gray-800">Підтвердження</h2>
                <p className="text-sm text-gray-600">
                  {scope === "current" && "Всі уроки поточного місяця будуть видалені."}
                  {scope === "month" && `Всі уроки за ${MONTHS[month - 1]} ${year} будуть видалені.`}
                  {scope === "all" && "Весь календар буде повністю очищено."}
                </p>
                <p className="text-sm font-medium text-gray-700">
                  Щоб підтвердити, розв&apos;яжи приклад: {a} + {b} = ?
                </p>
                <input
                  type="number"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
                  autoFocus
                />
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirm}
                    disabled={loading}
                    className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    {loading ? "Виконання..." : "Підтвердити видалення"}
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
                  >
                    Скасувати
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}