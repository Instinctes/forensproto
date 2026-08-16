#!/usr/bin/env python3
"""
ForensProto Remote-Recovery-Agent (Referenz-Implementierung)
============================================================
Läuft auf einer entfernten oder Cloud-GPU (z.B. Vast.ai, EC2, eigener
Server). Registriert sich beim ForensProto-Server, zieht Keyspace-Chunks
(Shards eines verteilten Jobs), führt Hashcat mit --skip/--limit aus und
meldet Ergebnisse zurück.

Voraussetzungen auf dem Agenten: Python 3.8+, Hashcat im PATH.

Server muss im Agenten-Modus laufen:  FORENSPROTO_EXECUTION_MODE=agents

Aufruf:
    python3 forensproto-agent.py --server http://DEIN_SERVER:3000 --name gpu-node-1
"""
import argparse, json, os, subprocess, sys, tempfile, time, urllib.request

def post(url, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def benchmark(mode):
    try:
        out = subprocess.run(["hashcat", "-b", "-m", str(mode), "--machine-readable"],
                             capture_output=True, text=True, timeout=120).stdout
        for line in out.splitlines():
            if line.startswith(f"{mode}:"):
                return int(line.split(":")[1])
    except Exception:
        pass
    return 0

def run_chunk(server, agent_id, chunk):
    """Führt einen Chunk mit Hashcat (skip/limit) aus und meldet das Ergebnis."""
    tmp = tempfile.mkdtemp(prefix="fp-agent-")
    hash_file = os.path.join(tmp, "target.hash")
    pot_file = os.path.join(tmp, "out.pot")
    with open(hash_file, "w") as f:
        f.write(chunk["hashString"])

    args = ["hashcat", "-m", str(chunk["hashcatMode"]), "-a", str(chunk.get("attackMode", 0)),
            hash_file, "--potfile-path", pot_file, "--status", "--status-json", "--status-timer=5"]
    if chunk.get("skip") is not None:  args += ["-s", str(chunk["skip"])]
    if chunk.get("limit") is not None: args += ["-l", str(chunk["limit"])]
    # Angriffs-spezifische Argumente (Wortliste/Maske müssen lokal vorliegen)
    if chunk.get("attackMode", 0) == 0 and chunk.get("wordlist"):
        args.append(chunk["wordlist"])
        for r in chunk.get("ruleFiles") or []: args += ["-r", r]
    elif chunk.get("attackMode") == 3 and chunk.get("mask"):
        args.append(chunk["mask"])

    proc = subprocess.run(args, capture_output=True, text=True)
    result_url = f"{server}/api/agents/{agent_id}/result"
    if proc.returncode == 0 and os.path.exists(pot_file):
        with open(pot_file) as f:
            pw = f.read().strip().split(":")[-1]
        post(result_url, {"jobId": chunk["jobId"], "found": True, "password": pw})
        print(f"[+] TREFFER in Chunk {chunk['jobId']}: {pw}")
    elif proc.returncode == 1:
        post(result_url, {"jobId": chunk["jobId"], "exhausted": True})
        print(f"[-] Chunk {chunk['jobId']} erschöpft")
    else:
        post(result_url, {"jobId": chunk["jobId"], "error": f"exit {proc.returncode}"})
        print(f"[!] Chunk {chunk['jobId']} Fehler: exit {proc.returncode}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", required=True)
    ap.add_argument("--name", default=os.uname().nodename)
    ap.add_argument("--gpu", default="GPU")
    ap.add_argument("--poll", type=int, default=10)
    a = ap.parse_args()

    reg = post(f"{a.server}/api/agents/register", {"name": a.name, "gpu": a.gpu, "benchmarkHps": benchmark(11300)})
    agent_id = reg["agentId"]
    print(f"[*] Registriert als {agent_id} — warte auf Chunks…")

    while True:
        try:
            r = post(f"{a.server}/api/agents/{agent_id}/pull", {})
            chunk = r.get("chunk")
            if chunk:
                print(f"[>] Chunk {chunk['jobId']} (skip={chunk.get('skip')}, limit={chunk.get('limit')})")
                run_chunk(a.server, agent_id, chunk)
            else:
                post(f"{a.server}/api/agents/{agent_id}/heartbeat", {"status": "idle"})
                time.sleep(a.poll)
        except KeyboardInterrupt:
            print("\n[*] Beende Agent."); sys.exit(0)
        except Exception as e:
            print(f"[!] Fehler: {e}"); time.sleep(a.poll)

if __name__ == "__main__":
    main()
