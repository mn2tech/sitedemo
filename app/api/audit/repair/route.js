import { db } from "@/lib/supabase";
import {
  displayBusinessName,
  looksFinancialServices,
  slugifyName,
} from "@/lib/scrape";

export const runtime = "nodejs";

/**
 * Repair legacy audits: fix broken business names (e.g. "Fee" / SEO taglines),
 * refresh pretty slugs, and normalize impact away from unsupported % claims.
 * Preserves the existing score.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { id, slug: slugKey } = body;
    if (!id && !slugKey) {
      return Response.json({ error: "Audit id or slug required." }, { status: 400 });
    }

    const supabase = db();
    let query = supabase
      .from("audits")
      .select("id, source_url, business_name, slug, report");
    query = id ? query.eq("id", id) : query.eq("slug", slugKey);
    const { data: audit, error } = await query.single();
    if (error || !audit) {
      return Response.json({ error: "Audit not found." }, { status: 404 });
    }

    const score = audit.report?.score;
    const name = displayBusinessName(audit);
    let host = "";
    try {
      host = new URL(audit.source_url).hostname;
    } catch {
      host = "";
    }
    const baseSlug = slugifyName(name, host);
    let slug = baseSlug;
    for (let n = 2; n < 50; n++) {
      const { data: existing } = await supabase
        .from("audits")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing || existing.id === audit.id) break;
      slug = `${baseSlug}-${n}`;
    }
    const financial = looksFinancialServices({ ...audit, business_name: name });

    const issues = (audit.report?.issues || []).map((issue) => {
      const severity = issue.severity || "minor";
      const category = issue.category || "General";
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

      let fix = issue.fix || "";
      if (/cta|above the fold|call to action/i.test(`${issue.title} ${issue.detail}`)) {
        if (!/schedule a consultation|start a conversation/i.test(fix)) {
          fix =
            "Add a prominent above-the-fold button such as “Schedule a Consultation” or “Start a Conversation,” visible without scrolling.";
        }
      }

      let complianceNote = Boolean(issue.complianceNote);
      if (
        financial &&
        /testimonial|social proof|client result|performance/i.test(
          `${issue.title} ${issue.detail} ${issue.fix}`
        )
      ) {
        complianceNote = true;
      }

      let seoType = issue.seoType || null;
      if (/seo/i.test(category) && !seoType) {
        seoType = /local|content|location|service/i.test(
          `${issue.title} ${issue.detail}`
        )
          ? "local_content"
          : "technical";
      }

      return {
        ...issue,
        severity,
        priority,
        fix,
        complianceNote,
        seoType,
        businessImpact:
          issue.businessImpact ||
          "Addressing this can improve how prospects experience and trust the site before they reach out.",
      };
    });

    const report = {
      ...audit.report,
      score, // preserve
      issues,
      impact: {
        outcomes: [
          "Increase qualified consultation requests",
          "Improve visitor engagement",
          "Reduce homepage abandonment",
          "Strengthen prospect trust",
          "Improve local and organic search visibility",
          "Increase CTA engagement",
          "Move more visitors into the consultation funnel",
        ],
        disclaimer:
          "Potential outcomes shown here are directional and are not guaranteed. Actual results should be measured through website analytics and conversion tracking.",
      },
    };

    const { error: upErr } = await supabase
      .from("audits")
      .update({ business_name: name, slug, report })
      .eq("id", id);
    if (upErr) throw new Error(upErr.message);

    return Response.json({ ok: true, business_name: name, slug, score });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Repair failed." }, { status: 500 });
  }
}
