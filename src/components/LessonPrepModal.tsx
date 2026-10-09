"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/calendar-utils";
import CopyPrepButton from "@/components/CopyPrepButton";
import AiPrepButton from "@/components/AiPrepButton";
import TextbookPagesRow from "@/components/TextbookPagesRow";

export type PrepMaterial = { id: string; type: string; title: string; url: string };

export type PrepPrevious = { startAt: string; teacherNotes: string | null; homework: string | null } | null;

export type PrepLesson = {
  id: string;
  startAt: string | Date;
  duration: number;
  teacherNotes: string | null;
  homework: string | null;
  student: { firstName: string; lastName: string | null };
  // undefined — вікно саме підтягне минулий урок; null — минулого уроку немає
  previous?: PrepPrevious;
};

const MATERIAL_LABELS: Record<string, string> = {
  LINK: "Посилання",
  YOUTUBE: "YouTube",
  PDF: "PDF",
  IMAGE: "Скріншот",
};

// Спільне вікно «Підготовка до уроку» — і на сторінці підготовки, і в календарі
export default function LessonPrepModal({
  lesson,
  onClose,
  onSaved,
  onMaterialsChange,
  draftStudentId,
}: {
  lesson: PrepLesson;
  // Якщо задано — це чернетка наступного уроку учня (дати ще немає)
  draftStudentId?: string;
  onClose: () => void;
  onSaved: (fields: { teacherNotes: string | null; homework: string | null }) => void;
  onMaterialsChange?: (materials: PrepMaterial[]) => void;
}) {
  const [noteText, setNoteText] = useState(lesson.teacherNotes || "");
  const [homeworkText, setHomeworkText] = useState(lesson.homework || "");
  const [savedNote, setSavedNote] = useState(lesson.teacherNotes || "");
  const [savedHomework, setSavedHomework] = useState(lesson.homework || "");
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [sendingHomework, setSendingHomework] = useState(false);

  const [materials, setMaterials] = useState<PrepMaterial[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const [previous, setPrevious] = useState<PrepPrevious | undefined>(lesson.previous);

  const isDirty = noteText !== savedNote || homeworkText !== savedHomework;
  const isDraft = Boolean(draftStudentId);
  const materialsUrl = isDraft
    ? `/api/students/${draftStudentId}/draft/materials`
    : `/api/lessons/${lesson.id}/materials`;
  const startAt = new Date(lesson.startAt);

  async function loadMaterials() {
    setMaterialsLoading(true);
    const res = await fetch(materialsUrl).catch(() => null);
    const data: PrepMaterial[] = res && res.ok ? await res.json() : [];
    setMaterials(data);
    setMaterialsLoading(false);
    onMaterialsChange?.(data);
  }

  useEffect(() => {
    loadMaterials();
    if (lesson.previous === undefined && !isDraft) {
      fetch(`/api/lessons/${lesson.id}/previous`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setPrevious(d ?? null))
        .catch(() => setPrevious(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  function requestClose() {
    if (isDirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  async function saveAll(close: boolean) {
    setSaving(true);
    const res = await fetch(isDraft ? `/api/students/${draftStudentId}/draft` : `/api/lessons/${lesson.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherNotes: noteText, homework: homeworkText }),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      alert("Не вдалося зберегти. Спробуйте ще раз.");
      return;
    }
    setSavedNote(noteText);
    setSavedHomework(homeworkText);
    setConfirmClose(false);
    onSaved({ teacherNotes: noteText || null, homework: homeworkText || null });
    if (close) onClose();
  }

  function handleCopied(result: { teacherNotes: string | null; homework: string | null }) {
    setNoteText(result.teacherNotes || "");
    setHomeworkText(result.homework || "");
    setSavedNote(result.teacherNotes || "");
    setSavedHomework(result.homework || "");
    onSaved({ teacherNotes: result.teacherNotes, homework: result.homework });
    loadMaterials();
  }

  async function sendHomeworkToTelegram() {
    setSendingHomework(true);
    await fetch(`/api/lessons/${lesson.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homework: homeworkText }),
    });
    setSavedHomework(homeworkText);
    onSaved({ teacherNotes: savedNote || null, homework: homeworkText || null });
    const res = await fetch(`/api/lessons/${lesson.id}/send-homework`, { method: "POST" });
    setSendingHomework(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Не вдалося надіслати ДЗ");
    } else {
      alert("Домашнє завдання надіслано учню в Telegram!");
    }
  }

  async function addLinkMaterial() {
    if (!newLinkTitle || !newLinkUrl) return;
    await fetch(materialsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newLinkTitle, url: newLinkUrl }),
    });
    setNewLinkTitle("");
    setNewLinkUrl("");
    loadMaterials();
  }

  async function uploadFileMaterial(file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name);
    const res = await fetch(materialsUrl, { method: "POST", body: formData });
    setUploading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert("Помилка завантаження: " + (data.error || res.status));
      return;
    }
    loadMaterials();
  }

  async function deleteMaterial(materialId: string) {
    if (!confirm("Видалити цей матеріал?")) return;
    await fetch(materialsUrl, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId }),
    });
    loadMaterials();
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50"
      onMouseDown={(e) => {
        // клік у порожнє місце поза вікном — закрити
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        {/* Шапка — завжди видно */}
        <div className="flex justify-between items-start gap-3 px-6 pt-5 pb-3 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-800 truncate">
              {lesson.student.firstName} {lesson.student.lastName ?? ""}
            </h2>
            {isDraft ? (
              <p className="text-sm text-amber-700">📝 Наступний урок · дата ще не відома</p>
            ) : (
              <p className="text-gray-500 text-sm">
                {startAt.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
                {formatTime(startAt)} · {lesson.duration} хв
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Закрити"
            title="Закрити"
            className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Середина — гортається */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {previous && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm space-y-1">
              <p className="text-xs font-medium text-gray-500">
                Минулий урок ·{" "}
                {new Date(previous.startAt).toLocaleDateString("uk-UA", { day: "numeric", month: "long" })}
              </p>
              {previous.teacherNotes && (
                <p className="text-gray-700 whitespace-pre-wrap line-clamp-4">
                  <span className="text-gray-400">Нотатка:</span> {previous.teacherNotes}
                </p>
              )}
              {previous.homework && (
                <p className="text-gray-700 whitespace-pre-wrap line-clamp-4">
                  <span className="text-gray-400">ДЗ:</span> {previous.homework}
                </p>
              )}
            </div>
          )}

          {isDraft ? (
            <p className="text-xs text-gray-500 bg-amber-50 rounded-lg px-3 py-2">
              Щойно ви додасте наступний урок у календар, ця підготовка сама переїде в нього.
            </p>
          ) : (
            <CopyPrepButton lessonId={lesson.id} onCopied={handleCopied} />
          )}

          <TextbookPagesRow
            url={isDraft ? `/api/students/${draftStudentId}/draft/textbook` : `/api/lessons/${lesson.id}/textbook`}
          />

          <AiPrepButton
            lessonId={lesson.id}
            endpoint={isDraft ? `/api/students/${draftStudentId}/draft/ai-prep` : undefined}
            onUsePlan={(text) => setNoteText((prev) => (prev.trim() ? `${prev}\n\n${text}` : text))}
            onUseHomework={(text) => setHomeworkText((prev) => (prev.trim() ? `${prev}\n\n${text}` : text))}
          />

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700">Нотатка до уроку</p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Наприклад: не забути перевірити знання слів, перевірити дз..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-gray-700">Домашнє завдання</p>
              {!isDraft && (
              <button
                type="button"
                onClick={sendHomeworkToTelegram}
                disabled={sendingHomework || !homeworkText.trim()}
                className="text-xs px-2.5 py-1 rounded-lg text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-40"
              >
                {sendingHomework ? "Надсилання..." : "✈️ Надіслати учню в Telegram"}
              </button>
              )}
            </div>
            <textarea
              value={homeworkText}
              onChange={(e) => setHomeworkText(e.target.value)}
              placeholder="Наприклад: вивчити 10 слів, зробити вправи 3-5 на стор. 12..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </div>

          <div className="space-y-2 border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700">Матеріали</p>
            {materialsLoading ? (
              <p className="text-gray-400 text-sm">Завантаження...</p>
            ) : materials.length === 0 ? (
              <p className="text-gray-400 text-sm">Поки немає.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {materials.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 py-1.5">
                    <span className="text-xs text-gray-400 w-16 shrink-0">{MATERIAL_LABELS[m.type] || m.type}</span>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-0 text-pink-600 underline decoration-pink-200 hover:decoration-pink-600 text-sm truncate"
                    >
                      {m.title}
                    </a>
                    <button
                      type="button"
                      onClick={() => deleteMaterial(m.id)}
                      aria-label="Видалити"
                      title="Видалити"
                      className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <input
                type="text"
                placeholder="Назва"
                value={newLinkTitle}
                onChange={(e) => setNewLinkTitle(e.target.value)}
                className="sm:w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="https://..."
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={addLinkMaterial}
                disabled={!newLinkTitle || !newLinkUrl}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-40"
              >
                Додати
              </button>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-800">
              <span className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">📎 Завантажити PDF або скріншот</span>
              <input
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadFileMaterial(file);
                  e.target.value = "";
                }}
              />
              {uploading && <span className="text-gray-400">Завантаження файлу...</span>}
            </label>
          </div>
        </div>

        {/* Низ — завжди видно */}
        <div className="px-6 py-4 border-t border-gray-100 bg-white">
          {confirmClose ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-700">Є незбережені зміни. Зберегти їх?</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => saveAll(true)}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-pink-600 text-white rounded-xl text-sm font-medium hover:bg-pink-700 disabled:opacity-50"
                >
                  {saving ? "Збереження..." : "Зберегти"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmClose(false);
                    onClose();
                  }}
                  className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
                >
                  Не зберігати
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClose(false)}
                  className="px-4 py-2.5 text-gray-500 rounded-xl text-sm hover:bg-gray-100"
                >
                  Повернутися
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => (isDirty ? saveAll(true) : onClose())}
                disabled={saving}
                className="flex-1 px-4 py-3 bg-pink-600 text-white rounded-xl font-medium hover:bg-pink-700 disabled:opacity-50"
              >
                {saving ? "Збереження..." : isDirty ? "Зберегти" : "Готово"}
              </button>
              {isDirty && <span className="text-xs text-gray-400">є незбережені зміни</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
