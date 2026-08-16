"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldCheck, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login fehlgeschlagen");
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-lg)" }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: "var(--space-2xl)", width: "400px", maxWidth: "92vw" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "var(--space-xl)" }}>
          <ShieldCheck size={26} style={{ color: "var(--primary-400)" }} />
          <div>
            <h1 style={{ margin: 0, fontSize: "1.25rem" }}>ForensProto</h1>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-tertiary)" }}>Anmeldung erforderlich</p>
          </div>
        </div>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <input className="af-input form-input" placeholder="Benutzername" value={username} autoFocus
            onChange={(e) => setUsername(e.target.value)} />
          <input className="af-input form-input" type="password" placeholder="Passwort" value={password}
            onChange={(e) => setPassword(e.target.value)} />
          {error && <div style={{ color: "var(--danger-400)", fontSize: "0.8125rem" }}>{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ justifyContent: "center", padding: "10px" }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Anmelden"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
