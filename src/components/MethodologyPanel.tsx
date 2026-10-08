"use client";

import { useEffect, useRef, useState } from "react";

type State = {
  methodology: string;
  methodologyUpdatedAt: string | null;
  openQuestions: { id: string; question: string; batch: string }[];
  batchTotal: number;
  isOnboarding: boolean;
  answered: { id: string; question: string; answer: string | null }[];
  inbox: { id: string; kind: string; content: string; imageUrl: string | null; createdAt: string }[];
};

type Proposal = {
  methodology: string;
  changes: string[];
  questionIds: string[];
  inboxIds: string[];
};

async function post(body: object) {
  const res = await fetch("/api/methodology", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok) throw new Error(data.error || "Щось пішло не так");
  return data;
}

// Кнопка запису голосу → текст (через /api/methodology/transcribe)
function MicButton({ onText }: { onText: (t: string) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const chunks = useRef<Blob[]>([]);

  async function start() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        setBusy(true);
        const fd = new FormData();
        fd.append("file", blob, "answer");
        const res = await fetch("/api/methodology/transcribe", { method: "POST", body: fd }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        setBusy(false);
        if (!res || !res.ok) setErr(data.error || "Не вдалося розпізнати");
        else if (data.text) onText(data.text);
      };
      r.start();
      setRec(r);
    } catch {
      setErr("Немає доступу до мікрофона");
    }
  }

  function stop() {
    rec?.stop();
    setRec(null);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={rec ? stop : start}
        disabled={busy}
        className={`px-3 py-2 rounded-lg text-sm font-medium ${
          rec ? "bg-red-600 text-white animate-pulse" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        } disabled:opacity-50`}
      >
        {busy ? "Розпізнаю…" : rec ? "⏹ Зупинити" : "🎙️ Голосом"}
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  );
}

export default function MethodologyPanel() {
  const [s, setS] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [hideQuiz, setHideQuiz] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [idea, setIdea] = useState("");
  const [ideaVoice, setIdeaVoice] = useState(false);
  const [caption, setCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/methodology")
      .then((r) => r.json())
      .then(setS)
      .catch(() => setError("Не вдалося завантажити методику"));
  }, []);

  async function run(fn: () => Promise<State | void>) {
    setError("");
    setSaving(true);
    try {
      const r = await fn();
      if (r) setS(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    }
    setSaving(false);
  }

  if (!s) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <p className="text-gray-400 text-sm">{error || "Завантаження…"}</p>
      </div>
    );
  }

  const q = s.openQuestions[0];
  const qNumber = s.batchTotal - s.openQuestions.length + 1;
  const pendingCount = s.answered.length + s.inbox.length;

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">🧑‍🏫 Моя методика</h2>
        <p className="text-gray-600 text-sm">
          Твої власні принципи викладання. ШІ враховує їх у кожному плані, пораді й розборі уроку — і вони
          важливіші за загальні правила.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Анкета / нові питання */}
      {q && !hideQuiz && (
        <div className="rounded-xl border-2 border-pink-300 bg-pink-50/60 p-4 space-y-3">
          <p className="text-sm font-semibold text-pink-700">
            {s.isOnboarding ? "📝 Анкета" : "🆕 Нові питання з твоїх уроків"} · питання {qNumber} з {s.batchTotal}
          </p>
          <p className="text-gray-800 font-medium">{q.question}</p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            placeholder="Відповідай своїми словами — як колезі"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          />
          <div className="flex flex-wrap items-center gap-2">
            <MicButton onText={(t) => setAnswer((a) => (a.trim() ? `${a} ${t}` : t))} />
            <button
              type="button"
              disabled={saving || !answer.trim()}
              onClick={() =>
                run(async () => {
                  const r = await post({ action: "answer", id: q.id, answer });
                  setAnswer("");
                  return r;
                })
              }
              className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700 disabled:opacity-40"
            >
              {saving ? "Зберігаю…" : "Зберегти й далі"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                run(async () => {
                  const r = await post({ action: "answer", id: q.id, skip: true });
                  setAnswer("");
                  return r;
                })
              }
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Пропустити
            </button>
            <button
              type="button"
              onClick={() => setHideQuiz(true)}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Продовжити пізніше
            </button>
          </div>
        </div>
      )}
      {q && hideQuiz && (
        <button
          type="button"
          onClick={() => setHideQuiz(false)}
          className="px-4 py-2 bg-pink-50 text-pink-700 rounded-lg text-sm font-medium hover:bg-pink-100"
        >
          📝 Продовжити опитування ({s.openQuestions.length} залишилось)
        </button>
      )}

      {/* Оновлення методики */}
      {!q && pendingCount > 0 && !proposal && (
        <div className="rounded-xl bg-indigo-50 p-4 space-y-2">
          <p className="text-sm text-gray-700">
            Є нове для методики: відповідей — {s.answered.length}, ідей — {s.inbox.length}. ШІ вбудує це в документ і
            покаже, що змінилось.
          </p>
          <button
            type="button"
            disabled={compiling}
            onClick={async () => {
              setCompiling(true);
              setError("");
              try {
                setProposal(await post({ action: "compile" }));
              } catch (e) {
                setError(e instanceof Error ? e.message : "Помилка");
              }
              setCompiling(false);
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {compiling ? "ШІ оновлює методику (до хвилини)…" : s.methodology ? "✨ Оновити методику" : "✨ Сформувати методику"}
          </button>
        </div>
      )}

      {proposal && (
        <div className="rounded-xl border-2 border-indigo-300 p-4 space-y-3">
          <p className="text-sm font-semibold text-indigo-700">Пропозиція ШІ — перевір і прийми</p>
          {proposal.changes.length > 0 && (
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              {proposal.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          <textarea
            value={proposal.methodology}
            onChange={(e) => setProposal({ ...proposal, methodology: e.target.value })}
            rows={14}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                run(async () => {
                  const r = await post({ action: "apply", ...proposal });
                  setProposal(null);
                  return r;
                })
              }
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              ✓ Прийняти
            </button>
            <button
              type="button"
              onClick={() => setProposal(null)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      {/* Документ методики */}
      {s.methodology && !proposal && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">
              Документ «Моя методика»
              {s.methodologyUpdatedAt && (
                <span className="text-xs text-gray-400 font-normal">
                  {" "}
                  · оновлено {new Date(s.methodologyUpdatedAt).toLocaleDateString("uk-UA")}
                </span>
              )}
            </p>
            {!editing && (
              <button
                type="button"
                onClick={() => {
                  setEditText(s.methodology);
                  setEditing(true);
                }}
                className="text-sm text-indigo-600 hover:underline"
              >
                Редагувати
              </button>
            )}
          </div>
          {editing ? (
            <>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={16}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving || !editText.trim()}
                  onClick={() =>
                    run(async () => {
                      const r = await post({ action: "apply", methodology: editText });
                      setEditing(false);
                      return r;
                    })
                  }
                  className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700 disabled:opacity-50"
                >
                  Зберегти
                </button>
                <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600">
                  Скасувати
                </button>
              </div>
            </>
          ) : (
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap max-h-96 overflow-y-auto">
              {s.methodology}
            </div>
          )}
        </div>
      )}

      {/* Скринька ідей */}
      <div className="border-t border-gray-100 pt-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-gray-700">💡 Скринька ідей</p>
          <p className="text-xs text-gray-500">
            Закидай сюди думки, прийоми, скріншоти. Також можна написати боту «в методику: …», надиктувати голосове або
            надіслати фото. Потім натисни «Оновити методику».
          </p>
        </div>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={2}
          placeholder="Наприклад: з малечею завжди починаю з пісні-привітання"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <MicButton
            onText={(t) => {
              setIdeaVoice(true);
              setIdea((a) => (a.trim() ? `${a} ${t}` : t));
            }}
          />
          <button
            type="button"
            disabled={saving || !idea.trim()}
            onClick={() =>
              run(async () => {
                const r = await post({ action: "addIdea", content: idea, voice: ideaVoice });
                setIdea("");
                setIdeaVoice(false);
                return r;
              })
            }
            className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700 disabled:opacity-40"
          >
            Додати ідею
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Підпис до скріншота (необов'язково)"
            className="flex-1 min-w-[180px] px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              run(async () => {
                const fd = new FormData();
                fd.append("file", file);
                fd.append("caption", caption);
                const res = await fetch("/api/methodology/upload", { method: "POST", body: fd });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Не вдалося завантажити");
                setCaption("");
                if (fileRef.current) fileRef.current.value = "";
                return data;
              });
            }}
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            🖼 Додати скріншот
          </button>
        </div>

        {s.inbox.length > 0 && (
          <div className="space-y-2">
            {s.inbox.map((i) => (
              <div key={i.id} className="flex items-start justify-between gap-3 bg-gray-50 rounded-xl px-3 py-2">
                <div className="flex items-start gap-2 min-w-0">
                  {i.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.imageUrl} alt="" className="w-12 h-12 object-cover rounded-lg shrink-0" />
                  ) : (
                    <span className="text-lg">{i.kind === "VOICE" ? "🎙️" : "✍️"}</span>
                  )}
                  <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{i.content}</p>
                </div>
                <button
                  type="button"
                  onClick={() => run(() => post({ action: "deleteIdea", id: i.id }))}
                  className="text-xs text-gray-400 hover:text-red-600 shrink-0"
                >
                  Видалити
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
