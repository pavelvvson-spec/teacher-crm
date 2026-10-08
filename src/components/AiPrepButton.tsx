"use client";

import { useState } from "react";

export default function AiPrepButton({
  lessonId,
  onUsePlan,
  onUseHomework,
}: {
  lessonId: string;
  onUsePlan: (text: string) => void;
  onUseHomework: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [wish, setWish] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState("");
  const [homework, setHomework] = useState("");
  const [message, setMessage] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    setMessage("");
    const res = await fetch(`/api/lessons/${lessonId}/ai-prep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wish }),
    }).catch(() => null);
    setLoading(false);

    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      setError(data.error || "Не вдалося підготувати урок");
      return;
    }
    setPlan(data.plan || "");
    setHomework(data.homework || "");
  }

  return (
    <div className="border-b border-gray-100 pb-4 space-y-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
      >
        {open ? "Сховати ШІ-підготовку" : "✨ Підготувати з ШІ"}
      </button>

      {open && (
        <div className="space-y-3">
          <textarea
            value={wish}
            onChange={(e) => setWish(e.target.value)}
            placeholder="Побажання (необов'язково): наприклад, «більше говоріння, тема — подорожі, повторити Present Perfect»"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "ШІ думає (до 30 секунд)..." : plan ? "Згенерувати ще раз" : "Згенерувати план"}
          </button>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          {plan && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">План уроку</p>
              <div className="bg-indigo-50/50 rounded-xl px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap max-h-80 overflow-y-auto">
                {plan}
              </div>
              <button
                type="button"
                onClick={() => {
                  onUsePlan(plan);
                  setMessage("План вставлено в нотатку. Не забудьте зберегти.");
                }}
                className="px-3 py-1.5 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700"
              >
                Вставити в нотатку
              </button>
            </div>
          )}

          {homework && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Запропоноване ДЗ</p>
              <div className="bg-purple-50/50 rounded-xl px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap">
                {homework}
              </div>
              <button
                type="button"
                onClick={() => {
                  onUseHomework(homework);
                  setMessage("ДЗ вставлено. Не забудьте зберегти.");
                }}
                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
              >
                Вставити в ДЗ
              </button>
            </div>
          )}

          {message && <p className="text-green-600 text-sm">{message}</p>}
          {plan && (
            <p className="text-xs text-gray-400">
              Це підказка ШІ — перевірте й відредагуйте перед уроком.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
