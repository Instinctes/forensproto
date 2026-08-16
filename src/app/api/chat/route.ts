import { NextResponse } from "next/server";
import { getAllJobs } from "@/lib/job-store";
import { getRecoveredPasswords, passwordToMask, learnFromHistory } from "@/lib/pattern-learning";

export const dynamic = "force-dynamic";

interface Message {
  role: string;
  content: string;
}

const OLLAMA = "http://127.0.0.1:11434/api/chat";

/** Verdichtet den aktuellen System-/Fall-Zustand für das Grounding des Modells. */
function buildContextText(locale: "de" | "en"): string {
  try {
    const jobs = getAllJobs();
    const running = jobs.filter((j) => j.status === "running");
    const queued = jobs.filter((j) => j.status === "queued");
    const recoveredJobs = jobs.filter((j) => j.recoveredPassword);
    const last = [...jobs].sort((a, b) => (b.startTime || 0) - (a.startTime || 0))[0];

    const pwds = getRecoveredPasswords();
    const sampleMasks = pwds.slice(0, 5).map((p) => passwordToMask(p));
    let topPatterns: string[] = [];
    try {
      topPatterns = (learnFromHistory().masks || []).slice(0, 5).map((m) => `${m.mask} (${m.count}x)`);
    } catch {
      /* ignore */
    }

    if (locale === "en") {
      return [
        `Active recovery jobs: ${running.length}, queued: ${queued.length}, total: ${jobs.length}.`,
        last ? `Most recent wallet: "${last.walletName}" (type ${last.walletType}, status ${last.status}, ${Math.round(last.progress || 0)}%).` : "No wallet jobs yet.",
        `Recovered passwords so far: ${pwds.length}.`,
        sampleMasks.length ? `Example masks of recovered passwords: ${sampleMasks.join(", ")}.` : "",
        topPatterns.length ? `Most common recovered-password masks: ${topPatterns.join(", ")}.` : "",
      ].filter(Boolean).join("\n");
    }
    return [
      `Aktive Recovery-Jobs: ${running.length}, in Warteschlange: ${queued.length}, gesamt: ${jobs.length}.`,
      last ? `Zuletzt bearbeitete Wallet: „${last.walletName}" (Typ ${last.walletType}, Status ${last.status}, ${Math.round(last.progress || 0)}%).` : "Noch keine Wallet-Jobs.",
      `Bisher wiederhergestellte Passwörter: ${pwds.length}.`,
      sampleMasks.length ? `Beispiel-Masken wiederhergestellter Passwörter: ${sampleMasks.join(", ")}.` : "",
      topPatterns.length ? `Häufigste Masken der wiederhergestellten Passwörter: ${topPatterns.join(", ")}.` : "",
      recoveredJobs.length ? `${recoveredJobs.length} Job(s) bereits geknackt.` : "",
    ].filter(Boolean).join("\n");
  } catch {
    return locale === "en" ? "(system context unavailable)" : "(Systemkontext nicht verfügbar)";
  }
}

function systemPrompt(locale: "de" | "en"): string {
  const ctx = buildContextText(locale);
  if (locale === "en") {
    return [
      "You are 'ForensProto AI', a built-in copilot for a local, lawful crypto-wallet password-recovery and forensics platform.",
      "Help the analyst plan recovery: Hashcat rules and masks, wordlist strategy, password-pattern analysis, next steps.",
      "STYLE: Answer in English. Be concise and concrete. Use Markdown (headings, bullet lists, **bold**, `inline code`, fenced code blocks). Never output LaTeX or math delimiters like $...$ or \\rightarrow — use plain arrows (→) and characters.",
      "ACTIONS: When the user clearly wants a concrete action, you MAY append exactly ONE fenced ```action block with single-line JSON so the UI can execute it. Schemas:",
      '  ```action {"tool":"wordlist","keywords":["max","2019"],"passwords":[]}```  → generates & saves a targeted wordlist',
      '  ```action {"tool":"mask","mask":"?u?l?l?l?d?d?d?d","note":"name+year"}```  → opens recovery with this mask',
      '  ```action {"tool":"prepare_job","method":"mask","mask":"?l?l?l?l?d?d","wordlist":""}```  → pre-fills the recovery wizard',
      "Only include an action block when genuinely useful; otherwise answer normally. Never invent results — actions are proposals the user confirms.",
      "",
      "CURRENT SYSTEM CONTEXT (live, use it to be specific):",
      ctx,
    ].join("\n");
  }
  return [
    "Du bist „ForensProto AI“, ein integrierter Copilot für eine lokale, legale Krypto-Wallet-Passwort-Recovery- und Forensik-Plattform.",
    "Hilf bei der Recovery-Planung: Hashcat-Regeln und -Masken, Wortlisten-Strategie, Passwort-Muster-Analyse, nächste Schritte.",
    "STIL: Antworte auf Deutsch. Sei knapp und konkret. Nutze Markdown (Überschriften, Aufzählungen, **fett**, `Inline-Code`, Codeblöcke). Gib NIEMALS LaTeX oder Mathe-Trenner wie $...$ oder \\rightarrow aus — verwende einfache Pfeile (→) und Zeichen.",
    "AKTIONEN: Wenn die Person klar eine konkrete Aktion will, DARFST du genau EINEN ```action-Block mit einzeiligem JSON anhängen, damit die UI ihn ausführen kann. Schemata:",
    '  ```action {"tool":"wordlist","keywords":["max","2019"],"passwords":[]}```  → erzeugt & speichert eine zielgerichtete Wortliste',
    '  ```action {"tool":"mask","mask":"?u?l?l?l?d?d?d?d","note":"Name+Jahr"}```  → öffnet Recovery mit dieser Maske',
    '  ```action {"tool":"prepare_job","method":"mask","mask":"?l?l?l?l?d?d","wordlist":""}```  → füllt den Recovery-Wizard vor',
    "Hänge einen Action-Block nur an, wenn er wirklich hilft; sonst antworte normal. Erfinde keine Ergebnisse — Aktionen sind Vorschläge, die die Person bestätigt.",
    "",
    "AKTUELLER SYSTEMKONTEXT (live, nutze ihn für konkrete Antworten):",
    ctx,
  ].join("\n");
}

function offlineMsg(locale: "de" | "en"): string {
  return locale === "en"
    ? "Connection to Ollama failed. Make sure Ollama runs locally (port 11434): start it with `ollama serve` and pull a model with `ollama pull llama3`."
    : "Verbindung zu Ollama fehlgeschlagen. Stelle sicher, dass Ollama lokal läuft (Port 11434): mit `ollama serve` starten und ein Modell per `ollama pull llama3` laden.";
}

export async function POST(req: Request) {
  let body: { messages?: Message[]; model?: string; locale?: string; stream?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { messages, model = "llama3", locale: rawLocale, stream } = body;
  const locale: "de" | "en" = rawLocale === "en" ? "en" : "de";

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Invalid messages array" }, { status: 400 });
  }

  const conversation = [
    { role: "system", content: systemPrompt(locale) },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // -------- Streaming --------
  if (stream) {
    try {
      const upstream = await fetch(OLLAMA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: conversation, stream: true }),
        signal: req.signal,
      });
      if (!upstream.ok || !upstream.body) throw new Error(`Ollama ${upstream.status}`);

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buf = "";

      const out = new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              return;
            }
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() || "";
            for (const line of lines) {
              const t = line.trim();
              if (!t) continue;
              try {
                const obj = JSON.parse(t);
                const tok = obj.message?.content;
                if (tok) controller.enqueue(encoder.encode(tok));
              } catch {
                /* unvollständige Zeile ignorieren */
              }
            }
          } catch {
            controller.close();
          }
        },
        cancel() {
          reader.cancel().catch(() => {});
        },
      });

      return new Response(out, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
      });
    } catch (e) {
      const refused = (e as { cause?: { code?: string } })?.cause?.code === "ECONNREFUSED";
      return NextResponse.json({ error: refused || String(e).includes("fetch failed") ? offlineMsg(locale) : String(e) }, { status: 503 });
    }
  }

  // -------- Non-streaming --------
  try {
    const response = await fetch(OLLAMA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: conversation, stream: false }),
    });
    if (!response.ok) throw new Error(`Ollama API responded with status: ${response.status}`);
    const data = await response.json();
    const content = data.message?.content || data.content || (locale === "en" ? "No response from Ollama" : "Keine Antwort von Ollama");
    return NextResponse.json({ role: "assistant", content, message: content });
  } catch (error: unknown) {
    console.error("Ollama API Error:", error);
    const refused = (error as { cause?: { code?: string } })?.cause?.code === "ECONNREFUSED";
    if (refused || (error instanceof Error && error.message.includes("fetch failed"))) {
      return NextResponse.json({ error: offlineMsg(locale) }, { status: 503 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal Server Error" }, { status: 500 });
  }
}
