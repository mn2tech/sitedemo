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

export function extractContent(html) {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const title = (s.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
  const metaDesc =
    s.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ||
    "";

  const headings = [...s.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, " ").trim())
    .filter(Boolean)
    .slice(0, 30);
  const links = [...s.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, " ").trim())
    .filter((t) => t && t.length < 60)
    .slice(0, 60);

  const text = s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 9000);

  return { title, metaDesc, headings, links, text };
}

const GENERIC_NAME = /^(home|welcome|index|homepage|main|fee|fees|only|new|best|top)$/i;

/**
 * Extract a display business name from a page title.
 * Split only on real separators (| – — or " - "), NOT bare hyphens —
 * otherwise "Fee-Only Advisor | Kendall Capital" becomes "Fee".
 */
export function businessNameFrom(title, hostname) {
  const host = String(hostname || "")
    .replace(/^www\./i, "")
    .split(".")[0];

  const parts = String(title || "")
    .split(/\s*[|–—]\s*|\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Prefer the longest non-generic segment that looks like a company name
  const candidates = parts
    .filter((p) => !GENERIC_NAME.test(p) && p.length >= 4)
    .sort((a, b) => b.length - a.length);

  // Prefer segments containing "Capital", "Partners", "Advisors", LLC, etc.
  const branded = candidates.find((p) =>
    /\b(capital|partners|advisors?|group|llc|inc|wealth|financial|associates|consulting|services)\b/i.test(
      p
    )
  );
  if (branded) return branded.replace(/\s+/g, " ").trim();

  if (candidates[0]) return candidates[0].replace(/\s+/g, " ").trim();

  if (host) {
    return host.charAt(0).toUpperCase() + host.slice(1);
  }
  return "your business";
}

/** Recover a good display name from stored audit fields (fixes legacy "Fee" rows). */
export function displayBusinessName({ business_name, source_url, report }) {
  const stored = (business_name || "").trim();
  const verdict = report?.verdict || "";
  let host = "";
  try {
    host = new URL(source_url).hostname.replace(/^www\./i, "");
  } catch {
    host = "";
  }

  const looksBroken =
    !stored ||
    stored.length < 4 ||
    GENERIC_NAME.test(stored) ||
    (host && stored.toLowerCase() === host.split(".")[0] && stored.length < 8);

  if (!looksBroken) return stored;

  // Verdict often starts with the real company name
  const fromVerdict = verdict.match(
    /^([A-Z][A-Za-z0-9&'’.]*(?:\s+[A-Z][A-Za-z0-9&’.-]*){0,5})\b/
  );
  if (fromVerdict && fromVerdict[1].length >= 4 && !GENERIC_NAME.test(fromVerdict[1])) {
    return fromVerdict[1].trim();
  }

  // Title-like recovery from domain: kendallcapital.com is imperfect; still better than "Fee"
  if (host) {
    const base = host.split(".")[0];
    // Insert spaces before likely word boundaries when possible is hard for
    // all-lowercase domains; capitalize first letter at minimum.
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
  const fromName = String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  if (fromName && fromName.length >= 3 && fromName !== "fee") return fromName;

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
