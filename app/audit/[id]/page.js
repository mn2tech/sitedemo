import { db } from "@/lib/supabase";
import { notFound } from "next/navigation";
import RedesignCta from "./redesign-cta";
import EmailReport from "@/components/email-report";
import AssessmentOffer from "@/components/assessment-offer";
import { displayBusinessName, looksFinancialServices } from "@/lib/scrape";

export const dynamic = "force-dynamic";

const PRIORITY_ORDER = { high: 0, medium: 1, optimization: 2 };
const PRIORITY_LABEL = {
  high: "High Priority",
  medium: "Medium Priority",
  optimization: "Optimization",
};
const SEVERITY_LABEL = { critical: "Critical", major: "Major", minor: "Minor" };

function scoreTone(score) {
  if (score >= 75) return "good";
  if (score >= 50) return "mid";
  return "bad";
}

function normalizeIssue(issue) {
  const severity = issue.severity || "minor";
  const category = issue.category || "General";
  let priority = issue.priority;
  if (!["high", "medium", "optimization"].includes(priority)) {
    if (severity === "critical") priority = "high";
    else if (
      severity === "major" &&
      /conversion|trust|accessib|cta|lead/i.test(`${category} ${issue.title}`)
    )
      priority = "high";
    else if (severity === "major") priority = "medium";
    else priority = "optimization";
  }
  return { ...issue, severity, priority, category };
}

export default async function AuditPage({ params }) {
  const supabase = db();
  const { data: audit } = await supabase
    .from("audits")
    .select("id, source_url, business_name, report, created_at")
    .eq("id", params.id)
    .single();

  if (!audit) notFound();

  const businessName = displayBusinessName(audit);
  const financial = looksFinancialServices({ ...audit, business_name: businessName });
  const { score, verdict, issues = [], working = [], impact } = audit.report || {};
  const outcomes =
    Array.isArray(impact?.outcomes) && impact.outcomes.length > 0
      ? impact.outcomes
      : [
          "Increase qualified consultation requests",
          "Improve visitor engagement",
          "Reduce homepage abandonment",
          "Strengthen prospect trust",
          "Improve local and organic search visibility",
          "Increase CTA engagement",
          "Move more visitors into the consultation funnel",
        ];

  // Never surface legacy percentage-based disclaimers
  const impactDisclaimer =
    "Potential outcomes shown here are directional and are not guaranteed. Actual results should be measured through website analytics and conversion tracking.";

  const normalized = issues.map((raw) => {
    const issue = normalizeIssue(raw);
    const needsCompliance =
      issue.complianceNote ||
      (financial &&
        /testimonial|social proof|performance|client result/i.test(
          `${issue.title} ${issue.detail} ${issue.fix}`
        ));
    let fix = issue.fix || "";
    if (
      /cta|above the fold|call to action/i.test(`${issue.title} ${issue.detail}`) &&
      !/schedule a consultation|start a conversation/i.test(fix)
    ) {
      fix =
        "Add a prominent above-the-fold button such as “Schedule a Consultation” or “Start a Conversation,” visible without scrolling.";
    }
    return {
      ...issue,
      fix,
      complianceNote: needsCompliance,
      businessImpact:
        issue.businessImpact ||
        "Addressing this can improve how prospects experience and trust the site before they reach out.",
    };
  }).sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3) ||
      (a.severity === "critical" ? 0 : a.severity === "major" ? 1 : 2) -
        (b.severity === "critical" ? 0 : b.severity === "major" ? 1 : 2)
  );

  const byPriority = {
    high: normalized.filter((i) => i.priority === "high"),
    medium: normalized.filter((i) => i.priority === "medium"),
    optimization: normalized.filter((i) => i.priority === "optimization"),
  };

  const technicalSeo = normalized.filter(
    (i) => /seo/i.test(i.category) && i.seoType !== "local_content"
  );
  const localSeo = normalized.filter(
    (i) => /seo/i.test(i.category) && i.seoType === "local_content"
  );

  let hostname = "";
  try {
    hostname = new URL(audit.source_url).hostname;
  } catch {
    hostname = audit.source_url;
  }

  return (
    <main>
      <div className="demo-bar">
        <div className="wrap">
          <div className="label">
            Website Review for <strong>{businessName}</strong>
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
            <p className="score-caption">Current website score</p>
            <h1>{verdict}</h1>
            <p className="report-sub">
              Independent review of{" "}
              <a href={audit.source_url} target="_blank" rel="noopener noreferrer">
                {hostname}
              </a>
              . Score reflects the site <strong>as it is today</strong> — not
              after recommended improvements.
            </p>
          </div>
        </div>

        {working.length > 0 && (
          <div className="working">
            <h3>1. What is working today</h3>
            <ul>
              {working.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="impact">
          <h2 className="section-title">Potential Business Impact</h2>
          <p className="section-lead">
            Implementing the recommended improvements could help {businessName}:
          </p>
          <ul className="outcome-list">
            {outcomes.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
          <p className="impact-note">{impactDisclaimer}</p>
        </div>

        <div className="funnel-card">
          <h2 className="section-title">From Website Traffic to Business Growth</h2>
          <p className="section-lead">
            NM2TECH can measure the complete journey from website traffic to
            qualified consultation opportunities, allowing {businessName} to
            understand which digital improvements are producing measurable
            business value.
          </p>
          <ol className="funnel">
            {[
              "Website Visitors",
              "Engaged Visitors",
              "Consultation CTA Clicks",
              "Consultation Requests",
              "Qualified Prospects",
              "New Clients",
            ].map((step) => (
              <li key={step}>
                <span className="funnel-step">{step}</span>
                <span className="funnel-meta">Baseline data required · Tracking not yet configured</span>
              </li>
            ))}
          </ol>
        </div>

        <h2 className="section-title">2. What needs improvement</h2>
        <p className="section-lead">
          Findings are grouped by priority. Each item is an observed gap on the
          current site, with a recommended fix and expected business impact
          after implementation.
        </p>

        {["high", "medium", "optimization"].map((key) =>
          byPriority[key].length ? (
            <div className="priority-group" key={key}>
              <h3 className={`priority-heading ${key}`}>{PRIORITY_LABEL[key]}</h3>
              <div className="issues">
                {byPriority[key].map((issue, i) => (
                  <div className={`issue ${issue.severity}`} key={`${key}-${i}`}>
                    <div className="issue-top">
                      <span className={`badge ${issue.severity}`}>
                        {SEVERITY_LABEL[issue.severity] || issue.severity}
                      </span>
                      <span className="cat">{issue.category}</span>
                      <span className={`badge-priority ${key}`}>
                        {PRIORITY_LABEL[key]}
                      </span>
                      {issue.complianceNote && (
                        <span className="badge-compliance">Compliance consideration</span>
                      )}
                    </div>
                    <h3>{issue.title}</h3>
                    <p>
                      <strong>Issue:</strong> {issue.detail}
                    </p>
                    <p className="fix">
                      <strong>Recommended fix:</strong> {issue.fix}
                    </p>
                    <p className="biz-impact">
                      <strong>Expected business impact:</strong>{" "}
                      {issue.businessImpact ||
                        "Improves how prospects experience and trust the site before they reach out."}
                    </p>
                    {issue.complianceNote && (
                      <p className="compliance-note">
                        Financial-services note: testimonials, endorsements, or
                        performance-related claims should be reviewed for
                        compliance before publishing.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null
        )}

        {(technicalSeo.length > 0 || localSeo.length > 0) && (
          <div className="seo-split">
            <h2 className="section-title">SEO recommendations (clarified)</h2>
            <div className="seo-grid">
              <div>
                <h3>Technical SEO</h3>
                <p className="section-lead">
                  Meta descriptions, heading hierarchy, structured data,
                  accessibility, and page performance.
                </p>
                <ul>
                  {(technicalSeo.length
                    ? technicalSeo
                    : [{ title: "No technical SEO gaps flagged in this pass." }]
                  ).map((i, idx) => (
                    <li key={idx}>{i.title}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Local / Content SEO</h3>
                <p className="section-lead">
                  Location and service discoverability, educational content, and
                  intent-aligned pages. Ranking claims are not made without
                  search data.
                </p>
                <ul>
                  {(localSeo.length
                    ? localSeo
                    : [
                        {
                          title:
                            "Tracking required — no verified keyword rankings are included in this assessment.",
                        },
                      ]
                  ).map((i, idx) => (
                    <li key={idx}>{i.title}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {financial && (
          <div className="trust-card">
            <h2 className="section-title">Trust signals for financial advisory</h2>
            <p className="section-lead">
              Prospects often need strong trust signals before initiating
              contact. Where legally and compliantly permitted, consider:
            </p>
            <ul className="outcome-list">
              <li>Client testimonials with compliance review</li>
              <li>Advisor credentials and years of experience</li>
              <li>Professional affiliations</li>
              <li>Clear regulatory disclosures</li>
              <li>Fiduciary / value proposition messaging</li>
              <li>Media or community recognition where applicable</li>
            </ul>
            <p className="compliance-note">
              Do not publish testimonials or performance claims without
              appropriate compliance approval.
            </p>
          </div>
        )}

        <div className="measure-card">
          <h2 className="section-title">How Success Will Be Measured</h2>
          <div className="kpi-grid">
            <div>
              <h3>Visibility</h3>
              <ul>
                <li>Organic search impressions <span>Tracking Required</span></li>
                <li>Search ranking trends <span>Tracking Required</span></li>
                <li>Website visitors <span>Tracking Required</span></li>
              </ul>
            </div>
            <div>
              <h3>Engagement</h3>
              <ul>
                <li>Engaged sessions <span>Tracking Required</span></li>
                <li>Time on site <span>Tracking Required</span></li>
                <li>Key page visits <span>Tracking Required</span></li>
              </ul>
            </div>
            <div>
              <h3>Conversion</h3>
              <ul>
                <li>Consultation CTA clicks <span>Tracking Required</span></li>
                <li>Contact form submissions <span>Tracking Required</span></li>
                <li>Consultation requests <span>Tracking Required</span></li>
              </ul>
            </div>
            <div>
              <h3>Business</h3>
              <ul>
                <li>Qualified prospects <span>Tracking Required</span></li>
                <li>New clients from digital channels <span>Tracking Required</span></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="phases-card">
          <h2 className="section-title">Recommended Next Step</h2>
          <div className="phase">
            <h3>Phase 1 — Website Optimization</h3>
            <p>
              Implement the high-priority UX, SEO, accessibility, trust, and
              conversion improvements.
            </p>
          </div>
          <div className="phase">
            <h3>Phase 2 — Analytics &amp; ROI Tracking</h3>
            <p>
              Configure measurement for traffic, CTA engagement, consultation
              requests, and lead sources.
            </p>
          </div>
          <div className="phase">
            <h3>Phase 3 — AI &amp; Knowledge Intelligence</h3>
            <p>
              Explore how NM2TECH Guardian can provide {businessName} with a
              secure AI-powered knowledge layer for approved business documents,
              internal information, analytics, and controlled knowledge
              retrieval — a future opportunity after the website foundation is
              strong.
            </p>
          </div>
        </div>

        <EmailReport auditId={audit.id} />

        <AssessmentOffer auditId={audit.id} sourceUrl={audit.source_url} />

        <RedesignCta sourceUrl={audit.source_url} businessName={businessName} />

        <div className="about-assessment">
          <h2 className="section-title">About This Assessment</h2>
          <p>
            This assessment is an independent website review prepared by NM2TECH
            using publicly accessible website information. Findings and
            recommendations are intended to identify potential opportunities for
            improving usability, accessibility, search visibility, trust, and
            digital conversion. NM2TECH is not affiliated with {businessName}{" "}
            unless otherwise stated. Business-impact projections are directional
            and should be validated through analytics after implementation.
          </p>
          <p className="impact-note">
            Independent website assessment prepared by NM2TECH for {businessName}.
          </p>
        </div>
      </section>

      <footer>
        © {new Date().getFullYear()} NM2TECH LLC · Olney, Maryland · Independent
        website assessment prepared by NM2TECH for {businessName}.
      </footer>
    </main>
  );
}
