"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PaymentsMoreMenu from "@/components/PaymentsMoreMenu";

// Меню «⋯» біля імені учня: деактивувати / зробити активним / видалити назавжди
export default function StudentActionsMenu({
  studentId,
  isActive,
  activatePayload,
}: {
  studentId: string;
  isActive: boolean;
  activatePayload: Record<string, unknown>; // повні дані учня (API оновлення приймає лише повну форму)
}) {
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [deleteAnswer, setDeleteAnswer] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDeactivate() {
    if (!confirm("Деактивувати цього учня?")) return;
    await fetch(`/api/students/${studentId}`, { method: "DELETE" });
    router.push("/students");
    router.refresh();
  }

  async function handleActivate() {
    const res = await fetch(`/api/students/${studentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...activatePayload, isActive: true }),
    });
    if (!res.ok) {
      alert("Не вдалося зробити учня активним");
      return;
    }
    // повне перезавантаження, щоб форма підхопила новий стан
    window.location.reload();
  }

  function openDeleteConfirm() {
    setA(Math.floor(Math.random() * 9) + 1);
    setB(Math.floor(Math.random() * 9) + 1);
    setDeleteAnswer("");
    setDeleteError("");
    setShowDeleteConfirm(true);
  }

  async function handleDeletePermanently() {
    if (Number(deleteAnswer) !== a + b) {
      setDeleteError("Невірна відповідь. Спробуй ще раз.");
      return;
    }
    setDeleting(true);
    await fetch(`/api/students/${studentId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hard: true }),
    });
    setDeleting(false);
    setShowDeleteConfirm(false);
    router.push("/students");
    router.refresh();
  }

  return (
    <>
      <PaymentsMoreMenu>
        {isActive ? (
          <button
            type="button"
            onClick={handleDeactivate}
            className="w-full text-left px-3 py-2 text-gray-700 rounded-lg text-sm hover:bg-gray-100"
          >
            Деактивувати
          </button>
        ) : (
          <button
            type="button"
            onClick={handleActivate}
            className="w-full text-left px-3 py-2 text-gray-700 rounded-lg text-sm hover:bg-gray-100"
          >
            Зробити активним
          </button>
        )}
        <button
          type="button"
          onClick={openDeleteConfirm}
          className="w-full text-left px-3 py-2 text-red-600 rounded-lg text-sm hover:bg-red-50"
        >
          Видалити учня
        </button>
      </PaymentsMoreMenu>

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowDeleteConfirm(false);
          }}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Підтвердження</h2>
            <p className="text-sm text-gray-600">
              Учня та всі його уроки, оплати й розклад буде видалено назавжди. Цю дію не можна скасувати.
            </p>
            <p className="text-sm font-medium text-gray-700">
              Щоб підтвердити, розв&apos;яжи приклад: {a} + {b} = ?
            </p>
            <input
              type="number"
              inputMode="numeric"
              value={deleteAnswer}
              onChange={(e) => setDeleteAnswer(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
              autoFocus
            />
            {deleteError && <p className="text-red-600 text-sm">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDeletePermanently}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Видалення..." : "Підтвердити видалення"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
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
