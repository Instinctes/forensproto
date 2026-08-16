import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Listet die lokal in Ollama installierten Modelle (für den Modell-Auswähler).
 * Fällt bei nicht erreichbarem Ollama auf eine sinnvolle Default-Liste zurück.
 */
export async function GET() {
  try {
    const res = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = await res.json();
    const models = (data.models || []).map((m: { name: string; size?: number; details?: { parameter_size?: string } }) => ({
      name: m.name,
      sizeGB: m.size ? +(m.size / 1024 ** 3).toFixed(1) : null,
      paramSize: m.details?.parameter_size || null,
    }));
    return NextResponse.json({ success: true, online: true, models });
  } catch {
    // Ollama offline: trotzdem Standardmodell anbieten
    return NextResponse.json({
      success: true,
      online: false,
      models: [{ name: "llama3", sizeGB: null, paramSize: "8B" }],
    });
  }
}
