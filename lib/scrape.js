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
    // Block obvious internal/loopback targets (basic SSRF guard)
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

// Fetches the target site, returns HTML string or null on failure.
// Uses a normal browser UA — many hosts (SiteGround, Cloudflare, etc.)
// return 403 to custom bot user-agents even when the site is public.
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

// Strip a page down to readable text + light structure
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

  // Pull headings, nav links, and alt text before flattening
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

// "Home | Acme Plumbing" -> "Acme Plumbing"; skips generic first segments
export function businessNameFrom(title, hostname) {
  const generic = /^(home|welcome|index|homepage|main)$/i;
  const parts = (title || "")
    .split(/[|–—-]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const good = parts.find((p) => !generic.test(p));
  return good || hostname;
}
