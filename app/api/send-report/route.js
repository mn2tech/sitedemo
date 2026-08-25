import { db } from "@/lib/supabase";
import { sendEmail, siteBase } from "@/lib/email";
import { ipHash } from "@/lib/scrape";

export const runtime = "nodejs";

const RATE_LIMIT_PER_HOUR = 5;

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req) {
  try {
    const { name, email, auditId, demoId } = await req.json();
    if (!email?.trim() || !isEmail(email.trim())) {
      return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (!auditId && !demoId) {
      return Response.json({ error: "Nothing to send." }, { status: 400 });
    }

    const supabase = db();
    const hash = ipHash(req);
    try {
      const hourAgo = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await supabase
        .from("report_sends")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", hash)
        .gte("created_at", hourAgo);
      if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
        return Response.json(
          { error: "Email limit reached for now — please try again later." },
          { status: 429 }
        );
      }
    } catch (e) {
      console.warn("report_sends rate limit skipped:", e.message);
    }

    let audit = null;
    let demo = null;
    if (auditId) {
      const { data } = await supabase
        .from("audits")
        .select("id, source_url, business_name, report")
        .eq("id", auditId)
        .single();
      audit = data;
    }
    if (demoId) {
      const { data } = await supabase
        .from("demos")
        .select("id, source_url, business_name")
        .eq("id", demoId)
        .single();
      demo = data;
    }
    if (!audit && !demo) {
      return Response.json({ error: "Report not found." }, { status: 404 });
    }

    const businessName = audit?.business_name || demo?.business_name || "your business";
    const sourceUrl = audit?.source_url || demo?.source_url || "";
    const score = audit?.report?.score;
    const verdict = audit?.report?.verdict;
    const impact = audit?.report?.impact;
    const topIssues = (audit?.report?.issues || [])
      .slice(0, 3)
      .map((i) => `• ${i.title}`)
      .join("\n");

    const base = siteBase(req);
    const auditUrl = audit ? `${base}/audit/${audit.id}` : null;
    const demoUrl = demo ? `${base}/demo/${demo.id}` : null;
    const greeting = name?.trim() ? `Hi ${name.trim().split(/\s+/)[0]},` : "Hi,";

    const impactText =
      impact?.growthLow != null && impact?.growthHigh != null
        ? `\nIf you update the site, businesses in a similar spot often see about ${impact.growthLow}–${impact.growthHigh}% more ${impact.metric || "website-driven inquiries"}.\n${impact.why ? `${impact.why}\n` : ""}(That's an estimate, not a guarantee.)\n`
        : "";

    const subject = `Your website review for ${businessName}${score != null ? ` — ${score}/100` : ""}`;
    const text = `${greeting}

I finished the free website review you requested for ${businessName}.

${score != null ? `Score: ${score}/100\n` : ""}${verdict ? `${verdict}\n` : ""}${impactText}
${topIssues ? `Top issues I flagged:\n${topIssues}\n` : ""}
${auditUrl ? `Full review:\n${auditUrl}\n` : ""}${demoUrl ? `\nRedesign concept:\n${demoUrl}\n` : ""}
If you'd like, I can walk you through this on a short call ($99 Assessment — credited toward a project if you move forward). Just reply to this email.

Michael
NM2TECH · Olney, Maryland
`;

    // Keep HTML light and personal — heavy promo layouts get filed under Promotions
    const html = `
      <div style="font-family:Georgia,Times,serif;font-size:16px;line-height:1.6;color:#222;max-width:560px;">
        <p>${greeting}</p>
        <p>I finished the free website review you requested for <strong>${escapeHtml(businessName)}</strong>.</p>
        ${score != null ? `<p>Score: <strong>${score}/100</strong></p>` : ""}
        ${verdict ? `<p>${escapeHtml(verdict)}</p>` : ""}
        ${
          impact?.growthLow != null && impact?.growthHigh != null
            ? `<p>If you update the site, businesses in a similar spot often see about <strong>${impact.growthLow}–${impact.growthHigh}%</strong> more ${escapeHtml(impact.metric || "website-driven inquiries")}.${impact.why ? ` ${escapeHtml(impact.why)}` : ""} <em>(Estimate only — not a guarantee.)</em></p>`
            : ""
        }
        ${topIssues ? `<p><strong>Top issues I flagged:</strong><br/>${escapeHtml(topIssues).replace(/\n/g, "<br/>")}</p>` : ""}
        <p>
          ${auditUrl ? `Full review: <a href="${auditUrl}">${auditUrl}</a><br/>` : ""}
          ${demoUrl ? `Redesign concept: <a href="${demoUrl}">${demoUrl}</a>` : ""}
        </p>
        <p>If you'd like, I can walk you through this on a short call ($99 Assessment — credited toward a project if you move forward). Just reply to this email.</p>
        <p>Michael<br/>NM2TECH · Olney, Maryland</p>
      </div>
    `;

    const clientEmail = email.trim().toLowerCase();
    await sendEmail({
      to: clientEmail,
      subject,
      html,
      text,
      // Do NOT BCC here — client must be the primary recipient.
      // Studio gets a separate copy below if NOTIFY_TO is set.
    });

    const studio = (process.env.NOTIFY_TO || "").trim().toLowerCase();
    if (studio && studio !== clientEmail) {
      await sendEmail({
        to: studio,
        subject: `[Copy] ${subject}`,
        text: `Studio copy — original sent to ${clientEmail}\n\n${text}`,
        html: `<p style="font-size:13px;color:#666;">Studio copy — original sent to <strong>${escapeHtml(clientEmail)}</strong></p>${html}`,
        replyTo: clientEmail,
      }).catch((e) => console.warn("studio copy failed:", e.message));
    }

    await supabase
      .from("report_sends")
      .insert({
        audit_id: audit?.id || null,
        demo_id: demo?.id || null,
        source_url: sourceUrl.slice(0, 300),
        name: (name || "").trim().slice(0, 120),
        email: clientEmail.slice(0, 160),
        ip_hash: hash,
      })
      .then(({ error }) => {
        if (error) console.warn("report_sends insert:", error.message);
      });

    // Also store as a soft lead
    await supabase
      .from("demo_leads")
      .insert({
        demo_id: demo?.id || null,
        source_url: sourceUrl.slice(0, 300),
        name: (name || "Email report").trim().slice(0, 120) || "Email report",
        email: clientEmail.slice(0, 160),
        message: `Requested emailed report.${audit ? ` Audit: ${audit.id}.` : ""}${demo ? ` Demo: ${demo.id}.` : ""}`,
      })
      .then(({ error }) => {
        if (error) console.warn("demo_leads insert:", error.message);
      });

    return Response.json({ ok: true, sentTo: clientEmail });
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: e.message || "Could not send — please try again." },
      { status: 500 }
    );
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
