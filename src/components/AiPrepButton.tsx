"use client";

import { useState } from "react";
import PlanText from "@/components/PlanText";

type Mode = "replace" | "append";

// ШІ-підготовка уроку. Згенерований план і ДЗ одразу потрапляють у поля «Нотатка до уроку» і «ДЗ»
// (там їх можна редагувати). Якщо вчителька вже щось написала сама — нічого не затираємо,
// а показуємо підказку з кнопками «Замінити» / «Додати в кінець».
export default function AiPrepButton({
  lessonId,
  endpoint,
  currentPlan,
  currentHomework,
  onUsePlan,
  onUseHomework,
}: {
  lessonId: string;
  endpoint?: string; // інша адреса генерації (наприклад, для чернетки наступного уроку)
  currentPlan: string;
  currentHomework: string;
  onUsePlan: (text: string, mode: Mode) => void;
  onUseHomework: (text: string, mode: Mode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [wish, setWish] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Що ШІ вставив востаннє — щоб «Згенерувати ще раз» замінював свій же текст, а не дописував
  const [lastPlan, setLastPlan] = useState("");
  const [lastHomework, setLastHomework] = useState("");
  // Підказки, які не вставились автоматично (бо поле вже заповнене вчителькою)
  const [pendingPlan, setPendingPlan] = useState("");
  const [pendingHomework, setPendingHomework] = useState("");
  const [message, setMessage] = useState("");

  const canReplace = (current: string, last: string) => !current.trim() || current.trim() === last.trim();

  async function generate() {
    setLoading(true);
    setError("");
    setMessage("");
    setPendingPlan("");
    setPendingHomework("");
    const res = await fetch(endpoint ?? `/api/lessons/${lessonId}/ai-prep`, {
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
    const plan: string = data.plan || "";
    const homework: string = data.homework || "";
    const inserted: string[] = [];

    if (plan) {
      if (canReplace(currentPlan, lastPlan)) {
        onUsePlan(plan, "replace");
        setLastPlan(plan);
        inserted.push("план — у «Нотатку до уроку»");
      } else setPendingPlan(plan);
    }
    if (homework) {
      if (canReplace(currentHomework, lastHomework)) {
        onUseHomework(homework, "replace");
        setLastHomework(homework);
        inserted.push("ДЗ — у «Домашнє завдання»");
      } else setPendingHomework(homework);
    }
    if (inserted.length) {
      setMessage(`✓ Вставлено ${inserted.join(", ")}. Можна редагувати, потім — «Зберегти».`);
      setOpen(false);
    }
  }

  function usePending(kind: "plan" | "homework", mode: Mode) {
    if (kind === "plan") {
      onUsePlan(pendingPlan, mode);
      setLastPlan(mode === "replace" ? pendingPlan : "");
      setPendingPlan("");
    } else {
      onUseHomework(pendingHomework, mode);
      setLastHomework(mode === "replace" ? pendingHomework : "");
      setPendingHomework("");
    }
    setMessage("✓ Вставлено. Можна редагувати, потім — «Зберегти».");
  }

  const btnCls = "px-3 py-1.5 rounded-lg text-sm font-medium";

  return (
    <div className="border-b border-gray-100 pb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
        >
          {open ? "Сховати ШІ-підготовку" : lastPlan ? "✨ Згенерувати інакше" : "✨ Підготувати з ШІ"}
        </button>
        {message && !open && <span className="text-green-600 text-xs">{message}</span>}
      </div>

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
            {loading ? "ШІ думає (до 30 секунд)..." : lastPlan ? "Згенерувати ще раз" : "Згенерувати план"}
          </button>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {message && <p className="text-green-600 text-sm">{message}</p>}
        </div>
      )}

      {pendingPlan && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">У нотатці вже є ваш текст. Що зробити з планом від ШІ?</p>
          <div className="bg-indigo-50/50 rounded-xl px-4 py-3 max-h-72 overflow-y-auto">
            <PlanText text={pendingPlan} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => usePending("plan", "append")}
              className={`${btnCls} bg-pink-600 text-white hover:bg-pink-700`}
            >
              Додати в кінець нотатки
            </button>
            <button
              type="button"
              onClick={() => usePending("plan", "replace")}
              className={`${btnCls} bg-gray-100 text-gray-700 hover:bg-gray-200`}
            >
              Замінити нотатку
            </button>
            <button type="button" onClick={() => setPendingPlan("")} className={`${btnCls} text-gray-500 hover:bg-gray-100`}>
              Не треба
            </button>
          </div>
        </div>
      )}

      {pendingHomework && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">У ДЗ вже є ваш текст. Запропоноване ДЗ від ШІ:</p>
          <div className="bg-purple-50/50 rounded-xl px-4 py-3">
            <PlanText text={pendingHomework} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => usePending("homework", "append")}
              className={`${btnCls} bg-purple-600 text-white hover:bg-purple-700`}
            >
              Додати в кінець ДЗ
            </button>
            <button
              type="button"
              onClick={() => usePending("homework", "replace")}
              className={`${btnCls} bg-gray-100 text-gray-700 hover:bg-gray-200`}
            >
              Замінити ДЗ
            </button>
            <button
              type="button"
              onClick={() => setPendingHomework("")}
              className={`${btnCls} text-gray-500 hover:bg-gray-100`}
            >
              Не треба
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
