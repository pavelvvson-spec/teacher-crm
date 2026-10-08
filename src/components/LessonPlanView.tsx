"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/calendar-utils";

type Material = { id: string; type: string; title: string; url: string };

const MATERIAL_LABELS: Record<string, string> = {
  LINK: "Посилання",
  YOUTUBE: "YouTube",
  PDF: "PDF",
  IMAGE: "Скріншот",
};

// Перегляд підготовленого уроку (лише читання): план/нотатка, ДЗ, матеріали
export default function LessonPlanView({
  lesson,
  onClose,
  onEdit,
}: {
  lesson: {
    id: string;
    startAt: string | Date;
    duration: number;
    teacherNotes: string | null;
    homework: string | null;
    student: { firstName: string; lastName: string | null };
  };
  onClose: () => void;
  onEdit: () => void;
}) {
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const startAt = new Date(lesson.startAt);

  useEffect(() => {
    fetch(`/api/lessons/${lesson.id}/materials`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Material[]) => setMaterials(d))
      .catch(() => setMaterials([]));
  }, [lesson.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    }
    // capture — щоб Esc закрив лише це вікно, а не й вікно уроку під ним
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-[60]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        <div className="flex justify-between items-start gap-3 px-6 pt-5 pb-3 border-b border-gray-100">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-pink-600">📋 План уроку</p>
            <h2 className="text-lg font-semibold text-gray-800 truncate">
              {lesson.student.firstName} {lesson.student.lastName ?? ""}
            </h2>
            <p className="text-gray-500 text-sm">
              {startAt.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
              {formatTime(startAt)} · {lesson.duration} хв
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            title="Закрити"
            className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">План і нотатка</h3>
            {lesson.teacherNotes?.trim() ? (
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{lesson.teacherNotes}</p>
            ) : (
              <p className="text-sm text-gray-400">Не заповнено</p>
            )}
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Домашнє завдання</h3>
            {lesson.homework?.trim() ? (
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{lesson.homework}</p>
            ) : (
              <p className="text-sm text-gray-400">Не задано</p>
            )}
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Матеріали</h3>
            {materials === null ? (
              <p className="text-sm text-gray-400">Завантаження...</p>
            ) : materials.length === 0 ? (
              <p className="text-sm text-gray-400">Немає</p>
            ) : (
              <ul className="space-y-1">
                {materials.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm">
                    <span className="text-xs text-gray-400 w-16 shrink-0">{MATERIAL_LABELS[m.type] || m.type}</span>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 truncate text-pink-600 underline decoration-pink-200 hover:decoration-pink-600"
                    >
                      {m.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
          >
            ✏️ Редагувати
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-pink-600 text-white rounded-xl text-sm font-medium hover:bg-pink-700"
          >
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}
