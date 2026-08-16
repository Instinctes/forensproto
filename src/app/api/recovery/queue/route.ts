import { NextResponse } from "next/server";
import { getQueueSnapshot } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ success: true, ...getQueueSnapshot() });
  } catch {
    return NextResponse.json({ success: false, error: "Queue-Status nicht verfügbar" }, { status: 500 });
  }
}
