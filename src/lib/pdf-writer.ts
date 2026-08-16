/**
 * Minimaler, abhängigkeitsfreier PDF-Writer (reines TypeScript)
 * ============================================================
 * Erzeugt valide PDF-1.4-Dokumente (mehrseitig, Text + einfache Tabellen)
 * ohne externe Libraries. Verwendet die Standard-14-Fonts (Helvetica,
 * Helvetica-Bold, Courier) mit WinAnsiEncoding, damit deutsche Umlaute
 * (ä ö ü ß) korrekt dargestellt werden.
 *
 * Bewusst schlank gehalten: Ziel ist ein gerichtsfest lesbarer
 * Forensik-Bericht, kein vollständiges Layout-System.
 */

export type LineType = "title" | "h2" | "text" | "mono" | "small" | "sep" | "spacer";
export interface PdfLine {
  type: LineType;
  text?: string;
}

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN_X = 50;
const TOP_Y = 800;
const BOTTOM_Y = 50;

const STYLE: Record<LineType, { font: "F1" | "F2" | "F3"; size: number; lh: number; wrap: number }> = {
  title: { font: "F2", size: 18, lh: 26, wrap: 60 },
  h2: { font: "F2", size: 12, lh: 20, wrap: 88 },
  text: { font: "F1", size: 10, lh: 14, wrap: 100 },
  small: { font: "F1", size: 8, lh: 11, wrap: 125 },
  mono: { font: "F3", size: 8, lh: 11, wrap: 110 },
  sep: { font: "F1", size: 10, lh: 10, wrap: 999 },
  spacer: { font: "F1", size: 10, lh: 8, wrap: 999 },
};

/** Escaped Text für PDF-String-Literale. */
function escapePdf(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/\r/g, "");
}

/** Bricht eine Zeile anhand der maximalen Zeichenzahl um (wortweise). */
function wrapText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const words = text.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + (cur ? " " : "") + w).length > max) {
      if (cur) out.push(cur);
      // sehr lange Einzel-Tokens hart umbrechen (z.B. Hashes)
      if (w.length > max) {
        for (let i = 0; i < w.length; i += max) out.push(w.slice(i, i + max));
        cur = "";
      } else {
        cur = w;
      }
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

interface RenderLine {
  type: LineType;
  text: string;
}

/** Verteilt die logischen Zeilen (inkl. Umbruch) auf Seiten. */
function paginate(lines: PdfLine[]): RenderLine[][] {
  const flat: RenderLine[] = [];
  for (const l of lines) {
    const st = STYLE[l.type];
    if (l.type === "sep" || l.type === "spacer") {
      flat.push({ type: l.type, text: "" });
      continue;
    }
    const parts = wrapText(l.text ?? "", st.wrap);
    for (const p of parts) flat.push({ type: l.type, text: p });
  }

  const pages: RenderLine[][] = [];
  let cur: RenderLine[] = [];
  let y = TOP_Y;
  for (const rl of flat) {
    const lh = STYLE[rl.type].lh;
    if (y - lh < BOTTOM_Y) {
      pages.push(cur);
      cur = [];
      y = TOP_Y;
    }
    cur.push(rl);
    y -= lh;
  }
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[]];
}

/** Baut den Content-Stream einer Seite. */
function buildContentStream(page: RenderLine[]): string {
  let y = TOP_Y;
  let out = "BT\n";
  for (const rl of page) {
    const st = STYLE[rl.type];
    if (rl.type === "sep") {
      // horizontale Linie über Grafikoperatoren (außerhalb BT/ET)
      out += "ET\n";
      out += `0.6 0.6 0.6 RG 0.5 w ${MARGIN_X} ${y} m ${PAGE_W - MARGIN_X} ${y} l S\n`;
      out += "BT\n";
      y -= st.lh;
      continue;
    }
    if (rl.type === "spacer") {
      y -= st.lh;
      continue;
    }
    out += `/${st.font} ${st.size} Tf\n`;
    out += `1 0 0 1 ${MARGIN_X} ${y} Tm\n`;
    out += `(${escapePdf(rl.text)}) Tj\n`;
    y -= st.lh;
  }
  out += "ET\n";
  return out;
}

/** Erzeugt ein vollständiges PDF als Buffer (latin1/WinAnsi-kodiert). */
export function createPdf(lines: PdfLine[]): Buffer {
  const pages = paginate(lines);

  // Objekt-Layout:
  // 1 Catalog, 2 Pages, 3 F1, 4 F2, 5 F3, dann je Seite: Page + Content
  const fontObjs = {
    F1: 3,
    F2: 4,
    F3: 5,
  };
  const firstPageObj = 6;
  const objects: string[] = [];

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;

  const kids: string[] = [];
  for (let i = 0; i < pages.length; i++) kids.push(`${firstPageObj + i * 2} 0 R`);
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;

  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
  objects[5] = `<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>`;

  pages.forEach((page, i) => {
    const pageObjNum = firstPageObj + i * 2;
    const contentObjNum = pageObjNum + 1;
    const resources = `<< /Font << /F1 ${fontObjs.F1} 0 R /F2 ${fontObjs.F2} 0 R /F3 ${fontObjs.F3} 0 R >> >>`;
    objects[pageObjNum] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources ${resources} /Contents ${contentObjNum} 0 R >>`;
    const stream = buildContentStream(page);
    const streamBytes = Buffer.byteLength(stream, "latin1");
    objects[contentObjNum] = `<< /Length ${streamBytes} >>\nstream\n${stream}endstream`;
  });

  // Serialisieren mit exakten Byte-Offsets für die xref-Tabelle
  const totalObjs = firstPageObj + pages.length * 2 - 1;
  let pdf = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1");
  const offsets: number[] = new Array(totalObjs + 1).fill(0);

  for (let n = 1; n <= totalObjs; n++) {
    const body = objects[n];
    if (body === undefined) continue;
    offsets[n] = pdf.length;
    pdf = Buffer.concat([pdf, Buffer.from(`${n} 0 obj\n${body}\nendobj\n`, "latin1")]);
  }

  const xrefOffset = pdf.length;
  let xref = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= totalObjs; n++) {
    xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  pdf = Buffer.concat([pdf, Buffer.from(xref + trailer, "latin1")]);

  return pdf;
}
