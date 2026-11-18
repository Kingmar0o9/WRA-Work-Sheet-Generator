# Kit request auto-reply with a one-page overview PDF

Short design (small change). Status: waiting for Mark's approval. Not to be deployed yet.

## Why

When a teacher sends the Request kits form, they should hear back right away: a thank-you email
with a one-page PDF that shows what the kit and its web tools give them. It is a quick
promotion that keeps them interested until Mark replies in person.

## What the teacher gets

- **From:** WRA STEM Kits `<kits@wrastem.com>`. **Reply-To:** Mark's inbox (the existing
  `NOTIFY_TO` secret), so if the teacher presses Reply, it reaches Mark.
- **Subject:** Thank you for requesting a kit from WRA STEM Kits
- **Body (plain, short):** Thank you for requesting a kit from WRA STEM Kits. I got your
  request for N set(s) for School and will email you about next steps soon. Attached is a
  one-page overview of the kit and its free web tools. — Mark
- **Attachment:** `WRA-STEM-Kits-overview.pdf`, one page.

## The PDF

One page, in the site's look (DESIGN.md), with just the benefits. All claims stay inside
PRODUCT.md:

- hands-on, 3D printed plant cell kit: 12 pieces held by magnets, reusable for years
- one click builds a new 3-page worksheet and answer key, ready to print
- every question comes from a fixed bank a teacher can review
- labeling drawings come from the kit's own 3D models
- designed to align with NGSS MS-LS1-2; works offline on school devices
- Standards AI for lesson planning
- wrastem.com link

No classroom results, testimonials, endorsements, or "NGSS certified".
It is made from an HTML source by a small script (Chromium "print to PDF"), so it can be
rebuilt when the wording changes. The PDF is bundled into the Worker, so sending it
needs no extra download.

## Approaches considered

| | Cost | Trade-off |
|---|---|---|
| Cloudflare Email Sending | $5/month (Workers Paid only) | Cleanest, but not free. **Ruled out: must stay free.** |
| **Resend (free tier)** | Free: 100 emails/day, 3,000/month | New account, one API key and a few DNS records for wrastem.com. **Picked.** |
| Gmail Apps Script auto-reply | Free | Sends from Mark's personal Gmail, lives outside the repo. |

## How it works

In `worker/src/index.js`, after the request email goes to Mark, the Worker calls the
Resend API (`api.resend.com/emails`) with the thank-you message and the PDF.

- **Off until launch:** if the `RESEND_API_KEY` secret is not set, the auto-reply is
  skipped. Deploying the code without the key changes nothing teachers see.
- **Not sent when the request looks fake:** if the "Who sent this" verdict is *Check this
  one* (throwaway address, or a domain that can't receive mail), no auto-reply is sent.
  This stops people from using the form to send email to someone else's address. The
  existing limit of 3 requests a minute per visitor still applies.
- **Never blocks a request:** if Resend fails or the 100-a-day limit is hit, the teacher
  still sees "Thank you", Mark still gets the request, and the failure goes to the Logs.
  Mark's request email gets one line: "Auto-reply: sent / skipped (reason) / failed".
- The thank-you page adds "Check your inbox for a confirmation email" only when the
  server says the auto-reply was actually sent.

## Also changes

- `privacy/index.html` section 6: add Resend as the service that sends the confirmation
  email (it receives the teacher's email address, name and school). Update its effective
  date.
- `worker/README.md`: setup steps for launch.
- `worker/test/security.test.mjs`: tests for sent, skipped with no key, skipped for *Check
  this one*, and Resend failing without breaking the request.

## Launch steps (Mark, later, about 10 minutes; not part of this work)

1. Make a free Resend account, add the domain `wrastem.com`, and add the DNS records it
   shows in Cloudflare DNS. They go on a `send.` subdomain, so the existing email routing
   is not affected.
2. `npx wrangler secret put RESEND_API_KEY`, then `npm run deploy` in `worker/`.

## Non-goals

- No paid services. No mailing list, follow-ups, or tracking of opens and clicks.
- Nothing is deployed, and no DNS or account changes are made, as part of this work.

## Left to the builder

The exact PDF layout and imagery (a kit render or worksheet preview), within DESIGN.md, and the
exact wording of the thank-you email within the lines above.
