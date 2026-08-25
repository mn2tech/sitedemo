"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  "Reading your website…",
  "Checking mobile-friendliness and technical signals…",
  "Reviewing design, content, and calls-to-action…",
  "Scoring and writing up your report…",
];

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const timerRef = useRef(null);

  async function audit() {
    if (!url.trim() || busy) return;
    setBusy(true);
    setError("");
    setStep(0);
    timerRef.current = setInterval(
      () => setStep((s) => Math.min(s + 1, STEPS.length - 1)),
      6000
    );
    try {
      const r = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const d = await r.json().catch(() => ({
        error: "The review took too long or hit an error — please try again.",
      }));
      if (!r.ok) throw new Error(d.error || "Something went wrong.");
      router.push(`/audit/${d.slug || d.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
      clearInterval(timerRef.current);
    }
  }

  return (
    <main>
      <section className="hero wrap">
        <h1>
          Is your website <em>costing you customers</em>? Find out in 30 seconds.
        </h1>
        <p>
          Free AI review + redesign preview — what's outdated, what it's costing
          you, and what a modern version could look like. Want us to walk you
          through it? The $99 Assessment is fully credited toward your project.
          By NM2TECH, a Maryland web studio.
        </p>

        {!busy ? (
          <>
            <div className="url-form">
              <input
                type="text"
                placeholder="yourbusiness.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && audit()}
                aria-label="Your website URL"
              />
              <button className="btn lg" onClick={audit}>
                Review my site →
              </button>
            </div>
            {error && <div className="error">{error}</div>}
          </>
        ) : (
          <div className="loading" aria-live="polite">
            <div className="spinner" />
            <div className="step">{STEPS[step]}</div>
            <div className="note">
              This usually takes 20–30 seconds.
            </div>
          </div>
        )}
      </section>

      <div className="trust wrap">
        <span>Uses your real business content</span>
        <span>Nothing is published anywhere</span>
        <span>Built by a local Maryland studio</span>
      </div>

      <footer>
        © {new Date().getFullYear()} NM2TECH LLC · Olney, Maryland ·
        Redesign concepts are previews generated from publicly available website
        content and are not affiliated with the businesses shown.
      </footer>
    </main>
  );
}
