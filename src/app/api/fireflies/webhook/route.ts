import { NextRequest, NextResponse, after } from "next/server";
import { verifyFirefliesSignature, processFirefliesMeeting } from "@/lib/fireflies";

export const maxDuration = 60;

// Fireflies викликає цю адресу, коли запис уроку оброблено.
// Приймаємо лише запити з правильним підписом (FIREFLIES_WEBHOOK_SECRET).
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyFirefliesSignature(raw, request.headers.get("x-hub-signature"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: { event?: string; eventType?: string; meeting_id?: string; meetingId?: string } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const event = body.event ?? body.eventType ?? "";
  const meetingId = body.meeting_id ?? body.meetingId;
  const isDone = event === "meeting.transcribed" || event === "meeting.summarized" || /transcription/i.test(event);

  if (meetingId && isDone) {
    // Відповідаємо Fireflies одразу, а обробку робимо у фоні
    after(async () => {
      try {
        await processFirefliesMeeting(meetingId, true);
      } catch (e) {
        console.error("Fireflies processing error", e);
      }
    });
  }

  return NextResponse.json({ ok: true });
}
