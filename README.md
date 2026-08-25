# NM2 SiteDemo — "Paste your URL, see it redesigned"

Lead-generation app for NM2TECH's web design business. A prospect pastes their
website URL, gets a free AI-generated homepage redesign concept in ~60 seconds,
then sees your pricing and a "Get this site built" form. Leads land in Supabase
and (optionally) your inbox.

## Flow

1. `/` — landing page with URL input + staged loading messages
2. `POST /api/generate` — fetches the target site, extracts its content
   (title, headings, nav labels, body text), asks Claude to produce a
   single-file HTML redesign using the business's REAL content, stores it,
   returns a demo ID
3. `/demo/[id]` — renders the concept in a sandboxed iframe with a
   "View current site" comparison button, your three packages, the AI chatbot
   add-on, and the lead form
4. `POST /api/lead` — saves lead + optional Resend email to you

## Built-in guardrails

- **Rate limit**: 5 demos/hour per IP (hashed) — protects your API budget
- **SSRF guard**: rejects localhost/private-network URLs
- **Content check**: sites with <200 chars of readable text get a graceful
  "book a free call" fallback instead of a bad demo
- **Sandboxed iframe**: generated HTML renders with `sandbox=""` (no scripts)
- **Disclaimer**: every concept carries a "not affiliated" banner, and the
  prompt forbids inventing prices/credentials not on the source site

## Setup

1. Supabase: run `supabase/schema.sql`, grab URL + service-role key
2. `cp .env.example .env.local` and fill in values
3. `npm install && npm run dev`
4. Deploy: `npx vercel deploy --prod`, add env vars in Vercel settings

⚠️ **Vercel note**: generation takes 30–90s. `maxDuration = 120` is set on the
generate route — this needs Vercel Pro (Hobby caps at 60s with Fluid Compute;
test your typical generation time). If you hit timeouts on Hobby, the fix is
moving generation to a background job + polling, which is a v2 change.

## Costs

Each demo costs roughly $0.10–0.30 in Claude tokens (Sonnet, ~16k output).
At the 5/hour rate limit, worst case is a few dollars a day if it gets hammered.

## How to use it in outreach

Cold email: "I ran your site through our redesign tool — here's yours:
[demo link]. Took 60 seconds. The real thing takes two weeks."
You can generate the demo yourself first and send the finished link — the
`/demo/[id]` URLs are shareable and permanent.

## v2 ideas (after it produces 3 real conversations)

- Email-gated "keep this concept" delivery
- Background job + progress polling (removes the Vercel timeout constraint)
- Screenshot-based before/after card for social sharing
- Auto-detect brand colors from the source site's CSS
