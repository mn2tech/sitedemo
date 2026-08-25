import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/supabase";
import {
  ipHash,
  validateUrl,
  fetchSite,
  extractContent,
  businessNameFrom,
} from "@/lib/scrape";

export const runtime = "nodejs";
export const maxDuration = 300; // Fluid Compute cap on Hobby; Claude can take 2-4 min at 16k tokens

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const RATE_LIMIT_PER_HOUR = 5;

export async function POST(req) {
  try {
    const { url } = await req.json();

    const target = validateUrl(url);
    if (!target) {
      return Response.json({ error: "Please enter a valid public website URL." }, { status: 400 });
    }

    const supabase = db();
    const hash = ipHash(req);

    // Rate limit
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabase
      .from("demos")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", hash)
      .gte("created_at", hourAgo);
    if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return Response.json(
        { error: "Demo limit reached for now — or just book a free call and we'll do it live." },
        { status: 429 }
      );
    }

    const pageHtml = await fetchSite(target.href);
    if (!pageHtml) {
      return Response.json(
        { error: "Hmm, we couldn't find that website. Please check the spelling — for example, yourbusiness.com — and try again." },
        { status: 422 }
      );
    }

    const content = extractContent(pageHtml);
    if (content.text.length < 200) {
      return Response.json(
        { error: "That site doesn't have enough readable content for an automatic demo (it may be image- or JavaScript-heavy). Book a free call — this one needs the human touch." },
        { status: 422 }
      );
    }

    // Generate the redesign (streaming keeps the connection alive for long outputs)
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: `You are an elite web designer producing a single-file HTML homepage redesign concept for a small business, based on scraped content from their current website.

OUTPUT: respond with ONLY a complete HTML document (<!DOCTYPE html> through </html>). No markdown fences, no commentary.

HARD REQUIREMENTS:
- Single self-contained file: embedded CSS in a <style> tag; no external assets except Google Fonts via <link>
- Fully responsive, mobile-first; visible focus states; prefers-reduced-motion respected
- Use the business's REAL content from the scrape: actual name, services, phone, hours, copy. Where a detail is missing, use tasteful generic copy — NEVER invent specific prices, credentials, or claims not present in the source
- No JavaScript needed (pure CSS is fine); placeholder hrefs (#) acceptable
- Where product/photo imagery would go, use styled placeholder divs with subtle gradients and a small label — never hotlink their images
- At the very top, include a thin banner: "Concept preview by NM2TECH · Not affiliated with or endorsed by [Business Name] · nm2tech.com"

DESIGN QUALITY BAR:
- Choose a distinctive palette and Google Font pairing that fits THIS business's industry — never default purple-gradient template aesthetics
- One memorable signature element (e.g., a spec-sheet card, editorial hero, ticker strip) appropriate to the industry
- Structure: sticky header w/ nav, strong hero with clear CTA, services/offer section, social-proof or about section, contact/hours section, footer
- Typography with real hierarchy; generous whitespace; hairline borders; consistent border radii
- It must look like a $5,000 custom design, not a template.`,
      messages: [
        {
          role: "user",
          content: `Redesign the homepage for this business.

URL: ${target.href}
Page title: ${content.title}
Meta description: ${content.metaDesc}
Headings found: ${content.headings.join(" | ")}
Nav/link labels: ${content.links.join(", ")}

Page text content:
${content.text}`,
        },
      ],
    });
    const msg = await stream.finalMessage();

    let html = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim()
      .replace(/^```html?\s*/i, "")
      .replace(/```\s*$/, "");

    if (!/<html[\s>]/i.test(html)) {
      return Response.json(
        { error: "Generation hiccuped — please try again." },
        { status: 500 }
      );
    }

    const businessName = businessNameFrom(content.title, target.hostname);

    const { data: demo, error } = await supabase
      .from("demos")
      .insert({
        source_url: target.href,
        business_name: businessName,
        html,
        ip_hash: hash,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return Response.json({ id: demo.id });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Something went wrong — please try again." }, { status: 500 });
  }
}
