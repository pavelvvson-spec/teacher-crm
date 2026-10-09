import { NextResponse } from "next/server";
import { computeMoneyCheck } from "@/lib/money-check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(await computeMoneyCheck());
}
