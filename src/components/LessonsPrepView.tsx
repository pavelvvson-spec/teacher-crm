"use client";

import { useState } from "react";
import { formatTime } from "@/lib/calendar-utils";

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
    loadMaterials(lessonId);
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

  const openLesson_ = lessonsState.find((l) => l.id === openLessonId) || null;

  return (
    <div className="space-y-6">
      {lessonsState.length === 0 ? (
        <p className="text-gray-500">На найближчий тиждень запланованих уроків немає.</p>
      ) : (
        Object.entries(grouped).map(([day, dayLessons]) => (
          <div key={day} className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="text-lg font-semibold text-gray-800 mb-3 capitalize">{day}</h2>
            <div className="divide-y divide-gray-100">
              {dayLessons.map((lesson) => (
                <div key={lesson.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-800">
                        {lesson.student.firstName} {lesson.student.lastName ?? ""}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatTime(new Date(lesson.startAt))} · {lesson.duration} хв
                      </p>
                    </div>
                    <button
                      onClick={() => openLesson(lesson.id)}
                      className="px-4 py-2 bg-pink-50 text-pink-700 rounded-xl text-sm font-medium hover:bg-pink-100"
                    >
                      Підготувати урок
                    </button>
                  </div>
                  {lesson.materials.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {lesson.materials.map((m) => (
                        
                         <a key={m.id}
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-2 py-1 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100"
                        >
                          {materialTypeLabels[m.type] || m.type}: {m.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
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
                        className="text-blue-600 underline text-sm break-all"
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