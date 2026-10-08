"use client";

import { useEffect, useRef } from "react";

// Банер «На сьогодні все»: натискання будь-де на ньому запускає салют конфеті з цієї точки
const COLORS = ["#ec4899", "#f472b6", "#a855f7", "#facc15", "#22c55e", "#38bdf8", "#ffffff", "#fb923c"];

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  life: number;
  round: boolean;
};

export default function ConfettiCelebration({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pieces = useRef<Piece[]>([]);
  const frame = useRef<number | null>(null);

  function loop() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== window.innerWidth * dpr || canvas.height !== window.innerHeight * dpr) {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    pieces.current = pieces.current.filter((p) => p.life > 0 && p.y < window.innerHeight + 40);
    for (const p of pieces.current) {
      p.vy += 0.28; // гравітація
      p.vx *= 0.985; // опір повітря
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 1;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life / 40);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // «мерехтіння» стрічки — сплющуємо по одній осі
        ctx.scale(1, Math.cos(p.rot * 2));
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }

    if (pieces.current.length > 0) {
      frame.current = requestAnimationFrame(loop);
    } else {
      frame.current = null;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  function burst(x: number, y: number, count = 90) {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      count = Math.round(count / 3);
    }
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 9;
      pieces.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 6, // трохи вгору
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        w: 6 + Math.random() * 6,
        h: 3 + Math.random() * 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 120 + Math.random() * 60,
        round: Math.random() < 0.25,
      });
    }
    if (frame.current === null) frame.current = requestAnimationFrame(loop);
  }

  // Невеликий салют, коли банер з'являється
  useEffect(() => {
    const t = setTimeout(() => burst(window.innerWidth / 2, window.innerHeight / 3, 70), 300);
    return () => {
      clearTimeout(t);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        className={`${className ?? ""} cursor-pointer select-none`}
        onPointerDown={(e) => burst(e.clientX, e.clientY)}
        role="button"
        aria-label="Свято! Натисніть для конфеті"
      >
        {children}
      </div>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-screen h-screen pointer-events-none z-[60]"
        aria-hidden="true"
      />
    </>
  );
}
