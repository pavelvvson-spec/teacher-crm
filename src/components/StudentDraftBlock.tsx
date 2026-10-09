"use client";

import { useRouter } from "next/navigation";
import NextLessonPrepButton from "@/components/NextLessonPrepButton";

// Блок у картці учня / на сторінці підготовки: «Наступний урок · дата ще не відома»
export default function StudentDraftBlock({
  studentId,
  studentName,
  draft,
  hasFutureLesson,
  showName = false,
}: {
  studentId: string;
  studentName?: string;
  draft: { teacherNotes: string | null; homework: string | null; materialsCount: number } | null;
  hasFutureLesson: boolean;
  showName?: boolean;
}) {
  const router = useRouter();

  async function remove() {
    if (!confirm("Видалити чернетку наступного уроку разом з її матеріалами?")) return;
    const res = await fetch(`/api/students/${studentId}/draft`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      alert("Не вдалося видалити");
      return;
    }
    router.refresh();
  }

  if (!draft) {
    // Чернетки немає: пропонуємо створити, лише якщо наступного уроку в календарі теж немає
    if (hasFutureLesson) return null;
    return (
      <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">Наступного уроку в календарі ще немає.</p>
        <NextLessonPrepButton
          studentId={studentId}
          label="📝 Підготувати наступний урок"
          className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
          onChanged={() => router.refresh()}
        />
      </div>
    );
  }

  const preview = [draft.teacherNotes, draft.homework ? `ДЗ: ${draft.homework}` : ""].filter(Boolean).join(" · ");

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 space-y-2 border-l-4 border-amber-300">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-gray-800">
          📝 {showName && studentName ? <>{studentName} · </> : null}Наступний урок
          <span className="text-sm font-normal text-amber-700"> · дата ще не відома</span>
        </p>
        {draft.materialsCount > 0 && <span className="text-xs text-gray-400">матеріалів: {draft.materialsCount}</span>}
      </div>
      {preview && <p className="text-sm text-gray-600 line-clamp-2 whitespace-pre-wrap">{preview}</p>}
      <div className="flex items-center gap-2 pt-1">
        <NextLessonPrepButton
          studentId={studentId}
          label="Відкрити"
          className="px-3 py-2 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700"
          onChanged={() => router.refresh()}
        />
        <button
          type="button"
          onClick={remove}
          className="px-3 py-2 text-sm text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
        >
          Видалити
        </button>
      </div>
    </div>
  );
}
