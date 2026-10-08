"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/calendar-utils";
import CopyPrepButton from "@/components/CopyPrepButton";
import AiPrepButton from "@/components/AiPrepButton";

type Material = {
  id: string;
  type: string;
  title: string;
  url: string;
};

type Lesson = {
  id: string;
  startAt: string;
  duration: number;
  teacherNotes: string | null;
  homework: string | null;
  student: { firstName: string; lastName: string | null };
  materials: Material[];
  // Попередній урок цього учня з нотаткою або ДЗ (лише для перегляду)
  previous: { startAt: string; teacherNotes: string | null; homework: string | null } | null;
};

export default function LessonsPrepView({ lessons }: { lessons: Lesson[] }) {
  const [lessonsState, setLessonsState] = useState<Lesson[]>(lessons);
  const [openLessonId, setOpenLessonId] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [homeworkText, setHomeworkText] = useState("");
  // Те, що вже збережено в базі — щоб знати, чи є незбережені зміни
  const [savedNote, setSavedNote] = useState("");
  const [savedHomework, setSavedHomework] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [sendingHomework, setSendingHomework] = useState(false);

  const materialTypeLabels: Record<string, string> = {
    LINK: "Посилання",
    YOUTUBE: "YouTube",
    PDF: "PDF",
    IMAGE: "Скріншот",
  };

  async function refreshLessonMaterials(lessonId: string) {
    const res = await fetch(`/api/lessons/${lessonId}/materials`);
    const data = await res.json();
    setLessonsState((prev) =>
      prev.map((l) => (l.id === lessonId ? { ...l, materials: data } : l))
    );
    return data;
  }

  async function loadMaterials(lessonId: string) {
    setMaterialsLoading(true);
    const data = await refreshLessonMaterials(lessonId);
    setMaterials(data);
    setMaterialsLoading(false);
  }

  function openLesson(lessonId: string) {
    setOpenLessonId(lessonId);
    setNewLinkTitle("");
    setNewLinkUrl("");
    const lesson = lessonsState.find((l) => l.id === lessonId);
    setNoteText(lesson?.teacherNotes || "");
    setHomeworkText(lesson?.homework || "");
    setSavedNote(lesson?.teacherNotes || "");
    setSavedHomework(lesson?.homework || "");
    setConfirmClose(false);
    loadMaterials(lessonId);
  }

  const isDirty = noteText !== savedNote || homeworkText !== savedHomework;

  // Спроба закрити вікно (хрестик, клік поза вікном, Esc):
  // якщо є незбережений текст — спершу питаємо
  function requestClose() {
    if (isDirty) {
      setConfirmClose(true);
      return;
    }
    setOpenLessonId(null);
  }

  useEffect(() => {
    if (!openLessonId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function handleCopied(result: { teacherNotes: string | null; homework: string | null }) {
    if (!openLessonId) return;
    setNoteText(result.teacherNotes || "");
    setHomeworkText(result.homework || "");
    setSavedNote(result.teacherNotes || "");
    setSavedHomework(result.homework || "");
    setLessonsState((prev) =>
      prev.map((l) =>
        l.id === openLessonId
          ? { ...l, teacherNotes: result.teacherNotes, homework: result.homework }
          : l
      )
    );
    loadMaterials(openLessonId);
  }

  // Зберігає нотатку і ДЗ разом. close=true — після збереження закрити вікно
  async function saveAll(close: boolean) {
    if (!openLessonId) return;
    const lessonId = openLessonId;
    setSaving(true);
    const res = await fetch(`/api/lessons/${lessonId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherNotes: noteText, homework: homeworkText }),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      alert("Не вдалося зберегти. Спробуйте ще раз.");
      return;
    }
    setLessonsState((prev) =>
      prev.map((l) =>
        l.id === lessonId ? { ...l, teacherNotes: noteText || null, homework: homeworkText || null } : l
      )
    );
    setSavedNote(noteText);
    setSavedHomework(homeworkText);
    setConfirmClose(false);
    if (close) setOpenLessonId(null);
  }

  async function sendHomeworkToTelegram() {
    if (!openLessonId) return;
    setSendingHomework(true);
    await fetch(`/api/lessons/${openLessonId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homework: homeworkText }),
    });
    setLessonsState((prev) =>
      prev.map((l) => (l.id === openLessonId ? { ...l, homework: homeworkText } : l))
    );
    setSavedHomework(homeworkText);
    const res = await fetch(`/api/lessons/${openLessonId}/send-homework`, {
      method: "POST",
    });
    setSendingHomework(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Не вдалося надіслати ДЗ");
    } else {
      alert("Домашнє завдання надіслано учню в Telegram!");
    }
  }

  async function addLinkMaterial() {
    if (!openLessonId || !newLinkTitle || !newLinkUrl) return;
    await fetch(`/api/lessons/${openLessonId}/materials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newLinkTitle, url: newLinkUrl }),
    });
    setNewLinkTitle("");
    setNewLinkUrl("");
    loadMaterials(openLessonId);
  }

  async function uploadFileMaterial(file: File) {
    if (!openLessonId) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name);
    const res = await fetch(`/api/lessons/${openLessonId}/materials`, {
      method: "POST",
      body: formData,
    });
    setUploading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert("Помилка завантаження: " + (data.error || res.status));
      return;
    }
    loadMaterials(openLessonId);
  }

  async function deleteMaterial(materialId: string) {
    if (!openLessonId) return;
    if (!confirm("Видалити цей матеріал?")) return;
    await fetch(`/api/lessons/${openLessonId}/materials`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId }),
    });
    loadMaterials(openLessonId);
  }

  const grouped: Record<string, Lesson[]> = {};
  for (const lesson of lessonsState) {
    const dayKey = new Date(lesson.startAt).toLocaleDateString("uk-UA", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    if (!grouped[dayKey]) grouped[dayKey] = [];
    grouped[dayKey].push(lesson);
  }

  // Урок вважається підготовленим, якщо є нотатка, ДЗ або хоча б один матеріал
  function isPrepared(l: Lesson): boolean {
    return Boolean(l.teacherNotes?.trim() || l.homework?.trim() || l.materials.length > 0);
  }

  const openLesson_ = lessonsState.find((l) => l.id === openLessonId) || null;

  return (
    <div className="space-y-6">
      {lessonsState.length === 0 ? (
        <p className="text-gray-500">На найближчий тиждень запланованих уроків немає.</p>
      ) : (
        Object.entries(grouped).map(([day, dayLessons]) => {
          const readyCount = dayLessons.filter(isPrepared).length;
          const allReady = readyCount === dayLessons.length;
          return (
            <div key={day} className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h2 className="text-lg font-semibold text-gray-800 capitalize">{day}</h2>
                <span className={`text-xs sm:text-sm whitespace-nowrap ${allReady ? "text-green-600" : "text-gray-400"}`}>
                  Підготовлено {readyCount} з {dayLessons.length}
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {dayLessons.map((lesson) => {
                  const ready = isPrepared(lesson);
                  return (
                    <div key={lesson.id} className="py-2.5 flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <p className="font-medium text-gray-800">
                            {lesson.student.firstName} {lesson.student.lastName ?? ""}
                          </p>
                          <span className="text-sm text-gray-400">
                            {formatTime(new Date(lesson.startAt))} · {lesson.duration} хв
                          </span>
                          {ready ? (
                            <span className="text-xs text-green-600 font-medium">✓ готово</span>
                          ) : (
                            <span className="text-xs text-gray-400">не підготовлено</span>
                          )}
                        </div>
                        {(lesson.teacherNotes || lesson.homework || lesson.materials.length > 0) && (
                          <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                            {lesson.teacherNotes && (
                              <p className="line-clamp-2">
                                <span className="text-gray-400">Нотатка:</span> {lesson.teacherNotes}
                              </p>
                            )}
                            {lesson.homework && (
                              <p className="line-clamp-2">
                                <span className="text-gray-400">ДЗ:</span> {lesson.homework}
                              </p>
                            )}
                            {lesson.materials.length > 0 && (
                              <p className="flex flex-wrap gap-x-2 gap-y-0.5">
                                <span className="text-gray-400">Матеріали:</span>
                                {lesson.materials.map((m) => (
                                  <a
                                    key={m.id}
                                    href={m.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-pink-600 underline decoration-pink-200 hover:decoration-pink-600"
                                  >
                                    {materialTypeLabels[m.type] || m.type}: {m.title}
                                  </a>
                                ))}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => openLesson(lesson.id)}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${
                          ready
                            ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            : "bg-pink-600 text-white hover:bg-pink-700"
                        }`}
                      >
                        {ready ? "Відкрити" : "Підготувати"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {openLesson_ && (
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
                  {openLesson_.student.firstName} {openLesson_.student.lastName ?? ""}
                </h2>
                <p className="text-gray-500 text-sm">
                  {new Date(openLesson_.startAt).toLocaleDateString("uk-UA", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}{" "}
                  · {formatTime(new Date(openLesson_.startAt))} · {openLesson_.duration} хв
                </p>
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
              {openLesson_.previous && (
                <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm space-y-1">
                  <p className="text-xs font-medium text-gray-500">
                    Минулий урок ·{" "}
                    {new Date(openLesson_.previous.startAt).toLocaleDateString("uk-UA", {
                      day: "numeric",
                      month: "long",
                    })}
                  </p>
                  {openLesson_.previous.teacherNotes && (
                    <p className="text-gray-700 whitespace-pre-wrap line-clamp-4">
                      <span className="text-gray-400">Нотатка:</span> {openLesson_.previous.teacherNotes}
                    </p>
                  )}
                  {openLesson_.previous.homework && (
                    <p className="text-gray-700 whitespace-pre-wrap line-clamp-4">
                      <span className="text-gray-400">ДЗ:</span> {openLesson_.previous.homework}
                    </p>
                  )}
                </div>
              )}

              <CopyPrepButton lessonId={openLesson_.id} onCopied={handleCopied} />

              <AiPrepButton
                lessonId={openLesson_.id}
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
                  <button
                    type="button"
                    onClick={sendHomeworkToTelegram}
                    disabled={sendingHomework || !homeworkText.trim()}
                    className="text-xs px-2.5 py-1 rounded-lg text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-40"
                  >
                    {sendingHomework ? "Надсилання..." : "✈️ Надіслати учню в Telegram"}
                  </button>
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
                        <span className="text-xs text-gray-400 w-16 shrink-0">
                          {materialTypeLabels[m.type] || m.type}
                        </span>
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
                        setOpenLessonId(null);
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
                    onClick={() => (isDirty ? saveAll(true) : setOpenLessonId(null))}
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
      )}
    </div>
  );
}