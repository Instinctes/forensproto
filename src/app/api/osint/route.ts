import { NextResponse } from "next/server";
import dns from "dns/promises";
import type { SoaRecord } from "dns";
import crypto from "crypto";
import https from "https";
import http from "http";

// ============================================================================
// Hilfsfunktionen
// ============================================================================

/** Sicherer HTTP HEAD/GET für Response-Header-Analyse */
async function probeHTTP(url: string, timeout = 5000): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  redirectChain: string[];
  finalUrl: string;
  responseTimeMs: number;
}> {
  const start = Date.now();
  const redirectChain: string[] = [];
  let currentUrl = url;
  let maxRedirects = 5;

  return new Promise((resolve) => {
    const doRequest = (reqUrl: string) => {
      const mod = reqUrl.startsWith("https") ? https : http;
      const req = mod.get(reqUrl, { timeout, headers: { "User-Agent": "ForensProto/OSINT-Scanner" } }, (res) => {
        const statusCode = res.statusCode || 0;
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (v) headers[k] = Array.isArray(v) ? v.join(", ") : v;
        }

        if ([301, 302, 303, 307, 308].includes(statusCode) && res.headers.location && maxRedirects > 0) {
          maxRedirects--;
          redirectChain.push(reqUrl);
          const next = res.headers.location.startsWith("http") ? res.headers.location : new URL(res.headers.location, reqUrl).href;
          currentUrl = next;
          res.destroy();
          doRequest(next);
          return;
        }

        res.destroy();
        resolve({
          statusCode,
          headers,
          redirectChain,
          finalUrl: currentUrl,
          responseTimeMs: Date.now() - start,
        });
      });

      req.on("error", () => {
        resolve({ statusCode: 0, headers: {}, redirectChain, finalUrl: currentUrl, responseTimeMs: Date.now() - start });
      });
      req.on("timeout", () => {
        req.destroy();
        resolve({ statusCode: 0, headers: {}, redirectChain, finalUrl: currentUrl, responseTimeMs: Date.now() - start });
      });
    };

    doRequest(currentUrl);
  });
}

/** AAAA-Records (IPv6) abfragen */
async function resolveAAAA(domain: string): Promise<string[]> {
  try { return await dns.resolve6(domain); } catch { return []; }
}

/** DKIM-Selector prüfen */
async function checkDKIM(domain: string, selectors = ["default", "google", "selector1", "selector2", "k1", "mail", "dkim"]): Promise<{ selector: string; record: string }[]> {
  const found: { selector: string; record: string }[] = [];
  for (const sel of selectors) {
    try {
      const records = await dns.resolveTxt(`${sel}._domainkey.${domain}`);
      const joined = records.map(r => r.join("")).join("");
      if (joined) found.push({ selector: sel, record: joined });
    } catch { /* nicht gefunden */ }
  }
  return found;
}

/** DMARC-Record laden */
async function checkDMARC(domain: string): Promise<string> {
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    return records.map(r => r.join("")).find(r => r.toLowerCase().includes("v=dmarc1")) || "Nicht gefunden";
  } catch { return "Nicht gefunden"; }
}

/** Security-Header bewerten */
function analyzeSecurityHeaders(headers: Record<string, string>): {
  score: number;
  findings: { header: string; status: "present" | "missing" | "weak"; value?: string; recommendation?: string }[];
} {
  const findings: { header: string; status: "present" | "missing" | "weak"; value?: string; recommendation?: string }[] = [];
  let score = 100;

  const checks = [
    { header: "strict-transport-security", name: "HSTS", weight: 15, rec: "Strict-Transport-Security: max-age=63072000; includeSubDomains; preload" },
    { header: "content-security-policy", name: "CSP", weight: 15, rec: "Content-Security-Policy Header setzen" },
    { header: "x-frame-options", name: "X-Frame-Options", weight: 10, rec: "X-Frame-Options: DENY oder SAMEORIGIN" },
    { header: "x-content-type-options", name: "X-Content-Type-Options", weight: 10, rec: "X-Content-Type-Options: nosniff" },
    { header: "x-xss-protection", name: "X-XSS-Protection", weight: 5, rec: "X-XSS-Protection: 1; mode=block" },
    { header: "referrer-policy", name: "Referrer-Policy", weight: 5, rec: "Referrer-Policy: strict-origin-when-cross-origin" },
    { header: "permissions-policy", name: "Permissions-Policy", weight: 5, rec: "Permissions-Policy Header zur Feature-Steuerung" },
  ];

  for (const check of checks) {
    const val = headers[check.header];
    if (val) {
      findings.push({ header: check.name, status: "present", value: val });
    } else {
      findings.push({ header: check.name, status: "missing", recommendation: check.rec });
      score -= check.weight;
    }
  }

  // Server-Header (Information Disclosure)
  if (headers["server"]) {
    const server = headers["server"];
    const leaksVersion = /\d+\.\d+/.test(server);
    if (leaksVersion) {
      findings.push({ header: "Server", status: "weak", value: server, recommendation: "Server-Header ohne Versionsnummer konfigurieren" });
      score -= 5;
    } else {
      findings.push({ header: "Server", status: "present", value: server });
    }
  }

  // X-Powered-By (Information Disclosure)
  if (headers["x-powered-by"]) {
    findings.push({ header: "X-Powered-By", status: "weak", value: headers["x-powered-by"], recommendation: "X-Powered-By Header entfernen" });
    score -= 5;
  }

  return { score: Math.max(0, score), findings };
}

/** TLS/SSL-Info über HTTPS-Verbindung */
async function checkTLS(domain: string): Promise<{
  protocol?: string;
  cipher?: string;
  validFrom?: string;
  validTo?: string;
  issuer?: string;
  subject?: string;
  serialNumber?: string;
  fingerprint?: string;
  daysRemaining?: number;
  isValid: boolean;
}> {
  return new Promise((resolve) => {
    const req = https.get(`https://${domain}`, { timeout: 5000 }, (res) => {
      const sock = res.socket as import("tls").TLSSocket;
      if (!sock.getPeerCertificate) {
        res.destroy();
        resolve({ isValid: false });
        return;
      }
      const cert = sock.getPeerCertificate();
      const cipher = sock.getCipher?.();
      const proto = sock.getProtocol?.();

      const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
      const daysRemaining = validTo ? Math.floor((validTo.getTime() - Date.now()) / 86400000) : undefined;

      res.destroy();
      resolve({
        protocol: proto || undefined,
        cipher: cipher ? `${cipher.name} (${cipher.version})` : undefined,
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        issuer: cert.issuer ? Object.values(cert.issuer).join(", ") : undefined,
        subject: cert.subject ? Object.values(cert.subject).join(", ") : undefined,
        serialNumber: cert.serialNumber,
        fingerprint: cert.fingerprint256,
        daysRemaining,
        isValid: daysRemaining !== undefined ? daysRemaining > 0 : false,
      });
    });
    req.on("error", () => resolve({ isValid: false }));
    req.on("timeout", () => { req.destroy(); resolve({ isValid: false }); });
  });
}

/** Subdomain-Enumeration über gängige Prefixes */
async function enumerateSubdomains(domain: string): Promise<{ subdomain: string; ips: string[] }[]> {
  const common = ["www", "mail", "ftp", "webmail", "smtp", "pop", "imap", "blog", "shop", "api", "dev", "staging", "test", "admin", "vpn", "remote", "cdn", "media", "static", "ns1", "ns2", "mx", "m", "app"];
  const found: { subdomain: string; ips: string[] }[] = [];
  
  const checks = common.map(async (sub) => {
    try {
      const ips = await dns.resolve4(`${sub}.${domain}`);
      if (ips.length > 0) found.push({ subdomain: `${sub}.${domain}`, ips });
    } catch { /* not found */ }
  });

  await Promise.allSettled(checks);
  return found.sort((a, b) => a.subdomain.localeCompare(b.subdomain));
}

// ============================================================================
// POST Handler
// ============================================================================

export async function POST(request: Request) {
  try {
    const { query, type: manualType } = await request.json();

    if (!query) {
      return NextResponse.json({ success: false, error: "Keine Eingabe" }, { status: 400 });
    }

    // Auto-detect type
    const detectType = (input: string) => {
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(input)) return "ip";
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) return "email";
      if (/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z]{2,})+$/.test(input)) return "domain";
      return manualType || "unknown";
    };

    const type = detectType(query);

    // ========================================================================
    // IP Analysis — Maximum
    // ========================================================================
    if (type === "ip") {
      const [geoRes, reverseDnsResult] = await Promise.allSettled([
        fetch(`http://ip-api.com/json/${query}?fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,mobile,proxy,hosting,query`).then(r => r.json()),
        dns.reverse(query).catch(() => ["Kein PTR-Record"]),
      ]);

      const geo = geoRes.status === "fulfilled" ? geoRes.value : {};
      const reverseDns = reverseDnsResult.status === "fulfilled" ? (reverseDnsResult.value as string[]).join(", ") : "Kein PTR-Record";

      const ispLower = (geo.isp || "").toLowerCase();
      const orgLower = (geo.org || "").toLowerCase();
      const isCloud = ["google", "amazon", "microsoft", "digitalocean", "linode", "vultr", "ovh", "hetzner", "cloudflare"].some(kw => ispLower.includes(kw) || orgLower.includes(kw));
      const isVpn = ["nordvpn", "expressvpn", "surfshark", "proton", "mullvad", "tunnelbear", "private internet"].some(kw => ispLower.includes(kw) || orgLower.includes(kw));

      // Blacklist Checks (DNSBL)
      const blacklists = ["zen.spamhaus.org", "bl.spamcop.net", "b.barracudacentral.org", "dnsbl.sorbs.net"];
      const reversedIp = query.split(".").reverse().join(".");
      const blacklistResults: { list: string; listed: boolean }[] = [];
      
      await Promise.allSettled(
        blacklists.map(async (bl) => {
          try {
            await dns.resolve4(`${reversedIp}.${bl}`);
            blacklistResults.push({ list: bl, listed: true });
          } catch {
            blacklistResults.push({ list: bl, listed: false });
          }
        })
      );

      const listedCount = blacklistResults.filter(b => b.listed).length;

      return NextResponse.json({
        success: true,
        type: "ip",
        query,
        results: {
          ip: query,
          country: geo.country || "N/A",
          countryCode: geo.countryCode || "N/A",
          city: geo.city || "N/A",
          region: geo.regionName || "N/A",
          zip: geo.zip || "N/A",
          lat: geo.lat || 0,
          lon: geo.lon || 0,
          timezone: geo.timezone || "N/A",
          isp: geo.isp || "N/A",
          org: geo.org || "N/A",
          as: geo.as || "N/A",
          asName: geo.asname || "N/A",
          reverseDns,
          usageType: geo.hosting ? "Data Center / Hosting" : isCloud ? "Cloud Provider" : isVpn || geo.proxy ? "VPN / Proxy" : geo.mobile ? "Mobilfunk" : "Residential / ISP",
          isMobile: geo.mobile || false,
          isProxy: geo.proxy || false,
          isHosting: geo.hosting || false,
          blacklists: blacklistResults,
          blacklistCount: `${listedCount}/${blacklists.length}`,
          riskScore: Math.min(100, (listedCount * 25) + (geo.proxy ? 20 : 0) + (isVpn ? 15 : 0) + (["RU", "CN", "KP", "IR"].includes(geo.countryCode) ? 20 : 0)),
        },
      });
    }

    // ========================================================================
    // Domain Analysis — Maximum
    // ========================================================================
    if (type === "domain") {
      // DNS Records parallel abfragen
      const [a4, a6, mxRaw, nsRes, txtRaw, soaRes, cnameRes, dmarcRes, dkimRes, httpProbe, httpsProbe, tlsInfo, subdomains] = await Promise.allSettled([
        dns.resolve4(query).catch(() => []),
        resolveAAAA(query),
        dns.resolveMx(query).catch(() => []),
        dns.resolveNs(query).catch(() => []),
        dns.resolveTxt(query).catch(() => []),
        dns.resolveSoa(query).catch(() => null),
        dns.resolveCname(query).catch(() => []),
        checkDMARC(query),
        checkDKIM(query),
        probeHTTP(`http://${query}`),
        probeHTTP(`https://${query}`),
        checkTLS(query),
        enumerateSubdomains(query),
      ]);

      const aRecords = a4.status === "fulfilled" ? a4.value as string[] : [];
      const aaaaRecords = a6.status === "fulfilled" ? a6.value : [];
      const mxRecords = mxRaw.status === "fulfilled" ? (mxRaw.value as { exchange: string; priority: number }[]).map(r => `${r.exchange} (Prio: ${r.priority})`) : [];
      const nsRecords = nsRes.status === "fulfilled" ? nsRes.value as string[] : [];
      const txtRecords = txtRaw.status === "fulfilled" ? (txtRaw.value as string[][]).map(r => r.join("")) : [];
      const soaRecord = soaRes.status === "fulfilled" ? soaRes.value as SoaRecord | null : null;
      const cnameRecord = cnameRes.status === "fulfilled" ? cnameRes.value as string[] : [];
      const dmarc = dmarcRes.status === "fulfilled" ? dmarcRes.value : "Nicht gefunden";
      const dkimRecords = dkimRes.status === "fulfilled" ? dkimRes.value : [];
      const httpResult = httpProbe.status === "fulfilled" ? httpProbe.value : null;
      const httpsResult = httpsProbe.status === "fulfilled" ? httpsProbe.value : null;
      const tls = tlsInfo.status === "fulfilled" ? tlsInfo.value : { isValid: false };
      const subdomainList = subdomains.status === "fulfilled" ? subdomains.value : [];

      // SPF auswerten
      const spfRecord = txtRecords.find(t => t.toLowerCase().includes("v=spf1")) || "Nicht gefunden";

      // Security-Header analysieren
      const secHeaders = httpsResult ? analyzeSecurityHeaders(httpsResult.headers) : httpResult ? analyzeSecurityHeaders(httpResult.headers) : { score: 0, findings: [] };

      // Technology Detection
      const technologies: string[] = [];
      const allHeaders = { ...(httpResult?.headers || {}), ...(httpsResult?.headers || {}) };
      if (allHeaders["server"]) technologies.push(`Server: ${allHeaders["server"]}`);
      if (allHeaders["x-powered-by"]) technologies.push(`Powered: ${allHeaders["x-powered-by"]}`);
      if (allHeaders["x-generator"]) technologies.push(`Generator: ${allHeaders["x-generator"]}`);
      if (allHeaders["x-shopify-stage"]) technologies.push("Shopify");
      if (allHeaders["x-vercel-id"]) technologies.push("Vercel");
      if (allHeaders["cf-ray"]) technologies.push("Cloudflare");
      if (allHeaders["x-amz-cf-id"]) technologies.push("AWS CloudFront");
      if (allHeaders["fly-request-id"]) technologies.push("Fly.io");
      if (mxRecords.some(mx => mx.toLowerCase().includes("google"))) technologies.push("Google Workspace (Mail)");
      if (mxRecords.some(mx => mx.toLowerCase().includes("outlook") || mx.toLowerCase().includes("microsoft"))) technologies.push("Microsoft 365 (Mail)");

      // Risiko-Bewertung
      let riskScore = 0;
      if (spfRecord === "Nicht gefunden") riskScore += 15;
      if (dmarc === "Nicht gefunden") riskScore += 15;
      if (dkimRecords.length === 0) riskScore += 10;
      if (!tls.isValid) riskScore += 20;
      if (tls.daysRemaining !== undefined && tls.daysRemaining < 30) riskScore += 10;
      riskScore += Math.max(0, 35 - Math.floor(secHeaders.score / 3));
      if (query.includes("phishing") || query.includes("fake")) riskScore += 30;

      return NextResponse.json({
        success: true,
        type: "domain",
        query,
        results: {
          // DNS Records
          aRecords,
          aaaaRecords,
          mxRecords,
          nsRecords,
          txtRecords,
          soaRecord,
          cnameRecord,

          // Email Security
          spf: spfRecord,
          dmarc,
          dkimRecords,

          // HTTP
          httpStatus: httpResult?.statusCode,
          httpsStatus: httpsResult?.statusCode,
          responseTimeMs: httpsResult?.responseTimeMs || httpResult?.responseTimeMs,
          redirectChain: httpsResult?.redirectChain || httpResult?.redirectChain || [],
          finalUrl: httpsResult?.finalUrl || httpResult?.finalUrl,

          // TLS/SSL
          tls,

          // Security Headers
          securityHeaders: secHeaders,

          // Technology
          technologies,

          // Subdomains
          subdomains: subdomainList,

          // Risk
          riskScore: Math.min(100, riskScore),
        },
      });
    }

    // ========================================================================
    // Email Analysis — Maximum
    // ========================================================================
    if (type === "email") {
      const domain = query.split("@")[1];
      const localPart = query.split("@")[0];

      const [mxRaw, aRes, txtRaw, dmarcRes, dkimRes] = await Promise.allSettled([
        dns.resolveMx(domain).catch(() => []),
        dns.resolve4(domain).catch(() => []),
        dns.resolveTxt(domain).catch(() => []),
        checkDMARC(domain),
        checkDKIM(domain),
      ]);

      const mxRecords = mxRaw.status === "fulfilled" ? (mxRaw.value as { exchange: string; priority: number }[]).map(r => r.exchange) : [];
      const domainIPs = aRes.status === "fulfilled" ? aRes.value as string[] : [];
      const txtRecords = txtRaw.status === "fulfilled" ? (txtRaw.value as string[][]).map(r => r.join("")) : [];
      const dmarc = dmarcRes.status === "fulfilled" ? dmarcRes.value : "Nicht gefunden";
      const dkimRecords = dkimRes.status === "fulfilled" ? dkimRes.value : [];
      const spfRecord = txtRecords.find(t => t.toLowerCase().includes("v=spf1")) || "Nicht gefunden";

      // Gravatar Check
      const emailHash = crypto.createHash("md5").update(query.trim().toLowerCase()).digest("hex");
      let hasGravatar = false;
      try {
        const gravatarRes = await fetch(`https://www.gravatar.com/avatar/${emailHash}?d=404`, { signal: AbortSignal.timeout(3000) });
        hasGravatar = gravatarRes.status !== 404;
      } catch { /* timeout */ }

      // Disposable check
      const disposableDomains = ["tempmail", "guerrillamail", "throwaway", "mailinator", "yopmail", "10minutemail", "disposable", "trashmail", "sharklasers", "grr.la", "guerrillamailblock", "dispostable", "fakeinbox", "mailnesia", "maildrop", "getnada"];
      const isDisposable = disposableDomains.some(d => domain.toLowerCase().includes(d));

      // Provider Detection
      const isGmail = domain.includes("gmail") || mxRecords.some(mx => mx.toLowerCase().includes("google"));
      const isMicrosoft = domain.includes("outlook") || domain.includes("hotmail") || mxRecords.some(mx => mx.toLowerCase().includes("microsoft") || mx.toLowerCase().includes("outlook"));
      const isYahoo = domain.includes("yahoo") || mxRecords.some(mx => mx.toLowerCase().includes("yahoo"));
      const isApple = domain.includes("icloud") || domain.includes("me.com") || domain.includes("mac.com");
      const isProton = domain.includes("proton") || domain.includes("pm.me") || mxRecords.some(mx => mx.toLowerCase().includes("proton"));

      const provider = isGmail ? "Google Gmail" : isMicrosoft ? "Microsoft Outlook" : isYahoo ? "Yahoo Mail" : isApple ? "Apple iCloud" : isProton ? "ProtonMail (Verschlüsselt)" : domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
      const isLargeProvider = isGmail || isMicrosoft || isYahoo || isApple;

      // Email-Syntax-Analyse
      const syntaxAnalysis = {
        localPart,
        domain,
        localPartLength: localPart.length,
        hasNumbers: /\d/.test(localPart),
        hasSpecialChars: /[.+\-_]/.test(localPart),
        hasPlusTag: localPart.includes("+"),
        plusTag: localPart.includes("+") ? localPart.split("+")[1] : null,
        isDotTrick: isGmail && localPart.includes("."), // Gmail ignores dots
        format: /^[a-z][a-z0-9._-]*$/.test(localPart) ? "Standard" : /^\d+$/.test(localPart) ? "Numerisch (verdächtig)" : "Nicht-Standard",
      };

      // Risk Score
      let riskScore = 0;
      if (isDisposable) riskScore += 40;
      if (mxRecords.length === 0) riskScore += 30;
      if (spfRecord === "Nicht gefunden") riskScore += 10;
      if (dmarc === "Nicht gefunden") riskScore += 10;
      if (syntaxAnalysis.format === "Numerisch (verdächtig)") riskScore += 10;
      if (isProton) riskScore += 5; // Leicht erhöht wegen Privacy-Fokus
      if (!isLargeProvider && !isDisposable) riskScore += 5; // Custom Domain = minimal risk bump

      return NextResponse.json({
        success: true,
        type: "email",
        query,
        results: {
          // Email
          localPart,
          domain,
          provider,
          disposable: isDisposable,
          encrypted: isProton,
          syntaxAnalysis,

          // Domain-DNS
          domainIPs,
          mxRecords,
          spf: spfRecord,
          dmarc,
          dkimRecords,
          hasMx: mxRecords.length > 0,

          // Online Presence
          hasGravatar,
          gravatarUrl: hasGravatar ? `https://www.gravatar.com/avatar/${emailHash}` : null,
          emailHash,

          // Security Assessment
          reputation: isDisposable ? "Einweg-Email (Hohes Risiko)" : isLargeProvider ? "Vertrauenswürdiger Provider" : isProton ? "Privacy-fokussierter Provider" : "Private Domain",
          riskScore: Math.min(100, riskScore),
        },
      });
    }

    return NextResponse.json({ success: false, error: "Unbekannter Typ oder Format" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "OSINT-Analyse fehlgeschlagen",
    }, { status: 500 });
  }
}
