import { NextRequest, NextResponse } from "next/server";
import { loadOnchainApiKeys } from "@/lib/api-keys-store";

// Known exchange addresses (sample subset for labeling)
const KNOWN_LABELS: Record<string, string> = {
  "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa": "Satoshi (Genesis Block)",
  "3Kzh9qAqVWQhEsfQz7zEQL1EuSx5tyNLNS": "Binance Hot Wallet",
  "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h": "Binance Cold Wallet",
  "1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s": "Binance",
  "3JZq4atUahhuA9rLhXLMhhTo133J9rF97j": "Bitfinex",
  "3D2oetdNuZUqQHPJmcMDDHYoqkyNVsFk9r": "Bittrex",
  "1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF": "Mt.Gox Cold",
  "35hK24tcLEWcgNA4JxpvbkNkoAcDGqQPsP": "Coinbase",
  "3FHNBLobJnbCTFTVakh5TXmEneyf5PT61B": "Coinbase Pro",
  "3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb": "OKX",
  "1KAt6STtisWMMVo5XGdos9P7DBNNsFfjx7": "Kraken",
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": "Binance (ETH)",
  "0x28c6c06298d514db089934071355e5743bf21d60": "Binance 14 (ETH)",
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": "Bybit (ETH)",
};

const MIXER_KEYWORDS = ["mixer", "tornado", "wasabi", "coinjoin", "chipmixer"];

interface GraphNode {
  id: string;
  label: string;
  type: "own" | "exchange" | "mixer" | "unknown";
  balance?: string;
  txCount?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  value: number;
  txHash?: string;
}

async function traceBitcoin(
  address: string,
  depth: number
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; error?: string }> {
  const nodes: Map<string, GraphNode> = new Map();
  const edges: GraphEdge[] = [];
  const visited = new Set<string>();

  async function crawl(addr: string, currentDepth: number) {
    if (currentDepth > depth || visited.has(addr)) return;
    visited.add(addr);

    try {
      const res = await fetch(`https://mempool.space/api/address/${addr}`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return;

      const data = await res.json();
      if (!data || !data.address) return;

      const knownLabel = KNOWN_LABELS[addr];
      const nodeType: GraphNode["type"] = knownLabel
        ? knownLabel.toLowerCase().match(/mixer|tornado|wasabi/) ? "mixer" : "exchange"
        : currentDepth === 0 ? "own" : "unknown";

      const balance = (data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum + data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum);

      nodes.set(addr, {
        id: addr,
        label: knownLabel || `${addr.substring(0, 8)}...${addr.substring(addr.length - 6)}`,
        type: nodeType,
        balance: `${(balance / 1e8).toFixed(8)} BTC`,
        txCount: data.chain_stats.tx_count + data.mempool_stats.tx_count,
      });

      const txRes = await fetch(`https://mempool.space/api/address/${addr}/txs`, { signal: AbortSignal.timeout(10000) });
      if (!txRes.ok) return;
      const txs = await txRes.json();

      for (const tx of txs.slice(0, 10)) {
        for (const output of (tx.vout || []).slice(0, 5)) {
          const targetAddr = output.scriptpubkey_address;
          if (targetAddr && targetAddr !== addr) {
            const targetLabel = KNOWN_LABELS[targetAddr];
            
            if (!edges.some(e => e.source === addr && e.target === targetAddr && e.txHash === tx.txid)) {
              edges.push({
                source: addr,
                target: targetAddr,
                value: output.value / 1e8,
                txHash: tx.txid,
              });
            }

            if (!nodes.has(targetAddr)) {
              nodes.set(targetAddr, {
                id: targetAddr,
                label: targetLabel || `${targetAddr.substring(0, 8)}...${targetAddr.substring(targetAddr.length - 4)}`,
                type: targetLabel
                  ? targetLabel.toLowerCase().match(/mixer|tornado|wasabi/) ? "mixer" : "exchange"
                  : "unknown",
              });
            }

            if (currentDepth + 1 <= depth) {
              await crawl(targetAddr, currentDepth + 1);
            }
          }
        }
      }
    } catch {
      // Address fetch failed
    }
  }

  await crawl(address, 0);

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
}

async function traceEthereum(
  address: string
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; error?: string }> {
  const nodes: Map<string, GraphNode> = new Map();
  const edges: GraphEdge[] = [];
  const { etherscan } = loadOnchainApiKeys();
  const keyQ = etherscan ? `&apikey=${encodeURIComponent(etherscan)}` : "";

  try {
    // Etherscan — optional API-Key aus Settings / Env (höhere Rate-Limits)
    const balRes = await fetch(
      `https://api.etherscan.io/api?module=account&action=balance&address=${address}&tag=latest${keyQ}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const balData = await balRes.json();
    const balETH =
      balData.result && /^\d+$/.test(String(balData.result))
        ? (Number(BigInt(balData.result)) / 1e18).toFixed(6)
        : "0";

    const knownLabel = KNOWN_LABELS[address.toLowerCase()];
    nodes.set(address.toLowerCase(), {
      id: address.toLowerCase(),
      label: knownLabel || `${address.substring(0, 10)}...`,
      type: knownLabel ? "exchange" : "own",
      balance: `${balETH} ETH`,
    });

    // Get normal transactions
    const txRes = await fetch(
      `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=10&sort=desc${keyQ}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const txData = await txRes.json();
    const txList = txData.result || [];

    for (const tx of txList.slice(0, 10)) {
      const from = tx.from?.toLowerCase();
      const to = tx.to?.toLowerCase();
      if (!from || !to) continue;

      const valueETH = parseInt(tx.value) / 1e18;

      // Add nodes
      for (const addr of [from, to]) {
        if (!nodes.has(addr)) {
          const label = KNOWN_LABELS[addr];
          nodes.set(addr, {
            id: addr,
            label: label || `${addr.substring(0, 10)}...`,
            type: label ? (MIXER_KEYWORDS.some(k => label.toLowerCase().includes(k)) ? "mixer" : "exchange") : "unknown",
          });
        }
      }

      edges.push({
        source: from,
        target: to,
        value: valueETH,
        txHash: tx.hash,
      });
    }
  } catch {
    return { nodes: Array.from(nodes.values()), edges, error: "Etherscan API Fehler" };
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { address, depth = 2, chain = "bitcoin" } = body;

  if (!address) {
    return NextResponse.json({ error: "Keine Adresse angegeben" }, { status: 400 });
  }

  const maxDepth = Math.min(depth, 3);

  let result;
  if (chain === "ethereum" || address.startsWith("0x")) {
    result = await traceEthereum(address);
  } else {
    result = await traceBitcoin(address, maxDepth);
  }

  return NextResponse.json({
    success: true,
    address,
    chain: address.startsWith("0x") ? "ethereum" : "bitcoin",
    depth: maxDepth,
    ...result,
  });
}
