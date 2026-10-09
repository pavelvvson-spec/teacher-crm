"use client";

import { useState } from "react";
import LessonPrepModal, { type PrepLesson } from "@/components/LessonPrepModal";

type DraftResponse = {
  student: { id: string; firstName: string; lastName: string | null; defaultLessonDuration: number };
  draft: { teacherNotes: string | null; homework: string | null };
  previous: PrepLesson["previous"];
  nextLesson: (PrepLesson & { studentId: string }) | null;
};

// Кнопка «Підготувати наступний урок»: якщо наступний урок уже є в календарі — відкриває його підготовку,
// якщо ні — чернетку «Наступний урок · дата ще не відома».
export default function NextLessonPrepButton({
  studentId,
  label = "📝 Підготувати наступний урок",
  className = "w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200",
  onOpenChange,
  onChanged,
}: {
  studentId: string;
  label?: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<{ lesson: PrepLesson; draft: boolean } | null>(null);
  const [changed, setChanged] = useState(false);

  async function open() {
    setLoading(true);
    const res = await fetch(`/api/students/${studentId}/draft`).catch(() => null);
    setLoading(false);
    if (!res || !res.ok) {
      alert("Не вдалося відкрити підготовку. Спробуйте ще раз.");
      return;
    }
    const data: DraftResponse = await res.json();
    if (data.nextLesson) {
      setTarget({ lesson: data.nextLesson, draft: false });
    } else {
      setTarget({
        draft: true,
        lesson: {
          id: `draft-${studentId}`,
          startAt: new Date().toISOString(),
          duration: data.student.defaultLessonDuration,
          teacherNotes: data.draft.teacherNotes,
          homework: data.draft.homework,
          student: { firstName: data.student.firstName, lastName: data.student.lastName },
          previous: data.previous,
        },
      });
    }
    setChanged(false);
    onOpenChange?.(true);
  }

  function close() {
    setTarget(null);
    onOpenChange?.(false);
    if (changed) onChanged?.();
  }

  return (
    <>
      <button type="button" onClick={open} disabled={loading} className={`${className} disabled:opacity-60`}>
        {loading ? "Відкриваю…" : label}
      </button>
      {target && (
        <LessonPrepModal
          key={target.lesson.id}
          lesson={target.lesson}
          draftStudentId={target.draft ? studentId : undefined}
          onClose={close}
          onSaved={() => setChanged(true)}
          onMaterialsChange={() => setChanged(true)}
        />
      )}
    </>
  );
}
