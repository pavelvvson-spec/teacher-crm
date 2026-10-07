"use client";

import { useEffect, useRef, useState } from "react";

type ItemKind = "heart" | "star";
type Item = { id: number; x: number; y: number; speed: number; kind: ItemKind; size: number };
type Pop = { id: number; x: number; y: number; text: string };
type Phase = "ready" | "playing" | "done";

const GAME_SECONDS = 30;
const BEST_KEY = "cheerGameBest";

function finalMessage(score: number): string {
  if (score < 10) return "Розминка зарахована! 😊";
  if (score < 25) return "Чудово! Ти молодець 💪";
  if (score < 40) return "Вау, яка швидкість! ✨";
  return "Неймовірно! Ти найкраща вчителька 👑";
}

// Рожевий банер на головній. Натискання відкриває гру.
export default function CheerBanner() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full bg-pink-600 text-white rounded-2xl shadow-sm p-4 sm:p-6 text-center hover:bg-pink-700 active:scale-[0.98] transition"
      >
        <p className="text-lg sm:text-xl font-semibold">Сашуню, у тебе все вийде! 💪💖</p>
        <p className="text-xs sm:text-sm text-pink-100 mt-1">Натисни, щоб трохи відпочити 🎮</p>
      </button>
      {open && <HeartsGame onClose={() => setOpen(false)} />}
    </>
  );
}

function HeartsGame({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [items, setItems] = useState<Item[]>([]);
  const [pops, setPops] = useState<Pop[]>([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [best, setBest] = useState(0);
  const [newRecord, setNewRecord] = useState(false);

  const nextId = useRef(1);
  const scoreRef = useRef(0);
  const bestRef = useRef(0);
  const caught = useRef<Set<number>>(new Set());

  // Рекорд зберігається на цьому телефоні / комп'ютері
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(BEST_KEY) || 0);
      bestRef.current = saved;
      setBest(saved);
    } catch {
      // сховище недоступне — граємо без рекорду
    }
  }, []);

  // Поки гра відкрита, сторінка під нею не прокручується
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Ігровий цикл: сердечка падають, з'являються нові, йде таймер
  useEffect(() => {
    if (phase !== "playing") return;

    let raf = 0;
    const startTime = performance.now();
    let last = startTime;
    let spawnAcc = 0;

    const loop = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const elapsed = (now - startTime) / 1000;
      const left = GAME_SECONDS - elapsed;

      if (left <= 0) {
        const final = scoreRef.current;
        if (final > bestRef.current) {
          bestRef.current = final;
          setBest(final);
          setNewRecord(true);
          try {
            localStorage.setItem(BEST_KEY, String(final));
          } catch {
            // не вдалося зберегти — не страшно
          }
        }
        setItems([]);
        setTimeLeft(0);
        setPhase("done");
        return;
      }

      setTimeLeft(Math.ceil(left));

      // З часом сердечка з'являються частіше і падають швидше
      spawnAcc += dt;
      const spawnEvery = Math.max(330, 750 - elapsed * 14);
      const born: Item[] = [];
      while (spawnAcc >= spawnEvery) {
        spawnAcc -= spawnEvery;
        const isStar = Math.random() < 0.12;
        const baseSpeed = 16 + Math.random() * 12 + elapsed * 0.9;
        born.push({
          id: nextId.current++,
          x: 8 + Math.random() * 84,
          y: -8,
          speed: isStar ? baseSpeed * 1.3 : baseSpeed,
          kind: isStar ? "star" : "heart",
          size: isStar ? 40 : 44 + Math.random() * 14,
        });
      }

      setItems((prev) => [
        ...prev
          .map((it) => ({ ...it, y: it.y + (it.speed * dt) / 1000 }))
          .filter((it) => it.y < 108),
        ...born,
      ]);

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  function startGame() {
    scoreRef.current = 0;
    caught.current = new Set();
    setScore(0);
    setItems([]);
    setPops([]);
    setTimeLeft(GAME_SECONDS);
    setNewRecord(false);
    setPhase("playing");
  }

  function catchItem(item: Item) {
    if (phase !== "playing") return;
    if (caught.current.has(item.id)) return;
    caught.current.add(item.id);

    setItems((prev) => prev.filter((it) => it.id !== item.id));

    const points = item.kind === "star" ? 3 : 1;
    scoreRef.current += points;
    setScore(scoreRef.current);

    const popId = nextId.current++;
    setPops((prev) => [...prev, { id: popId, x: item.x, y: item.y, text: `+${points}` }]);
    setTimeout(() => setPops((prev) => prev.filter((p) => p.id !== popId)), 700);
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-pink-50 flex flex-col select-none"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <style>{`
        @keyframes cheerPopUp {
          from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          to   { opacity: 0; transform: translate(-50%, -160%) scale(1.3); }
        }
      `}</style>

      {/* Верхня панель: бали, час, закрити */}
      <div className="flex items-center justify-between px-4 py-3 bg-white shadow-sm">
        <p className="font-semibold text-pink-600">💖 {score}</p>
        <p className="font-semibold text-gray-700">
          {phase === "playing" ? `⏱ ${timeLeft} с` : "Лови сердечка"}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium"
        >
          ✕ Закрити
        </button>
      </div>

      {/* Ігрове поле */}
      <div className="relative flex-1 overflow-hidden" style={{ touchAction: "none" }}>
        {phase === "playing" &&
          items.map((it) => (
            <button
              key={it.id}
              type="button"
              onPointerDown={() => catchItem(it)}
              className="absolute leading-none"
              style={{
                left: `${it.x}%`,
                top: `${it.y}%`,
                fontSize: `${it.size}px`,
                transform: "translate(-50%, -50%)",
              }}
            >
              {it.kind === "star" ? "⭐" : "💖"}
            </button>
          ))}

        {pops.map((p) => (
          <span
            key={p.id}
            className="absolute pointer-events-none font-bold text-pink-600 text-2xl"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              animation: "cheerPopUp 0.7s ease-out forwards",
            }}
          >
            {p.text}
          </span>
        ))}

        {phase === "ready" && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl shadow-sm p-6 max-w-sm w-full text-center space-y-4">
              <p className="text-5xl">💖</p>
              <h2 className="text-xl font-semibold text-gray-800">Лови сердечка</h2>
              <p className="text-sm text-gray-600">
                Тисни на сердечка, поки вони падають.
                <br />
                💖 = 1 бал, ⭐ = 3 бали.
                <br />У тебе {GAME_SECONDS} секунд!
              </p>
              {best > 0 && <p className="text-sm text-pink-600">Твій рекорд: {best}</p>}
              <button
                type="button"
                onClick={startGame}
                className="w-full px-5 py-3 bg-pink-600 text-white rounded-xl font-medium hover:bg-pink-700"
              >
                Почати
              </button>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl shadow-sm p-6 max-w-sm w-full text-center space-y-4">
              <p className="text-5xl">{newRecord ? "🎉" : "💖"}</p>
              <h2 className="text-xl font-semibold text-gray-800">{finalMessage(score)}</h2>
              <p className="text-3xl font-bold text-pink-600">{score} балів</p>
              {newRecord ? (
                <p className="text-sm font-medium text-green-600">Новий рекорд!</p>
              ) : (
                <p className="text-sm text-gray-500">Твій рекорд: {best}</p>
              )}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={startGame}
                  className="w-full px-5 py-3 bg-pink-600 text-white rounded-xl font-medium hover:bg-pink-700"
                >
                  Ще раз
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full px-5 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
                >
                  Повернутися до роботи
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}