"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Users, Building2, KeyRound, Plus, ShieldAlert } from "lucide-react";
import Header from "@/components/Header";

interface UserRow { id: string; username: string; role: string; tenantId: string; createdAt: number; }
interface TenantRow { id: string; name: string; }

export default function AdminPage() {
  const [me, setMe] = useState<{ authEnabled: boolean; user?: { role: string } } | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [form, setForm] = useState({ username: "", password: "", role: "viewer", tenantId: "default" });
  const [tenantName, setTenantName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const meRes = await fetch("/api/auth/me").then((r) => r.json());
    setMe(meRes);
    const u = await fetch("/api/admin/users").then((r) => r.json()).catch(() => ({}));
    if (u.success) setUsers(u.users);
    const t = await fetch("/api/admin/tenants").then((r) => r.json()).catch(() => ({}));
    if (t.success) setTenants(t.tenants);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const createUser = async () => {
    setMsg(null);
    const r = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).then((x) => x.json());
    setMsg(r.success ? `✓ Benutzer ${r.user.username} angelegt` : `✗ ${r.error}`);
    if (r.success) { setForm({ ...form, username: "", password: "" }); load(); }
  };

  const createTenant = async () => {
    if (!tenantName.trim()) return;
    const r = await fetch("/api/admin/tenants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: tenantName }) }).then((x) => x.json());
    if (r.success) { setTenantName(""); load(); }
  };

  const genKey = async (id: string) => {
    setNewKey(null);
    const r = await fetch(`/api/admin/users/${id}/apikey`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: "ui" }) }).then((x) => x.json());
    if (r.success) setNewKey(r.apiKey);
  };

  const isAdmin = me?.user?.role === "admin" || me?.authEnabled === false;

  return (
    <div className="page-container">
      <Header title="Administration" subtitle="Benutzer · Rollen · Mandanten · API-Keys" />
      <motion.main className="content-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {me?.authEnabled === false && (
          <div className="card" style={{ padding: "var(--space-md)", marginBottom: "var(--space-lg)", display: "flex", gap: "10px", alignItems: "center", color: "var(--warning-400)" }}>
            <ShieldAlert size={18} /> Auth ist deaktiviert (FORENSPROTO_AUTH). Änderungen sind möglich, werden aber erst mit aktivierter Auth erzwungen.
          </div>
        )}
        {!isAdmin ? (
          <div className="card" style={{ padding: "var(--space-2xl)", textAlign: "center", color: "var(--text-tertiary)" }}>
            Kein Admin-Zugriff. Bitte als Administrator anmelden.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
            {/* Users */}
            <div className="card" style={{ padding: "var(--space-lg)" }}>
              <h3 style={{ marginTop: 0, fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><Users size={16} /> Benutzer ({users.length})</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "var(--space-md)" }}>
                {users.map((u) => (
                  <div key={u.id} className="card" style={{ padding: "8px 12px", background: "var(--bg-secondary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{u.username}</span>
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}> · {u.role} · {u.tenantId}</span>
                    </div>
                    <button className="btn btn-secondary" onClick={() => genKey(u.id)} style={{ padding: "3px 8px", fontSize: "0.625rem", display: "flex", gap: "4px", alignItems: "center" }}><KeyRound size={11} /> API-Key</button>
                  </div>
                ))}
              </div>
              {newKey && (
                <div className="card" style={{ padding: "8px 12px", marginBottom: "var(--space-md)", background: "rgba(34,197,94,0.08)" }}>
                  <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)" }}>Neuer API-Key (nur jetzt sichtbar):</div>
                  <code style={{ fontSize: "0.6875rem", wordBreak: "break-all" }}>{newKey}</code>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <input className="af-input form-input" placeholder="Benutzername" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                <input className="af-input form-input" type="password" placeholder="Passwort (min. 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <div style={{ display: "flex", gap: "8px" }}>
                  <select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ flex: 1 }}>
                    <option value="viewer">viewer</option>
                    <option value="investigator">investigator</option>
                    <option value="admin">admin</option>
                  </select>
                  <select className="form-select" value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} style={{ flex: 1 }}>
                    {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <button className="btn btn-primary" onClick={createUser} style={{ justifyContent: "center", padding: "8px", display: "flex", gap: "6px" }}><Plus size={14} /> Benutzer anlegen</button>
                {msg && <div style={{ fontSize: "0.75rem", color: msg.startsWith("✓") ? "var(--success-400)" : "var(--danger-400)" }}>{msg}</div>}
              </div>
            </div>

            {/* Tenants */}
            <div className="card" style={{ padding: "var(--space-lg)" }}>
              <h3 style={{ marginTop: 0, fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><Building2 size={16} /> Mandanten ({tenants.length})</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "var(--space-md)" }}>
                {tenants.map((t) => (
                  <div key={t.id} className="card" style={{ padding: "8px 12px", background: "var(--bg-secondary)" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{t.name}</span>
                    <span style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}> · {t.id}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <input className="af-input form-input" placeholder="Mandantenname" value={tenantName} onChange={(e) => setTenantName(e.target.value)} style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={createTenant} style={{ padding: "8px 12px", display: "flex", gap: "6px", alignItems: "center" }}><Plus size={14} /> Anlegen</button>
              </div>
            </div>
          </div>
        )}
      </motion.main>
    </div>
  );
}
