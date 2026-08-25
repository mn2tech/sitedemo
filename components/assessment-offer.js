"use client";

import { useState } from "react";

export default function AssessmentOffer({ auditId, demoId, sourceUrl }) {
  const [open, setOpen] = useState(false);
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
      const r = await fetch("/api/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, auditId, demoId, sourceUrl }),
      });
      const d = await r.json().catch(() => ({ error: "Could not submit — please try again." }));
      if (!r.ok) throw new Error(d.error || "Could not submit.");
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="assessment" id="assessment">
      <div className="assessment-grid">
        <div className="assessment-free">
          <div className="pill">Free</div>
          <h3>AI Review + Redesign Preview</h3>
          <p>
            Instant score, what's outdated, and a concept redesign of your
            homepage — built from your real content.
          </p>
          <ul>
            <li>Homepage review with prioritized upgrades</li>
            <li>Scrollable redesign concept</li>
            <li>Shareable links · no obligation</li>
          </ul>
        </div>

        <div className="assessment-paid">
          <div className="pill paid">Most useful next step</div>
          <h3>$99 Assessment</h3>
          <div className="price">
            $99 <span>credited toward your project</span>
          </div>
          <p>
            We'll review your results with you, prioritize what matters most,
            and map the right package. Fully credited if you move forward within
            30 days.
          </p>
          <ul>
            <li>Everything in the free package</li>
            <li>Short written priority plan from NM2TECH</li>
            <li>15-minute walkthrough call or Loom</li>
            <li>$99 credited toward Starter / Redesign Sprint</li>
          </ul>

          {done ? (
            <div className="success" style={{ marginTop: 18 }}>
              Got it — thanks! We'll reply within one business day with next
              steps and a simple payment link. — Michael, NM2TECH
            </div>
          ) : !open ? (
            <button className="btn lg" style={{ marginTop: 18 }} onClick={() => setOpen(true)}>
              Request the $99 Assessment →
            </button>
          ) : (
            <div className="assessment-form">
              <label>Name *</label>
              <input type="text" value={form.name} onChange={set("name")} />
              <label>Email *</label>
              <input type="email" value={form.email} onChange={set("email")} />
              <label>Phone</label>
              <input type="text" value={form.phone} onChange={set("phone")} />
              <label>Anything specific you want us to focus on?</label>
              <textarea value={form.message} onChange={set("message")} />
              {error && <div className="error" style={{ margin: "12px 0 0", maxWidth: "none" }}>{error}</div>}
              <button className="btn lg" style={{ marginTop: 16 }} onClick={submit} disabled={busy}>
                {busy ? "Sending…" : "Request assessment →"}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
