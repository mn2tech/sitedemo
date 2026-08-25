import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/supabase";
import {
  ipHash,
  validateUrl,
  fetchSite,
  extractContent,
  businessNameFrom,
} from "@/lib/scrape";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const RATE_LIMIT_PER_HOUR = 10;

// Cheap technical signals the model can't infer from stripped text
function technicalSignals(html, target) {
  const generator =
    html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']*)["']/i)?.[1] || "";
  const copyrightYears = [...html.matchAll(/(?:©|&copy;|copyright)\s*(\d{4})/gi)]
    .map((m) => Number(m[1]))
    .filter((y) => y > 1995 && y <= new Date().getFullYear());
  return {
    https: target.protocol === "https:",
    hasViewportMeta: /<meta[^>]+name=["']viewport["']/i.test(html),
    hasFavicon: /<link[^>]+rel=["'][^"']*icon[^"']*["']/i.test(html),
    hasOpenGraph: /<meta[^>]+property=["']og:/i.test(html),
    hasStructuredData: /application\/ld\+json|itemscope|schema\.org/i.test(html),
    usesTables: (html.match(/<table/gi) || []).length > 2,
    usesFontTags: /<font[\s>]/i.test(html),
    usesFlash: /\.swf|shockwave/i.test(html),
    generator,
    oldestCopyrightYear: copyrightYears.length ? Math.min(...copyrightYears) : null,
    pageSizeKb: Math.round(html.length / 1024),
  };
}

export async function POST(req) {
  try {
    const { url } = await req.json();

    const target = validateUrl(url);
    if (!target) {
      return Response.json(
        { error: "Please enter a valid public website URL." },
        { status: 400 }
      );
    }

    const supabase = db();
    const hash = ipHash(req);

    // Rate limit
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabase
      .from("audits")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", hash)
      .gte("created_at", hourAgo);
    if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return Response.json(
        { error: "Review limit reached for now — or book a free call and we'll do it live." },
        { status: 429 }
      );
    }

    const pageHtml = await fetchSite(target.href);
    if (!pageHtml) {
      return Response.json(
        { error: "Hmm, we couldn't find that website. Please check the spelling — for example, yourbusiness.com — and try again." },
        { status: 422 }
      );
    }

    const content = extractContent(pageHtml);
    if (content.text.length < 200) {
      return Response.json(
        { error: "That site doesn't have enough readable content for an automatic review (it may be image- or JavaScript-heavy). Book a free call — this one needs the human touch." },
        { status: 422 }
      );
    }

    const signals = technicalSignals(pageHtml, target);

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: `You are a senior web consultant reviewing a small business's website homepage. You are given scraped page content plus technical signals detected from the HTML.

OUTPUT: respond with ONLY valid JSON (no markdown fences, no commentary) in exactly this shape:
{
  "score": <integer 0-100, overall modern-web health; most dated small-business sites land 35-65>,
  "verdict": "<one punchy sentence summarizing the site's state, addressed to the owner>",
  "issues": [
    {
      "severity": "critical" | "major" | "minor",
      "category": "<short label like Mobile, Design, Trust, SEO, Content, Speed, Accessibility>",
      "title": "<short issue name, max 8 words>",
      "detail": "<1-2 sentences: what's wrong and why it costs them customers, in plain language>",
      "fix": "<1 sentence: the recommended upgrade>"
    }
  ],
  "working": ["<1-3 short bullets of things the site does well — be honest, find at least one>"],
  "impact": {
    "metric": "website-driven inquiries",
    "growthLow": 15,
    "growthHigh": 25,
    "why": "<2-3 sentences: why a modern redesign that fixes THEIR specific issues could lift inquiries by about 15–25% — tie reasons to the issues you listed; plain language>",
    "disclaimer": "Estimate only — not a guarantee. Actual results depend on traffic, offer, follow-up, and market."
  }
}

RULES:
- 4 to 8 issues, ordered most severe first. Only report what the evidence supports — never invent problems you cannot see in the content or signals.
- Judge from evidence: missing viewport meta = not mobile-friendly (critical). Copyright year well before today's date (provided in the input) = looks abandoned; a copyright year matching the current year is CORRECT and not an issue. No meta description = SEO gap. Wall-of-text or thin content = content issue. Missing clear call-to-action in the visible text = conversion issue. font/table/flash usage = severely dated code.
- Impact estimate: ALWAYS use growthLow 15 and growthHigh 25 (about 15–25% more website-driven inquiries). Never invent revenue dollars. Always make "why" specific to this site's issues and framed around that 15–25% band.
- Plain language for a non-technical business owner. No jargon without a quick explanation.
- Be direct but respectful — the tone of a trusted expert, not a salesperson trashing their site.`,
      messages: [
        {
          role: "user",
          content: `Review this business homepage.

Today's date: ${new Date().toISOString().slice(0, 10)}
URL: ${target.href}
Page title: ${content.title}
Meta description: ${content.metaDesc || "(none)"}
Headings found: ${content.headings.join(" | ") || "(none)"}
Nav/link labels: ${content.links.join(", ") || "(none)"}

Technical signals detected:
${JSON.stringify(signals, null, 2)}

Page text content:
${content.text}`,
        },
      ],
    });

    const raw = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim()
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/, "");

    let report;
    try {
      report = JSON.parse(raw);
    } catch {
      return Response.json(
        { error: "The review hiccuped — please try again." },
        { status: 500 }
      );
    }

    // Fixed packaging: always quote 15–25% more website-driven inquiries
    const why =
      (report.impact && typeof report.impact === "object"
        ? String(report.impact.why || "")
        : "") ||
      "A clearer design, stronger trust signals, and easier ways to contact you typically help more visitors become real inquiries.";
    report.impact = {
      metric: "website-driven inquiries",
      growthLow: 15,
      growthHigh: 25,
      why: why.slice(0, 600),
      disclaimer:
        "Estimate only — not a guarantee. Actual results depend on traffic, offer, follow-up, and market.",
    };

    const businessName = businessNameFrom(content.title, target.hostname);

    const { data: audit, error } = await supabase
      .from("audits")
      .insert({
        source_url: target.href,
        business_name: businessName,
        report,
        ip_hash: hash,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return Response.json({ id: audit.id });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Something went wrong — please try again." }, { status: 500 });
  }
}
