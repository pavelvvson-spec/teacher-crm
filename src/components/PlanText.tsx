// Гарний показ плану уроку / ДЗ: заголовки з емодзі — жирні, пункти «•» — з відступом,
// кроки «1) 0–5 хв · …» — виділені. Сам текст лишається простим (його можна редагувати й надсилати в Telegram).

const HEADER_RE = /^(\p{Extended_Pictographic}|🎯|🔁|⏱|📖|⚠️|📚|✅|💡)/u;

export default function PlanText({ text, className = "" }: { text: string; className?: string }) {
  // Старі нотатки могли зберегтися з буквальними \n — показуємо їх як переноси
  const lines = text.replace(/\\n/g, "\n").split("\n");
  return (
    <div className={`text-sm text-gray-800 leading-relaxed space-y-0.5 ${className}`}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-2" />;
        const t = line.trim();
        if (t.startsWith("•") || t.startsWith("- ")) {
          return (
            <div key={i} className="flex gap-2 pl-3">
              <span className="text-gray-400 shrink-0">•</span>
              <span className="min-w-0">{t.replace(/^(•|-)\s*/, "")}</span>
            </div>
          );
        }
        if (/^\d+[).]\s/.test(t)) {
          return (
            <p key={i} className="font-medium text-gray-900 pt-1">
              {t}
            </p>
          );
        }
        if (HEADER_RE.test(t)) {
          return (
            <p key={i} className="font-semibold text-gray-900 pt-1.5 first:pt-0">
              {t}
            </p>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {t}
          </p>
        );
      })}
    </div>
  );
}
