"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  "Reading your current website…",
  "Extracting your services, hours, and contact info…",
  "Choosing typography and a color system for your industry…",
  "Rebuilding your homepage layout…",
  "Polishing details and mobile layout…",
  "Almost there — rendering your new homepage…",
];

export default function RedesignCta({ sourceUrl, businessName }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const timerRef = useRef(null);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError("");
    setStep(0);
    timerRef.current = setInterval(
      () => setStep((s) => Math.min(s + 1, STEPS.length - 1)),
      25000
    );
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl }),
      });
      const d = await r.json().catch(() => ({
        error: "The generator took too long or hit an error — please try again.",
      }));
      if (!r.ok) throw new Error(d.error || "Something went wrong.");
      router.push(`/demo/${d.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
      clearInterval(timerRef.current);
    }
  }

  return (
    <div className="redesign-cta">
      {!busy ? (
        <>
          <h2>Now see it fixed.</h2>
          <p>
            We'll rebuild the {businessName} homepage with every issue above
            addressed — a real, scrollable design concept built from your
            actual content. Free, takes a couple of minutes.
          </p>
          <button className="btn lg" onClick={generate}>
            See my site redesigned →
          </button>
          {error && <div className="error" style={{ margin: "16px auto 0" }}>{error}</div>}
        </>
      ) : (
        <div className="loading" aria-live="polite">
          <div className="spinner" />
          <div className="step">{STEPS[step]}</div>
          <div className="note">
            This takes 2–3 minutes — a full custom homepage is being written
            from scratch. Worth the wait.
          </div>
        </div>
      )}
    </div>
  );
}
