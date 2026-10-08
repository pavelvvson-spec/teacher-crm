"use client";

import { useState } from "react";
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
  const [savingNote, setSavingNote] = useState(false);
  const [homeworkText, setHomeworkText] = useState("");
  const [savingHomework, setSavingHomework] = useState(false);
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
    loadMaterials(lessonId);
  }

  function handleCopied(result: { teacherNotes: string | null; homework: string | null }) {
    if (!openLessonId) return;
    setNoteText(result.teacherNotes || "");
    setHomeworkText(result.homework || "");
    setLessonsState((prev) =>
      prev.map((l) =>
        l.id === openLessonId
          ? { ...l, teacherNotes: result.teacherNotes, homework: result.homework }
          : l
      )
    );
    loadMaterials(openLessonId);
  }

  async function saveNote() {
    if (!openLessonId) return;
    setSavingNote(true);
    await fetch(`/api/lessons/${openLessonId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherNotes: noteText }),
    });
    setLessonsState((prev) =>
      prev.map((l) => (l.id === openLessonId ? { ...l, teacherNotes: noteText } : l))
    );
    setSavingNote(false);
  }

  async function saveHomework() {
    if (!openLessonId) return;
    setSavingHomework(true);
    await fetch(`/api/lessons/${openLessonId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homework: homeworkText }),
    });
    setLessonsState((prev) =>
      prev.map((l) => (l.id === openLessonId ? { ...l, homework: homeworkText } : l))
    );
    setSavingHomework(false);
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
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Підготовка до уроку</h2>
                <p className="text-gray-500 text-sm">
                  {openLesson_.student.firstName} {openLesson_.student.lastName ?? ""} ·{" "}
                  {new Date(openLesson_.startAt).toLocaleDateString("uk-UA")}{" "}
                  {formatTime(new Date(openLesson_.startAt))}
                </p>
              </div>
              <button
                onClick={() => setOpenLessonId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                Закрити
              </button>
            </div>

            <CopyPrepButton lessonId={openLesson_.id} onCopied={handleCopied} />

            <AiPrepButton
              lessonId={openLesson_.id}
              onUsePlan={(text) => setNoteText((prev) => (prev.trim() ? `${prev}\n\n${text}` : text))}
              onUseHomework={(text) => setHomeworkText((prev) => (prev.trim() ? `${prev}\n\n${text}` : text))}
            />

            <div className="border-b border-gray-100 pb-4 space-y-2">
              <p className="text-sm font-medium text-gray-700">Нотатка до уроку</p>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Наприклад: не забути перевірити знання слів, перевірити дз..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={saveNote}
                disabled={savingNote}
                className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700 disabled:opacity-50"
              >
                {savingNote ? "Збереження..." : "Зберегти нотатку"}
              </button>
            </div>

            <div className="border-b border-gray-100 pb-4 space-y-2">
              <p className="text-sm font-medium text-gray-700">Домашнє завдання (для наступного уроку)</p>
              <textarea
                value={homeworkText}
                onChange={(e) => setHomeworkText(e.target.value)}
                placeholder="Наприклад: вивчити 10 слів, зробити вправи 3-5 на стор. 12..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={saveHomework}
                  disabled={savingHomework}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                >
                  {savingHomework ? "Збереження..." : "Зберегти домашнє завдання"}
                </button>
                <button
                  onClick={sendHomeworkToTelegram}
                  disabled={sendingHomework}
                  className="px-4 py-2 bg-[#0088cc] text-white rounded-lg text-sm font-medium hover:bg-[#0077b3] disabled:opacity-50 flex items-center gap-1"
                >
                  ✈️ {sendingHomework ? "Надсилання..." : "Відправити ДЗ в Telegram"}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {materialsLoading ? (
                <p className="text-gray-400 text-sm">Завантаження...</p>
              ) : materials.length === 0 ? (
                <p className="text-gray-500 text-sm">Матеріалів ще немає.</p>
              ) : (
                materials.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3"
                  >
                    <div>
                      <p className="text-xs text-pink-600 font-medium">
                        {materialTypeLabels[m.type] || m.type}
                      </p>
                      <a href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-pink-600 underline text-sm break-all"
                      >
                        {m.title}
                      </a>
                    </div>
                    <button
                      onClick={() => deleteMaterial(m.id)}
                      className="text-gray-400 hover:text-red-500 text-sm px-2"
                    >
                      Видалити
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Додати посилання (YouTube тощо)</p>
              <input
                type="text"
                placeholder="Назва"
                value={newLinkTitle}
                onChange={(e) => setNewLinkTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="https://..."
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={addLinkMaterial}
                className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700"
              >
                Додати посилання
              </button>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Завантажити PDF або скріншот</p>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadFileMaterial(file);
                }}
                className="text-sm"
              />
              {uploading && <p className="text-gray-400 text-sm">Завантаження файлу...</p>}
            </div>

            <button
              onClick={() => setOpenLessonId(null)}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700"
            >
              Готово
            </button>
          </div>
        </div>
      )}
    </div>
  );
}