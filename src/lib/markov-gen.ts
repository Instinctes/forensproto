/**
 * Markov-/OMEN-Kandidatengenerator
 * ================================
 * Trainiert ein n-Gramm-Zeichenmodell auf einem Passwort-Korpus und
 * erzeugt Kandidaten in (näherungsweise) absteigender Wahrscheinlichkeit
 * per Best-First-Enumeration. Forschung zeigt deutliche Trefferzuwächse
 * ggü. reinem Brute-Force. Vollständig lokal, deterministisch, testbar.
 */

const START = ""; // Sentinel für Wortanfang
const END = ""; // Sentinel für Wortende

export interface MarkovModel {
  order: number;
  trans: Record<string, Array<{ ch: string; logp: number }>>;
}

/** Trainiert ein Markov-Modell der Ordnung `order` auf dem Korpus. */
export function trainMarkov(corpus: string[], order = 2): MarkovModel {
  const counts: Record<string, Record<string, number>> = {};
  const bump = (ctx: string, ch: string) => {
    (counts[ctx] ||= {})[ch] = ((counts[ctx] || {})[ch] || 0) + 1;
  };

  for (const raw of corpus) {
    const w = raw.trim();
    if (!w) continue;
    const padded = START.repeat(order) + w + END;
    for (let i = order; i < padded.length; i++) {
      bump(padded.slice(i - order, i), padded[i]);
    }
  }

  const trans: MarkovModel["trans"] = {};
  for (const [ctx, chCounts] of Object.entries(counts)) {
    const total = Object.values(chCounts).reduce((a, b) => a + b, 0);
    trans[ctx] = Object.entries(chCounts)
      .map(([ch, c]) => ({ ch, logp: Math.log(c / total) }))
      .sort((a, b) => b.logp - a.logp);
  }
  return { order, trans };
}

// --- Minimaler Max-Heap (nach logp) ---
interface Node {
  prefix: string;
  ctx: string;
  logp: number;
}
class MaxHeap {
  private h: Node[] = [];
  get size() {
    return this.h.length;
  }
  push(n: Node) {
    this.h.push(n);
    let i = this.h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.h[p].logp >= this.h[i].logp) break;
      [this.h[p], this.h[i]] = [this.h[i], this.h[p]];
      i = p;
    }
  }
  pop(): Node | undefined {
    const top = this.h[0];
    const last = this.h.pop();
    if (this.h.length && last) {
      this.h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = 2 * i + 2;
        let m = i;
        if (l < this.h.length && this.h[l].logp > this.h[m].logp) m = l;
        if (r < this.h.length && this.h[r].logp > this.h[m].logp) m = r;
        if (m === i) break;
        [this.h[m], this.h[i]] = [this.h[i], this.h[m]];
        i = m;
      }
    }
    return top;
  }
}

export interface MarkovOptions {
  count?: number;
  minLen?: number;
  maxLen?: number;
  maxExpansions?: number;
}

/** Erzeugt Kandidaten geordnet nach Wahrscheinlichkeit (Best-First). */
export function generateMarkovCandidates(model: MarkovModel, opts: MarkovOptions = {}): string[] {
  const count = opts.count && opts.count > 0 ? opts.count : 500;
  const minLen = opts.minLen ?? 4;
  const maxLen = opts.maxLen ?? 16;
  const budget = opts.maxExpansions ?? 200_000;

  const heap = new MaxHeap();
  heap.push({ prefix: "", ctx: START.repeat(model.order), logp: 0 });

  const out: string[] = [];
  const seen = new Set<string>();
  let expansions = 0;

  while (heap.size > 0 && out.length < count && expansions < budget) {
    const node = heap.pop()!;
    expansions++;
    const trans = model.trans[node.ctx];
    if (!trans) continue;
    for (const { ch, logp } of trans) {
      if (ch === END) {
        if (node.prefix.length >= minLen && !seen.has(node.prefix)) {
          seen.add(node.prefix);
          out.push(node.prefix);
          if (out.length >= count) break;
        }
        continue;
      }
      if (node.prefix.length >= maxLen) continue;
      const nextCtx = (node.ctx + ch).slice(-model.order);
      heap.push({ prefix: node.prefix + ch, ctx: nextCtx, logp: node.logp + logp });
    }
  }
  return out;
}
