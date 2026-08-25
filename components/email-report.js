"use client";

import { useState } from "react";

export default function EmailReport({ auditId, demoId }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");

  async function send() {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, auditId, demoId }),
      });
      const d = await r.json().catch(() => ({ error: "Could not send — please try again." }));
      if (!r.ok) throw new Error(d.error || "Could not send.");
      setSentTo(d.sentTo || email.trim());
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="email-card">
        <div className="success">
          Sent to <strong>{sentTo}</strong> — check that inbox (and spam) for
          your review and redesign links. You can take your time and decide if
          you want the $99 Assessment next.
        </div>
      </div>
    );
  }

  return (
    <div className="email-card">
      <h3>Email me this package</h3>
      <p>
        Get your free review and redesign links so you can think it over —
        then decide if you want to move forward.
      </p>
      <div className="email-row">
        <input
          type="text"
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Name"
        />
        <input
          type="email"
          placeholder="you@business.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          aria-label="Email"
        />
        <button className="btn" onClick={send} disabled={busy || !email.trim()}>
          {busy ? "Sending…" : "Send →"}
        </button>
      </div>
      {error && <div className="error" style={{ margin: "12px 0 0", maxWidth: "none" }}>{error}</div>}
    </div>
  );
}
