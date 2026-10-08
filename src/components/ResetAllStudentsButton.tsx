"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResetAllStudentsButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function openModal() {
    setA(Math.floor(Math.random() * 9) + 1);
    setB(Math.floor(Math.random() * 9) + 1);
    setAnswer("");
    setError("");
    setOpen(true);
  }

  async function handleConfirm() {
    if (Number(answer) !== a + b) {
      setError("Невірна відповідь. Спробуй ще раз.");
      return;
    }
    setLoading(true);
    await fetch("/api/students/reset-all", { method: "DELETE" });
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={openModal}
        className="w-full text-left px-3 py-2 text-red-600 rounded-lg text-sm hover:bg-red-50"
      >
        Видалити всіх учнів
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Підтвердження</h2>
            <p className="text-sm text-gray-600">
              Усі учні та всі пов&apos;язані з ними уроки, оплати й матеріали будуть видалені назавжди.
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
          </div>
        </div>
      )}
    </>
  );
}