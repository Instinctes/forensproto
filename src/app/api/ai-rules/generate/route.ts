/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { passwords, keywords, model = "llama3" } = await req.json();

    if (!passwords || !Array.isArray(passwords)) {
      return NextResponse.json({ error: "Invalid passwords array" }, { status: 400 });
    }

    const systemPrompt = `You are a strict, command-line Hashcat Rule Engine. 
DO NOT OUTPUT ANY CONVERSATIONAL TEXT. DO NOT EXPLAIN YOURSELF. DO NOT USE MARKDOWN.
ONLY output raw Hashcat rule syntax, one rule per line.

Given the user's historical passwords and personal keywords, generate exactly 50 highly targeted hashcat rules.
Rules should apply smart mutations using the keywords provided (e.g., append/prepend dates, toggle case, leetspeak).
Hashcat rule syntax examples:
c (capitalize)
u (uppercase)
$1 (append '1')
^1 (prepend '1')
$2$0$2$4 (append '2024')
sa@ (replace 'a' with '@')
`;

    const userInput = `My old passwords: ${passwords.join(", ")}\nMy personal keywords: ${keywords.join(", ")}\nGenerate 50 rules pure syntax.`;

    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model,
        prompt: `${systemPrompt}\n\nUser: ${userInput}\n\nRules:\n`,
        stream: false,
        options: {
          temperature: 0.6
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API responded with status: ${response.status}`);
    }

    const data = await response.json();
    const rawRules = (data.response || "").trim();
    // Split in einzelne Zeilen, leere Zeilen und Kommentare filtern
    const rulesArray = rawRules
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0 && !line.startsWith("#") && !line.startsWith("//"));

    return NextResponse.json({
      rules: rulesArray
    });

  } catch (error: unknown) {
    console.error("Ollama API Error:", error);
    
    const anyError = error as any;
    if (anyError.cause?.code === 'ECONNREFUSED' || (error instanceof Error ? error.message : "").includes('fetch failed')) {
      return NextResponse.json(
        { error: "Verbindung zu Ollama fehlgeschlagen. Stelle sicher, dass Ollama lokal läuft (Port 11434)." },
        { status: 503 }
      );
    }
    
    return NextResponse.json({ error: (error instanceof Error ? error.message : "Internal Server Error") }, { status: 500 });
  }
}
