import { db } from "@/lib/supabase";
import { notFound } from "next/navigation";
import LeadForm from "./lead-form";
import EmailReport from "@/components/email-report";
import AssessmentOffer from "@/components/assessment-offer";

export const dynamic = "force-dynamic";

export default async function DemoPage({ params }) {
  const supabase = db();
  const { data: demo } = await supabase
    .from("demos")
    .select("id, source_url, business_name, html, created_at")
    .eq("id", params.id)
    .single();

  if (!demo) notFound();

  return (
    <main>
      <div className="demo-bar">
        <div className="wrap">
          <div className="label">
            Redesign concept for <strong>{demo.business_name}</strong>
          </div>
          <div className="actions">
            <a
              className="btn ghost"
              href={demo.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              View current site
            </a>
            <a className="btn" href="#get-it">
              Get this site →
            </a>
          </div>
        </div>
      </div>

      <div className="frame-wrap">
        <div className="frame-shell">
          <iframe
            className="demo"
            sandbox=""
            srcDoc={demo.html}
            title={`Redesign concept for ${demo.business_name}`}
          />
        </div>
      </div>

      <section className="pitch wrap" id="get-it">
        <h2>Like what you see? Make it real.</h2>
        <p className="sub">
          This redesign concept is free. If you want us to walk through the
          findings with you and map the right next step, start with the $99
          Assessment — fully credited toward your project. The production build
          takes about two weeks. Fixed pricing, no hourly surprises.
        </p>

        <EmailReport demoId={demo.id} />

        <AssessmentOffer
          demoId={demo.id}
          sourceUrl={demo.source_url}
        />

        <h3 className="pkgs-heading">Website packages</h3>
        <div className="pkgs">
          <div className="pkg">
            <h3>Starter Site</h3>
            <div className="price">$2,500</div>
            <div className="term">One-time · 1 week</div>
            <ul>
              <li>3–5 page custom site</li>
              <li>Mobile-first, fast-loading</li>
              <li>Contact form &amp; maps</li>
              <li>Basic SEO setup</li>
              <li>$99 assessment credited</li>
            </ul>
          </div>
          <div className="pkg feat">
            <h3>Redesign Sprint</h3>
            <div className="price">$4,500</div>
            <div className="term">One-time · 2 weeks</div>
            <ul>
              <li>Full 5–8 page rebuild</li>
              <li>Modern branding refresh</li>
              <li>All content migrated</li>
              <li>Speed &amp; SEO optimization</li>
              <li>2 rounds of revisions</li>
              <li>$99 assessment credited</li>
            </ul>
          </div>
          <div className="pkg">
            <h3>Commerce &amp; Booking</h3>
            <div className="price">from $7,500</div>
            <div className="term">Scoped per project</div>
            <ul>
              <li>Online store or booking</li>
              <li>Secure payments</li>
              <li>Staff training included</li>
              <li>$99 assessment credited</li>
            </ul>
          </div>
        </div>

        <div className="addon">
          <div>
            <h3>Add an AI chat assistant</h3>
            <p>
              Answers customer questions 24/7 from your real business info and
              captures leads straight to your inbox — like the one that probably
              brought you here.
            </p>
          </div>
          <div className="price">
            $1,500 setup
            <small>+ $75/MO WITH CARE PLAN</small>
          </div>
        </div>

        <LeadForm demoId={demo.id} sourceUrl={demo.source_url} />
      </section>

      <footer>
        © {new Date().getFullYear()} NM2TECH LLC · Olney, Maryland · This is a
        design concept generated from publicly available website content. Not
        affiliated with or endorsed by {demo.business_name}.
      </footer>
    </main>
  );
}
