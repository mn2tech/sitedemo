export async function sendEmail({ to, subject, html, text, bcc, replyTo }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Email is not configured yet. Please try again later or contact us.");
  }

  const recipient = Array.isArray(to) ? to.map((e) => e.trim()).filter(Boolean) : [String(to || "").trim()];
  if (!recipient.length || !recipient.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) {
    throw new Error("Invalid recipient email address.");
  }

  // Prefer a personal From display name — helps Gmail treat it as 1:1 mail
  const rawFrom = (process.env.NOTIFY_FROM || "hello@nm2tech.com").trim() || "hello@nm2tech.com";
  const from = rawFrom.includes("<")
    ? rawFrom
    : `Michael at NM2TECH <${rawFrom}>`;
  const payload = {
    from,
    to: recipient,
    subject,
    html,
    text,
  };

  // Only BCC when explicitly requested — never silently replace the client "to"
  const bccAddr = (bcc || "").trim();
  if (bccAddr && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bccAddr)) {
    payload.bcc = [bccAddr];
  }
  if (replyTo) payload.reply_to = replyTo;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Resend error", r.status, body, { to: recipient, from });
    throw new Error(body?.message || "Could not send email — please try again.");
  }

  console.log("Resend sent", { id: body.id, to: recipient, from });
  return { id: body.id, to: recipient };
}

export function siteBase(req) {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://demo.nm2tech.com";
}
