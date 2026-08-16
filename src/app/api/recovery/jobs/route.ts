/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from "next/server";
import { getAllJobs } from "@/lib/job-store";

// Vercel / Next.js Edge function konfiguration
export const dynamic = "force-dynamic";

export async function GET() {
  try {
     const jobs = getAllJobs();
     return NextResponse.json({ success: true, jobs });
  } catch (error) {
     return NextResponse.json({ error: "Fehler beim Abrufen der Jobs" }, { status: 500 });
  }
}
