import { db } from "@/lib/supabase";
import { sendEmail, siteBase } from "@/lib/email";
import { ipHash } from "@/lib/scrape";

export const runtime = "nodejs";

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req) {
  try {
    const { name, email, phone, message, auditId, demoId, sourceUrl } = await req.json();
    if (!name?.trim() || !email?.trim()) {
      return Response.json({ error: "Name and email are required." }, { status: 400 });
    }
    if (!isEmail(email.trim())) {
      return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const supabase = db();
    const base = siteBase(req);

    let auditPath = auditId || null;
    if (auditId) {
      const { data: a } = await supabase
        .from("audits")
        .select("id, slug")
        .eq("id", auditId)
        .maybeSingle();
      if (a) auditPath = a.slug || a.id;
    }

    const auditUrl = auditPath ? `${base}/audit/${auditPath}` : null;
    const demoUrl = demoId ? `${base}/demo/${demoId}` : null;

    await supabase.from("demo_leads").insert({
      demo_id: demoId || null,
      source_url: (sourceUrl || "").slice(0, 300),
      name: name.trim().slice(0, 120),
      email: email.trim().slice(0, 160),
      phone: (phone || "").trim().slice(0, 40),
      message: [
        "$99 Assessment request (credited toward project within 30 days).",
        auditUrl ? `Audit: ${auditUrl}` : "",
        demoUrl ? `Demo: ${demoUrl}` : "",
        (message || "").trim(),
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 1000),
    });

    // Notify the studio (separate from the client confirmation)
    const studio = (process.env.NOTIFY_TO || "").trim();
    if (process.env.RESEND_API_KEY && studio) {
      await sendEmail({
        to: studio,
        subject: `$99 Assessment request: ${name.trim()}`,
        replyTo: email.trim(),
        text: `New $99 Assessment request

Name: ${name.trim()}
Email: ${email.trim()}
Phone: ${phone || "-"}
Site: ${sourceUrl || "-"}
Audit: ${auditUrl || "-"}
Demo: ${demoUrl || "-"}
IP hash: ${ipHash(req)}

${message || ""}
`,
        html: `<p><strong>New $99 Assessment request</strong></p>
<p>Name: ${escapeHtml(name.trim())}<br/>
Email: ${escapeHtml(email.trim())}<br/>
Phone: ${escapeHtml(phone || "-")}<br/>
Site: ${escapeHtml(sourceUrl || "-")}</p>
<p>${auditUrl ? `<a href="${auditUrl}">Open audit</a><br/>` : ""}
${demoUrl ? `<a href="${demoUrl}">Open demo</a>` : ""}</p>
<pre style="font-family:inherit;white-space:pre-wrap;">${escapeHtml(message || "")}</pre>`,
      }).catch((e) => console.error(e));
    }

    // Confirmation to the client — always the typed email, never NOTIFY_TO
    if (process.env.RESEND_API_KEY) {
      await sendEmail({
        to: email.trim(),
        subject: "We got your $99 Assessment request — NM2TECH",
        text: `Hi ${name.trim().split(/\s+/)[0]},

Thanks for requesting the $99 Website Assessment.

What's included:
• Your free AI review + redesign concept (links below)
• A short written priority plan from NM2TECH
• A 15-minute walkthrough
• Fully credited toward your website project if you move forward within 30 days

${auditUrl ? `Your review: ${auditUrl}\n` : ""}${demoUrl ? `Your redesign concept: ${demoUrl}\n` : ""}
We'll reply within one business day with next steps and a simple payment link.

— Michael, NM2TECH
Olney, Maryland
`,
        html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.55;color:#171b1f;max-width:560px;">
<p>Hi ${escapeHtml(name.trim().split(/\s+/)[0])},</p>
<p>Thanks for requesting the <strong>$99 Website Assessment</strong>.</p>
<p><strong>What's included</strong></p>
<ul>
<li>Your free AI review + redesign concept</li>
<li>A short written priority plan from NM2TECH</li>
<li>A 15-minute walkthrough</li>
<li>Fully credited toward your website project within 30 days</li>
</ul>
<p>
${auditUrl ? `<a href="${auditUrl}">Open your review</a><br/>` : ""}
${demoUrl ? `<a href="${demoUrl}">Open your redesign concept</a>` : ""}
</p>
<p>We'll reply within one business day with next steps and a simple payment link.</p>
<p style="color:#8b949c;font-size:13px;">— Michael, NM2TECH · Olney, Maryland</p>
</div>`,
      }).catch((e) => console.error(e));
    }

    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not submit — please try again." }, { status: 500 });
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
