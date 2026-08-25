import { db } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { demoId, sourceUrl, name, email, phone, message } = await req.json();
    if (!name?.trim() || !email?.trim()) {
      return Response.json({ error: "Name and email are required." }, { status: 400 });
    }

    const supabase = db();
    await supabase.from("demo_leads").insert({
      demo_id: demoId || null,
      source_url: (sourceUrl || "").slice(0, 300),
      name: name.trim().slice(0, 120),
      email: email.trim().slice(0, 160),
      phone: (phone || "").trim().slice(0, 40),
      message: (message || "").trim().slice(0, 1000),
    });

    // Email yourself the lead (optional)
    if (process.env.RESEND_API_KEY && process.env.NOTIFY_TO) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.NOTIFY_FROM || "leads@yourdomain.com",
          to: process.env.NOTIFY_TO,
          subject: `SiteDemo lead: ${name} (${sourceUrl || "no url"})`,
          text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || "-"}\nSite: ${sourceUrl || "-"}\nDemo: ${demoId || "-"}\n\n${message || ""}`,
        }),
      }).catch(() => {});
    }

    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not save — please try again." }, { status: 500 });
  }
}
