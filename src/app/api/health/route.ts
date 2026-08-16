import { NextResponse } from "next/server";
import { healthCheck } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

export async function GET() {
  const h = healthCheck();
  return NextResponse.json(h, { status: h.status === "ok" ? 200 : 503 });
}
