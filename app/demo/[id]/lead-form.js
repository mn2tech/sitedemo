"use client";

import { useState } from "react";

export default function LeadForm({ demoId, sourceUrl }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function set(k) {
    return (e) => setForm({ ...form, [k]: e.target.value });
  }

  async function submit() {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoId, sourceUrl, ...form }),
      });
      const d = await r.json().catch(() => ({ error: "Could not send — please try again." }));
      if (!r.ok) throw new Error(d.error || "Could not send.");
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="lead-card">
        <div className="success">
          Got it — thanks! I'll reach out within one business day with next
          steps and a link to keep this concept. — Michael, NM2TECH
        </div>
      </div>
    );
  }

  return (
    <div className="lead-card">
      <h3>Get this site built</h3>
      <p>
        Prefer to jump straight to a project conversation? Free 15-minute call,
        no pressure. Or start with the $99 Assessment above — credited toward
        your build.
      </p>
      <label>Name *</label>
      <input type="text" value={form.name} onChange={set("name")} />
      <label>Email *</label>
      <input type="email" value={form.email} onChange={set("email")} />
      <label>Phone</label>
      <input type="text" value={form.phone} onChange={set("phone")} />
      <label>Anything specific you want changed?</label>
      <textarea value={form.message} onChange={set("message")} />
      {error && <div className="error" style={{ margin: "14px 0 0" }}>{error}</div>}
      <div style={{ marginTop: 20 }}>
        <button className="btn lg" onClick={submit} disabled={busy}>
          {busy ? "Sending…" : "Request my free call →"}
        </button>
      </div>
    </div>
  );
}
