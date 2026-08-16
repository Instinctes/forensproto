"use client";

import { cloneElement, isValidElement, useRef, type ReactElement, type CSSProperties } from "react";
import { GripVertical } from "lucide-react";

/** Layout einer Karte in RASTER-Einheiten (nicht Pixel). */
export interface GridLayout {
  col: number;
  row: number;
  w: number;
  h: number;
}

export const MIN_W = 2;
export const MIN_H = 3;

/** Überlappen sich zwei Raster-Rechtecke? */
function collides(a: GridLayout, b: GridLayout): boolean {
  return a.col < b.col + b.w && a.col + a.w > b.col && a.row < b.row + b.h && a.row + a.h > b.row;
}

/**
 * Kompaktiert ein Karten-Layout: klemmt jede Karte in die verfügbaren Spalten,
 * zieht alle Karten „nach oben" (Schwerkraft) und löst Überlappungen auf.
 * Optionaler `anchorId`: diese Karte bleibt an ihrer Position (die gerade
 * gezogene), alle anderen weichen aus. Ergebnis ist IMMER überlappungsfrei.
 */
export function compactLayouts(
  layouts: Record<string, GridLayout>,
  ids: string[],
  cols: number,
  anchorId: string | null = null
): Record<string, GridLayout> {
  const items = ids.map((id) => {
    const l = layouts[id];
    const w = Math.max(1, Math.min(l.w, cols));
    const col = Math.max(0, Math.min(l.col, cols - w));
    return { id, col, row: Math.max(0, l.row), w, h: l.h };
  });

  const order = [...items].sort((a, b) => {
    if (anchorId) {
      if (a.id === anchorId) return -1;
      if (b.id === anchorId) return 1;
    }
    return a.row - b.row || a.col - b.col;
  });

  const placed: Array<GridLayout & { id: string }> = [];
  for (const it of order) {
    if (it.id === anchorId) {
      placed.push({ ...it });
      continue;
    }
    const cand = { ...it, row: 0 };
    while (placed.some((p) => collides(cand, p))) cand.row++;
    placed.push(cand);
  }

  const out: Record<string, GridLayout> = {};
  for (const p of placed) out[p.id] = { col: p.col, row: p.row, w: p.w, h: p.h };
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Raster-basierte, einrastende Karten-Hülle.
 * Im Edit-Modus: Griff (oben rechts) verschiebt, Ecke (unten rechts) skaliert —
 * beides in Rastereinheiten (Snap). Überlappungen löst der Board-Container über
 * compactLayouts() auf; diese Komponente meldet nur die neue Roh-Position.
 */
export function EditablePanel({
  id,
  layout,
  colW,
  rowH,
  gap,
  cols,
  editMode,
  dragging,
  onChange,
  onDragState,
  children,
}: {
  id: string;
  layout: GridLayout;
  colW: number;
  rowH: number;
  gap: number;
  cols: number;
  editMode: boolean;
  dragging: boolean;
  onChange: (id: string, next: GridLayout) => void;
  onDragState: (id: string | null) => void;
  children: React.ReactNode;
}) {
  const startRef = useRef<{ px: number; py: number; base: GridLayout } | null>(null);

  const beginDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startRef.current = { px: e.clientX, py: e.clientY, base: { ...layout } };
    onDragState(id);
    const move = (ev: PointerEvent) => {
      const s = startRef.current;
      if (!s) return;
      const dcol = Math.round((ev.clientX - s.px) / colW);
      const drow = Math.round((ev.clientY - s.py) / rowH);
      onChange(id, {
        ...s.base,
        col: clamp(s.base.col + dcol, 0, cols - s.base.w),
        row: Math.max(0, s.base.row + drow),
      });
    };
    const up = () => {
      startRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onDragState(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const beginResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startRef.current = { px: e.clientX, py: e.clientY, base: { ...layout } };
    onDragState(id);
    const move = (ev: PointerEvent) => {
      const s = startRef.current;
      if (!s) return;
      const dw = Math.round((ev.clientX - s.px) / colW);
      const dh = Math.round((ev.clientY - s.py) / rowH);
      onChange(id, {
        ...s.base,
        w: clamp(s.base.w + dw, MIN_W, cols - s.base.col),
        h: Math.max(MIN_H, s.base.h + dh),
      });
    };
    const up = () => {
      startRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onDragState(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const filled = isValidElement(children)
    ? cloneElement(children as ReactElement<{ style?: CSSProperties }>, {
        style: {
          ...((children as ReactElement<{ style?: CSSProperties }>).props.style || {}),
          height: "100%",
          margin: 0,
          overflow: "auto",
          boxSizing: "border-box" as const,
        },
      })
    : children;

  return (
    <div
      style={{
        position: "absolute",
        left: layout.col * colW + gap / 2,
        top: layout.row * rowH + gap / 2,
        width: layout.w * colW - gap,
        height: layout.h * rowH - gap,
        transition: dragging ? "none" : "left 130ms ease, top 130ms ease, width 130ms ease, height 130ms ease",
        outline: editMode ? "1px dashed var(--primary-400)" : undefined,
        outlineOffset: 2,
        borderRadius: "var(--radius-lg)",
        zIndex: dragging ? 10 : 1,
      }}
    >
      {filled}

      {editMode && (
        <>
          <div
            onPointerDown={beginDrag}
            title="Verschieben"
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 26,
              height: 26,
              borderRadius: 6,
              background: "var(--primary-500)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "move",
              boxShadow: "var(--shadow-md)",
              zIndex: 5,
              touchAction: "none",
            }}
          >
            <GripVertical size={15} />
          </div>
          <div
            onPointerDown={beginResize}
            title="Größe ändern"
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              width: 18,
              height: 18,
              cursor: "nwse-resize",
              background:
                "linear-gradient(135deg, transparent 0 45%, var(--primary-500) 45% 55%, transparent 55% 70%, var(--primary-500) 70% 80%, transparent 80%)",
              borderBottomRightRadius: "var(--radius-lg)",
              zIndex: 5,
              touchAction: "none",
            }}
          />
        </>
      )}
    </div>
  );
}
