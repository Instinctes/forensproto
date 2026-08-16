"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/context/I18nContext";
import { PHRASES, PATTERNS } from "@/lib/i18n-phrases";

/**
 * Laufzeit-Übersetzungsschicht (DE → EN) für app-weite Vollabdeckung.
 * ==================================================================
 * Ergänzt das schlüsselbasierte i18n: ersetzt bei aktiver englischer Sprache
 * exakt passende (whitespace-normalisierte) Textknoten sowie
 * placeholder/title/aria-label-Attribute anhand von `PHRASES`. Beim Wechsel
 * zurück auf Deutsch werden die Originale wiederhergestellt. Quelle der
 * App-Texte ist Deutsch; daher keine Übersetzung im DE-Modus nötig.
 *
 * Sicher: nur exakte Voll-Treffer werden ersetzt (keine Teil-/
 * Fehlübersetzungen). Inputs/Textareas bleiben unberührt.
 */

const ATTRS = ["placeholder", "title", "aria-label"];
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Exakter Phrasen-Treffer ODER Muster-Treffer; sonst null. */
function lookup(key: string): string | null {
  const exact = PHRASES[key];
  if (exact !== undefined) return exact;
  for (const [re, rep] of PATTERNS) {
    if (re.test(key)) return key.replace(re, rep);
  }
  return null;
}

export default function AutoTranslate() {
  const { locale } = useI18n();
  const textOrig = useRef(new Map<Text, string>());
  const attrOrig = useRef(new Map<Element, Record<string, string>>());

  useEffect(() => {
    const translate = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const tn = node as Text;
        const p = tn.parentElement;
        if (!p) continue;
        const tag = p.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA") continue;
        const raw = tn.nodeValue || "";
        const key = norm(raw);
        if (!key) continue;
        const tr = lookup(key);
        if (tr && tr !== raw) {
          if (!textOrig.current.has(tn)) textOrig.current.set(tn, raw);
          tn.nodeValue = tr;
        }
      }
      for (const attr of ATTRS) {
        document.body.querySelectorAll(`[${attr}]`).forEach((el) => {
          const val = el.getAttribute(attr) || "";
          const tr = lookup(norm(val));
          if (tr && tr !== val) {
            const store = attrOrig.current.get(el) || {};
            if (!(attr in store)) {
              store[attr] = val;
              attrOrig.current.set(el, store);
            }
            el.setAttribute(attr, tr);
          }
        });
      }
    };

    const restore = () => {
      textOrig.current.forEach((v, n) => {
        if (n.isConnected) n.nodeValue = v;
      });
      attrOrig.current.forEach((attrs, el) => {
        if (el.isConnected) for (const [a, v] of Object.entries(attrs)) el.setAttribute(a, v);
      });
      textOrig.current.clear();
      attrOrig.current.clear();
    };

    if (locale !== "en") {
      restore();
      return;
    }

    let scheduled = false;
    const obs = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        obs.disconnect();
        translate();
        obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
      });
    });

    translate();
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    return () => obs.disconnect();
  }, [locale]);

  return null;
}
