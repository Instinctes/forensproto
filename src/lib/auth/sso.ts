/**
 * SSO / OIDC – Erweiterungspunkt
 * ==============================
 * Bewusst KEIN gefälschter SAML/OIDC-Flow. Stattdessen eine klar
 * definierte Provider-Schnittstelle, an die ein echter Identity Provider
 * (Azure AD, Okta, Keycloak …) angebunden werden kann. Die lokale
 * Passwort-Authentifizierung ist die voll implementierte Referenz; ein
 * SSO-Provider muss lediglich einen verifizierten Benutzer auf einen
 * lokalen Account abbilden (`resolveExternalUser`).
 *
 * Aktivierung später über Umgebungsvariablen (z.B. OIDC_ISSUER,
 * OIDC_CLIENT_ID, OIDC_CLIENT_SECRET) + Implementierung von
 * `getAuthorizationUrl` / `handleCallback`.
 */

import type { Role } from "./users";

export interface ExternalIdentity {
  subject: string; // stabile IdP-Subject-ID
  email?: string;
  displayName?: string;
  groups?: string[]; // für Rollen-Mapping
}

export interface SsoProvider {
  id: string;
  name: string;
  /** URL, zu der der Browser für die Anmeldung umgeleitet wird. */
  getAuthorizationUrl(state: string, redirectUri: string): string;
  /** Tauscht den Callback (code/SAMLResponse) gegen eine verifizierte Identität. */
  handleCallback(params: Record<string, string>): Promise<ExternalIdentity>;
  /** Bildet IdP-Gruppen auf eine lokale Rolle ab. */
  mapRole(identity: ExternalIdentity): Role;
}

const providers = new Map<string, SsoProvider>();

export function registerSsoProvider(p: SsoProvider): void {
  providers.set(p.id, p);
}

export function getSsoProvider(id: string): SsoProvider | undefined {
  return providers.get(id);
}

export function listSsoProviders(): Array<{ id: string; name: string }> {
  return [...providers.values()].map((p) => ({ id: p.id, name: p.name }));
}

/** Standard-Rollen-Mapping aus IdP-Gruppen (von Providern wiederverwendbar). */
export function defaultRoleFromGroups(groups: string[] = []): Role {
  const g = groups.map((x) => x.toLowerCase());
  if (g.some((x) => x.includes("admin"))) return "admin";
  if (g.some((x) => x.includes("investigator") || x.includes("analyst"))) return "investigator";
  return "viewer";
}
