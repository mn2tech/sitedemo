import crypto from "crypto";

export function ipHash(req) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

// Returns a URL object or null (invalid / blocked target)
export function validateUrl(url) {
  try {
    const target = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (!["http:", "https:"].includes(target.protocol)) return null;
    if (
      /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|\[::1\])/.test(
        target.hostname
      )
    )
      return null;
    return target;
  } catch {
    return null;
  }
}

export async function fetchSite(href) {
  try {
    const r = await fetch(href, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.text()).slice(0, 400_000);
  } catch {
    return null;
  }
}

/** Decode common HTML entities from scraped titles/text. */
export function decodeHtmlEntities(str) {
  return String(str || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    })
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    });
}

function compactAlnum(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function extractContent(html) {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const title = decodeHtmlEntities(
    (s.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
  const metaDesc = decodeHtmlEntities(
    s.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ||
      ""
  ).trim();

  const headings = [...s.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((m) =>
      decodeHtmlEntities(m[1].replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .slice(0, 30);
  const links = [...s.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) =>
      decodeHtmlEntities(m[1].replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((t) => t && t.length < 60)
    .slice(0, 60);

  const text = decodeHtmlEntities(s.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 9000);

  return { title, metaDesc, headings, links, text };
}

const GENERIC_NAME = /^(home|welcome|index|homepage|main|fee|fees|only|new|best|top)$/i;

function nameScore(part, hostCompact) {
  const p = part.replace(/\s+/g, " ").trim();
  const words = p.split(/\s+/).filter(Boolean).length;
  const compact = compactAlnum(p);
  let score = 0;

  // Domain match wins: "Kendall Capital" ↔ kendallcapital.com
  if (
    hostCompact &&
    compact.length >= 4 &&
    (hostCompact === compact ||
      hostCompact.includes(compact) ||
      compact.includes(hostCompact))
  ) {
    score += 100;
  }

  if (/\b(capital|partners|advisors?|group|llc|inc|associates|consulting)\b/i.test(p)) {
    score += 40;
  }
  if (/\b(wealth|financial|services|management)\b/i.test(p)) score += 8;

  if (words <= 3) score += 25;
  else if (words <= 4) score += 15;
  else if (words > 6) score -= 45;

  // Marketing taglines in titles — deprioritize
  if (/^fee[- ]?only/i.test(p)) score -= 55;
  if (/\badvice\b/i.test(p) && words > 3) score -= 25;

  return score;
}

/**
 * Extract a display business name from a page title.
 * Split only on real separators (| – — or " - "), NOT bare hyphens —
 * otherwise "Fee-Only Advisor | Kendall Capital" becomes "Fee".
 * Prefer the brand over the SEO tagline when both appear.
 */
export function businessNameFrom(title, hostname) {
  const host = String(hostname || "")
    .replace(/^www\./i, "")
    .split(".")[0];
  const hostCompact = compactAlnum(host);

  const parts = decodeHtmlEntities(title)
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s*[|–—]\s*|\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const candidates = parts.filter((p) => !GENERIC_NAME.test(p) && p.length >= 4);
  if (candidates.length) {
    candidates.sort(
      (a, b) =>
        nameScore(b, hostCompact) - nameScore(a, hostCompact) || a.length - b.length
    );
    return candidates[0].replace(/\s+/g, " ").trim();
  }

  if (host) {
    return host.charAt(0).toUpperCase() + host.slice(1);
  }
  return "your business";
}

/** Recover a good display name from stored audit fields (fixes legacy "Fee" / tagline rows). */
export function displayBusinessName({ business_name, source_url, report }) {
  const storedRaw = (business_name || "").trim();
  const stored = decodeHtmlEntities(storedRaw).replace(/\s+/g, " ").trim();
  const verdict = report?.verdict || "";
  let host = "";
  try {
    host = new URL(source_url).hostname.replace(/^www\./i, "");
  } catch {
    host = "";
  }
  const hostCompact = compactAlnum(host.split(".")[0]);
  const wordCount = stored.split(/\s+/).filter(Boolean).length;

  const looksBroken =
    !stored ||
    stored.length < 4 ||
    GENERIC_NAME.test(stored) ||
    /&(?:amp|lt|gt|quot|apos|#)/i.test(storedRaw) ||
    wordCount > 6 ||
    /^fee[- ]?only/i.test(stored) ||
    (hostCompact &&
      compactAlnum(stored) !== hostCompact &&
      wordCount > 4 &&
      /\b(advice|fiduciary|wealth management)\b/i.test(stored)) ||
    (host && stored.toLowerCase() === host.split(".")[0] && stored.length < 8);

  if (!looksBroken) return stored;

  // Prefer a title-style brand that matches the domain when present in verdict
  const fromVerdict = verdict.match(
    /^([A-Z][A-Za-z0-9&'’.]*(?:\s+[A-Z][A-Za-z0-9&’.-]*){0,5})\b/
  );
  if (fromVerdict && fromVerdict[1].length >= 4 && !GENERIC_NAME.test(fromVerdict[1])) {
    return decodeHtmlEntities(fromVerdict[1]).trim();
  }

  if (host) {
    const base = host.split(".")[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  return stored || "your business";
}

export function looksFinancialServices({ source_url, report, business_name }) {
  const blob = [
    business_name,
    source_url,
    report?.verdict,
    ...(report?.issues || []).map((i) => `${i.title} ${i.detail} ${i.category}`),
    ...(report?.working || []),
  ]
    .join(" ")
    .toLowerCase();
  return /\b(financial|advisor|wealth|fiduciary|investment|capital|retirement|cfa|cfp|ria|broker)\b/.test(
    blob
  );
}

/** "Kendall Capital" / "kendallcapital.com" -> "kendall-capital" */
export function slugifyName(name, hostname = "") {
  const fromName = decodeHtmlEntities(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 60);

  if (
    fromName &&
    fromName.length >= 3 &&
    fromName !== "fee" &&
    !fromName.startsWith("fee-only")
  )
    return fromName;

  const host = String(hostname || "")
    .replace(/^www\./i, "")
    .split(".")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return host || "website-review";
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}
