import { db } from "@/lib/supabase";
import { notFound } from "next/navigation";
import RedesignCta from "./redesign-cta";
import EmailReport from "@/components/email-report";
import AssessmentOffer from "@/components/assessment-offer";

export const dynamic = "force-dynamic";

const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2 };
const SEVERITY_LABEL = { critical: "Critical", major: "Major", minor: "Minor" };

function scoreTone(score) {
  if (score >= 75) return "good";
  if (score >= 50) return "mid";
  return "bad";
}

export default async function AuditPage({ params }) {
  const supabase = db();
  const { data: audit } = await supabase
    .from("audits")
    .select("id, source_url, business_name, report, created_at")
    .eq("id", params.id)
    .single();

  if (!audit) notFound();

  const { score, verdict, issues = [], working = [], impact } = audit.report || {};
  const sorted = [...issues].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
  );
  const criticalCount = issues.filter((i) => i.severity === "critical").length;

  return (
    <main>
      <div className="demo-bar">
        <div className="wrap">
          <div className="label">
            Website review for <strong>{audit.business_name}</strong>
          </div>
          <div className="actions">
            <a
              className="btn ghost"
              href={audit.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              View the site
            </a>
          </div>
        </div>
      </div>

      <section className="report wrap">
        <div className="report-head">
          <div className={`score-ring ${scoreTone(score)}`}>
            <div className="score-num">{score}</div>
            <div className="score-label">/ 100</div>
          </div>
          <div>
            <h1>{verdict}</h1>
            <p className="report-sub">
              We reviewed the homepage at{" "}
              <a href={audit.source_url} target="_blank" rel="noopener noreferrer">
                {new URL(audit.source_url).hostname}
              </a>{" "}
              and found <strong>{issues.length} issues</strong>
              {criticalCount > 0 && <> — {criticalCount} critical</>}.
            </p>
          </div>
        </div>

        <div className="issues">
          {sorted.map((issue, i) => (
            <div className={`issue ${issue.severity}`} key={i}>
              <div className="issue-top">
                <span className={`badge ${issue.severity}`}>
                  {SEVERITY_LABEL[issue.severity] || issue.severity}
                </span>
                <span className="cat">{issue.category}</span>
              </div>
              <h3>{issue.title}</h3>
              <p>{issue.detail}</p>
              <p className="fix">
                <strong>Upgrade:</strong> {issue.fix}
              </p>
            </div>
          ))}
        </div>

        {working.length > 0 && (
          <div className="working">
            <h3>What's already working</h3>
            <ul>
              {working.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {impact?.growthLow != null && impact?.growthHigh != null && (
          <div className="impact">
            <div className="impact-label">If you ship the redesign</div>
            <div className="impact-range">
              ~{impact.growthLow}–{impact.growthHigh}%
              <span> more {impact.metric || "website-driven inquiries"}</span>
            </div>
            {impact.why && <p>{impact.why}</p>}
            <p className="impact-note">
              {impact.disclaimer ||
                "Estimate only — not a guarantee. Actual results depend on traffic, offer, follow-up, and market."}
            </p>
          </div>
        )}

        <EmailReport auditId={audit.id} />

        <AssessmentOffer
          auditId={audit.id}
          sourceUrl={audit.source_url}
        />

        <RedesignCta sourceUrl={audit.source_url} businessName={audit.business_name} />
      </section>

      <footer>
        © {new Date().getFullYear()} NM2TECH LLC · Olney, Maryland · This review
        was generated automatically from publicly available website content. Not
        affiliated with or endorsed by {audit.business_name}.
      </footer>
    </main>
  );
}
