import { NextRequest, NextResponse } from "next/server";
import { sendDailyCheckup } from "@/lib/daily-checkup";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendDailyCheckup();
  return NextResponse.json(result);
}