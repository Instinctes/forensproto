import { NextResponse } from "next/server";
import { renderPrometheus } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

export async function GET() {
  return new NextResponse(renderPrometheus(), {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
