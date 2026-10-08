import { NextRequest, NextResponse } from "next/server";
import {
  getMethodologyState,
  answerQuestion,
  addInbox,
  compileProposal,
  applyMethodology,
} from "@/lib/methodology";
import { prisma } from "@/lib/prisma";

// Оновлення методики через ШІ може тривати до хвилини
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(await getMethodologyState());
}

// Дії з «Моєю методикою» (лише після входу в CRM — шлях не публічний)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const action = body?.action;

  if (action === "answer") {
    if (!body.id) return NextResponse.json({ error: "Не вказано питання" }, { status: 400 });
    await answerQuestion(String(body.id), body.skip ? null : String(body.answer ?? ""));
    return NextResponse.json(await getMethodologyState());
  }

  if (action === "addIdea") {
    const content = String(body.content ?? "").trim();
    if (!content) return NextResponse.json({ error: "Порожня ідея" }, { status: 400 });
    await addInbox(body.voice ? "VOICE" : "TEXT", content);
    return NextResponse.json(await getMethodologyState());
  }

  if (action === "deleteIdea") {
    await prisma.methodologyInbox.deleteMany({ where: { id: String(body.id ?? ""), usedAt: null } });
    return NextResponse.json(await getMethodologyState());
  }

  if (action === "compile") {
    const r = await compileProposal();
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  }

  if (action === "apply") {
    const text = String(body.methodology ?? "").trim();
    if (!text) return NextResponse.json({ error: "Методика порожня" }, { status: 400 });
    await applyMethodology(
      text,
      Array.isArray(body.questionIds) ? body.questionIds.map(String) : [],
      Array.isArray(body.inboxIds) ? body.inboxIds.map(String) : []
    );
    return NextResponse.json(await getMethodologyState());
  }

  return NextResponse.json({ error: "Невідома дія" }, { status: 400 });
}
