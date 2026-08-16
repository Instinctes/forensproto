"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

/**
 * Schlanker, abhängigkeitsfreier Markdown-Renderer für Chat-Antworten.
 * Unterstützt: Überschriften, Listen (geordnet/ungeordnet), **fett**, *kursiv*,
 * `inline-code`, Codeblöcke (```), [Links](url) und Absätze. Bereinigt zudem
 * LaTeX-Reste (z. B. $\rightarrow$), die lokale Modelle gern ausgeben.
 */

function cleanLatex(s: string): string {
  return s
    .replace(/\$\s*\\(rightarrow|to|Rightarrow)\s*\$/g, " → ")
    .replace(/\\(rightarrow|to|Rightarrow)\b/g, "→")
    .replace(/\$\s*\\(leftarrow|gets|Leftarrow)\s*\$/g, " ← ")
    .replace(/\\(leftarrow|gets|Leftarrow)\b/g, "←")
    .replace(/\\(times)\b/g, "×")
    .replace(/\\(cdot)\b/g, "·")
    .replace(/\\(leq)\b/g, "≤")
    .replace(/\\(geq)\b/g, "≥")
    // verbleibende einfache Inline-Math-$…$ entwrappen
    .replace(/\$([^$\n]{1,80})\$/g, "$1");
}

/** Inline-Formatierung: code, bold, italic, links. */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Tokenizer für `code`, **bold**, *italic*/_italic_, [text](url)
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("`")) {
      nodes.push(
        <code key={key} style={{ background: "var(--bg-secondary)", padding: "1px 5px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.85em" }}>
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("**")) {
      nodes.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*") || tok.startsWith("_")) {
      nodes.push(<em key={key}>{tok.slice(1, -1)}</em>);
    } else {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (lm) {
        nodes.push(
          <a key={key} href={lm[2]} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary-400)", textDecoration: "underline" }}>
            {lm[1]}
          </a>
        );
      } else {
        nodes.push(tok);
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div style={{ position: "relative", margin: "8px 0" }}>
      <button
        onClick={copy}
        title="Kopieren"
        style={{ position: "absolute", top: 6, right: 6, background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: "3px 6px", cursor: "pointer", color: "var(--text-tertiary)", display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.7rem" }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}{lang || ""}
      </button>
      <pre style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "12px 14px", overflowX: "auto", margin: 0 }}>
        <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem", lineHeight: 1.5, color: "var(--text-primary)", whiteSpace: "pre" }}>{code}</code>
      </pre>
    </div>
  );
}

export default function ChatMarkdown({ content }: { content: string }) {
  const text = cleanLatex(content || "");
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={`p-${key++}`} style={{ margin: "6px 0", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{renderInline(para.join(" "), `p${key}`)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, idx) => <li key={idx} style={{ margin: "2px 0", lineHeight: 1.5 }}>{renderInline(it, `li${key}-${idx}`)}</li>);
      blocks.push(list.ordered ? <ol key={`ol-${key++}`} style={{ margin: "6px 0", paddingLeft: 22 }}>{items}</ol> : <ul key={`ul-${key++}`} style={{ margin: "6px 0", paddingLeft: 22 }}>{items}</ul>);
      list = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    // Codeblock
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flushPara(); flushList();
      const lang = fence[1];
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // closing fence
      blocks.push(<CodeBlock key={`cb-${key++}`} code={buf.join("\n")} lang={lang} />);
      continue;
    }
    // Überschrift
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      const lvl = h[1].length;
      const size = lvl <= 1 ? "1.15rem" : lvl === 2 ? "1.05rem" : "0.95rem";
      blocks.push(<div key={`h-${key++}`} style={{ fontWeight: 700, fontSize: size, margin: "10px 0 4px", color: "var(--text-primary)" }}>{renderInline(h[2], `h${key}`)}</div>);
      i++; continue;
    }
    // Liste
    const li = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
    if (li) {
      flushPara();
      const ordered = /\d+\./.test(li[1]);
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push(li[2]);
      i++; continue;
    }
    // Leerzeile
    if (line.trim() === "") { flushPara(); flushList(); i++; continue; }
    // Absatztext
    flushList();
    para.push(line.trim());
    i++;
  }
  flushPara(); flushList();

  return <div style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{blocks}</div>;
}
