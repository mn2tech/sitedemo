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

function normalizeReport(report) {
  const issues = Array.isArray(report.issues) ? report.issues : [];
  report.issues = issues.map((issue) => {
    const severity = ["critical", "major", "minor"].includes(issue.severity)
      ? issue.severity
      : "minor";
    const category = String(issue.category || "General");
    let priority = issue.priority;
    if (!["high", "medium", "optimization"].includes(priority)) {
      if (severity === "critical") priority = "high";
      else if (
        severity === "major" &&
        /conversion|trust|accessib|cta|lead/i.test(`${category} ${issue.title}`)
      )
        priority = "high";
      else if (severity === "major") priority = "medium";
      else priority = "optimization";
    }
    let seoType = issue.seoType || null;
    if (/seo/i.test(category) && !seoType) {
      seoType = /local|content|location|service page/i.test(
        `${issue.title} ${issue.detail} ${issue.fix}`
      )
        ? "local_content"
        : "technical";
    }
    return {
      ...issue,
      severity,
      priority,
      seoType,
      businessImpact: String(
        issue.businessImpact ||
          issue.detail ||
          "Improving this can strengthen the visitor experience and conversion path."
      ).slice(0, 400),
      complianceNote: Boolean(issue.complianceNote),
      fix: String(issue.fix || "").slice(0, 400),
    };
  });

  // Directional impact only — never invent percentages or ROI guarantees
  const outcomes = Array.isArray(report.impact?.outcomes)
    ? report.impact.outcomes.map((o) => String(o).slice(0, 160)).filter(Boolean).slice(0, 8)
    : [
        "Increase qualified consultation requests",
        "Improve visitor engagement",
        "Reduce homepage abandonment",
        "Strengthen prospect trust",
        "Improve local and organic search visibility",
        "Increase CTA engagement",
        "Move more visitors into the consultation funnel",
      ];

  report.impact = {
    outcomes,
    disclaimer:
      "Potential outcomes shown here are directional and are not guaranteed. Actual results should be measured through website analytics and conversion tracking.",
  };

  if (!Array.isArray(report.working)) report.working = [];
  return report;
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
        {
          error:
            "Hmm, we couldn't find that website. Please check the spelling — for example, yourbusiness.com — and try again.",
        },
        { status: 422 }
      );
    }

    const content = extractContent(pageHtml);
    if (content.text.length < 200) {
      return Response.json(
        {
          error:
            "That site doesn't have enough readable content for an automatic review (it may be image- or JavaScript-heavy). Book a free call — this one needs the human touch.",
        },
        { status: 422 }
      );
    }

    const signals = technicalSignals(pageHtml, target);
    const businessName = businessNameFrom(content.title, target.hostname);

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: `You are a senior web consultant reviewing a business homepage for NM2TECH. You receive scraped page content plus technical signals.

OUTPUT: ONLY valid JSON (no markdown fences) in this shape:
{
  "score": <integer 0-100 current website health; do not invent post-fix scores>,
  "verdict": "<one punchy sentence to the business owner about CURRENT state>",
  "issues": [
    {
      "severity": "critical" | "major" | "minor",
      "priority": "high" | "medium" | "optimization",
      "category": "<Mobile|Design|Trust|SEO|Content|Speed|Accessibility|Conversion>",
      "seoType": "technical" | "local_content" | null,
      "title": "<short issue name, max 10 words>",
      "detail": "<1-2 sentences: what's wrong TODAY and why it matters to the business>",
      "fix": "<recommended fix — for weak CTAs, suggest a concrete label like Schedule a Consultation>",
      "businessImpact": "<1 sentence expected business impact AFTER the fix — no percentages, no guaranteed ROI>",
      "complianceNote": <true if testimonials/performance claims may need compliance review — especially financial services>
    }
  ],
  "working": ["<1-3 honest strengths>"],
  "impact": {
    "outcomes": ["<up to 7 directional outcomes, no percentages>"],
    "disclaimer": "Potential outcomes shown here are directional and are not guaranteed. Actual results should be measured through website analytics and conversion tracking."
  }
}

RULES:
- 4 to 8 issues, most severe first. Only report evidence-backed findings.
- priority: high = conversion/credibility/accessibility/lead-gen; medium = SEO/metadata/structure; optimization = nice-to-have polish.
- For SEO issues set seoType to "technical" (meta, headings, schema, a11y, performance) or "local_content" (location/service pages, educational content). Else null.
- NEVER invent conversion percentages, ROI, AUM, rankings, traffic numbers, or fabricated testimonials.
- NEVER present recommendations as already implemented. Score reflects CURRENT site only.
- For financial advisory / wealth / fiduciary firms: set complianceNote true on testimonial/performance/social-proof recommendations; do not urge unverified performance claims.
- Prefer CTA copy like "Schedule a Consultation" or "Start a Conversation" when above-the-fold CTA is missing.
- Use the real business name "${businessName}" — never invent a short fragment like "Fee".
- Plain language for a business owner. Direct but respectful.`,
      messages: [
        {
          role: "user",
          content: `Review this business homepage.

Business name (use this): ${businessName}
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
      report = normalizeReport(JSON.parse(raw));
    } catch {
      return Response.json(
        { error: "The review hiccuped — please try again." },
        { status: 500 }
      );
    }

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
