/**
 * Output-Descriptor-Parser (Phase 2, Wertsteigerung #5)
 * =====================================================
 * Hardware- und Descriptor-Wallets (Coldcard, Ledger, Bitcoin Core,
 * Sparrow, Casa, Unchained) exportieren ihre Konten als Output-Descriptors
 * (BIP-380-Stil), z. B.:
 *   wpkh([d34db33f/84'/0'/0']xpub.../0/*)
 *   sh(wsh(sortedmulti(2,[fp/48'/0'/0'/2']xpub.../0/*,xpub.../0/*,xpub.../0/*)))
 *
 * Dieser Parser zerlegt solche Descriptors strukturell (Skripttyp,
 * Schwellenwert, Schlüssel mit Key-Origin/Ableitungspfad), damit ForensProto
 * HW-/Multisig-Konten erkennen und die Recovery einordnen kann.
 * Bewusst abhängigkeitsfrei; keine xpub-Ableitung (die HD-Ableitung selbst
 * liegt in seed-recovery.ts).
 */

export interface KeyOrigin {
  fingerprint: string; // 8 Hex
  path: string; // z. B. 84'/0'/0'
}
export interface DescriptorKey {
  origin?: KeyOrigin;
  key: string; // xpub.../xprv.../tpub… oder roher Hex-Pubkey
  path?: string; // Ableitung nach dem Schlüssel, z. B. 0/*
  isExtended: boolean;
  isPrivate: boolean;
}
export interface DescriptorNode {
  type: string; // pkh | wpkh | sh | wsh | combo | multi | sortedmulti | tr | addr | raw
  threshold?: number;
  keys: DescriptorKey[];
  children: DescriptorNode[];
}

export interface ParsedDescriptor {
  ok: boolean;
  input: string;
  checksum?: string;
  tree?: DescriptorNode;
  scriptType?: string; // menschenlesbarer Typ
  isMultisig: boolean;
  isSegwit: boolean;
  isTaproot: boolean;
  threshold?: number;
  totalKeys: number;
  hardwareLikely: boolean; // Key-Origin mit gehärtetem Standardpfad
  keys: DescriptorKey[]; // flach (alle Blattschlüssel)
  error?: string;
}

const SCRIPT_FUNCS = new Set(["pkh", "wpkh", "sh", "wsh", "combo", "multi", "sortedmulti", "tr", "addr", "raw"]);

function parseKeyExpression(expr: string): DescriptorKey {
  let rest = expr.trim();
  let origin: KeyOrigin | undefined;
  const originMatch = rest.match(/^\[([0-9a-fA-F]{8})((?:\/[0-9]+['h]?)*)\]/);
  if (originMatch) {
    origin = { fingerprint: originMatch[1].toLowerCase(), path: originMatch[2].replace(/^\//, "") };
    rest = rest.slice(originMatch[0].length);
  }
  // Ableitungspfad nach dem Schlüssel abtrennen
  let key = rest;
  let path: string | undefined;
  const slash = rest.indexOf("/");
  if (slash >= 0) {
    key = rest.slice(0, slash);
    path = rest.slice(slash + 1);
  }
  const lower = key.toLowerCase();
  const isExtended = /(pub|prv)/.test(lower) && /^(x|t|y|z|v|u)(pub|prv)/.test(lower);
  const isPrivate = /prv/.test(lower);
  return { origin, key, path, isExtended, isPrivate };
}

/** Zerlegt die kommagetrennten Argumente auf oberster Klammerebene. */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") { depth++; cur += ch; }
    else if (ch === ")") { depth--; cur += ch; }
    else if (ch === "," && depth === 0) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseNode(expr: string): DescriptorNode {
  const trimmed = expr.trim();
  const open = trimmed.indexOf("(");
  if (open < 0 || !trimmed.endsWith(")")) {
    // Blatt = Schlüssel
    return { type: "key", keys: [parseKeyExpression(trimmed)], children: [] };
  }
  const fn = trimmed.slice(0, open).toLowerCase();
  const inner = trimmed.slice(open + 1, trimmed.length - 1);

  if (fn === "multi" || fn === "sortedmulti") {
    const args = splitArgs(inner);
    const threshold = parseInt(args[0], 10);
    const keys = args.slice(1).map((a) => parseKeyExpression(a));
    return { type: fn, threshold, keys, children: [] };
  }
  if (!SCRIPT_FUNCS.has(fn)) {
    return { type: "key", keys: [parseKeyExpression(trimmed)], children: [] };
  }
  // Wrapper (sh/wsh/tr) oder Single-Key (pkh/wpkh/combo)
  if (fn === "sh" || fn === "wsh" || fn === "tr") {
    return { type: fn, keys: [], children: [parseNode(inner)] };
  }
  // pkh/wpkh/combo/addr/raw → ein Argument (Key oder Daten)
  return { type: fn, keys: [parseKeyExpression(inner)], children: [] };
}

function collectKeys(node: DescriptorNode): DescriptorKey[] {
  return [...node.keys, ...node.children.flatMap(collectKeys)];
}
function findMulti(node: DescriptorNode): DescriptorNode | undefined {
  if (node.type === "multi" || node.type === "sortedmulti") return node;
  for (const c of node.children) {
    const f = findMulti(c);
    if (f) return f;
  }
  return undefined;
}

function isHardenedStandardPath(path: string): boolean {
  // z. B. 84'/0'/0'  oder 48'/0'/0'/2'
  return /^(44|49|84|86|48|45)['h]\//.test(path);
}

function humanScriptType(tree: DescriptorNode, multi?: DescriptorNode): string {
  const top = tree.type;
  const nested = tree.children[0]?.type;
  const ms = multi ? `${multi.type === "sortedmulti" ? "sortedmulti" : "multi"} ${multi.threshold}-of-${multi.keys.length}` : "";
  if (top === "wpkh") return "P2WPKH (SegWit, Single-Sig)";
  if (top === "pkh") return "P2PKH (Legacy, Single-Sig)";
  if (top === "tr") return "P2TR (Taproot)";
  if (top === "sh" && nested === "wsh") return `P2SH-P2WSH ${ms}`.trim();
  if (top === "wsh") return `P2WSH ${ms}`.trim();
  if (top === "sh") return `P2SH ${ms}`.trim();
  if (top === "combo") return "combo (mehrere Skripttypen)";
  return top;
}

/** Parst einen Output-Descriptor in eine strukturierte Form. */
export function parseDescriptor(input: string): ParsedDescriptor {
  const raw = input.trim();
  const base: ParsedDescriptor = { ok: false, input: raw, isMultisig: false, isSegwit: false, isTaproot: false, totalKeys: 0, hardwareLikely: false, keys: [] };
  if (!raw) return { ...base, error: "Leerer Descriptor" };

  let body = raw;
  let checksum: string | undefined;
  const hash = raw.indexOf("#");
  if (hash >= 0) {
    body = raw.slice(0, hash);
    checksum = raw.slice(hash + 1);
  }

  try {
    const tree = parseNode(body);
    const keys = collectKeys(tree);
    const multi = findMulti(tree);
    const isSegwit = /wpkh|wsh|tr/.test(JSON.stringify(tree).toLowerCase()) || tree.type === "wpkh" || tree.type === "wsh" || tree.type === "tr" || tree.children[0]?.type === "wsh";
    const hardwareLikely = keys.some((k) => !!k.origin && isHardenedStandardPath(k.origin.path + "/"));

    return {
      ok: true,
      input: raw,
      checksum,
      tree,
      scriptType: humanScriptType(tree, multi),
      isMultisig: !!multi,
      isSegwit,
      isTaproot: tree.type === "tr",
      threshold: multi?.threshold,
      totalKeys: keys.length,
      hardwareLikely,
      keys,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "Parse-Fehler" };
  }
}
