# Kit request thank-you email

Short design (small change). Status: waiting for Mark's approval. Not to be deployed yet.

## Why

When a teacher sends the Request kits form, they should hear back right away with a thank-you
email that also shows what the kit and its web tools give them. It is a quick promotion that
keeps them interested until Mark replies in person.

## What the teacher gets

One email with the promotion inside it (an HTML email, no PDF attachment). Mark approved the
look from samples sent to his inbox on 2026-11-18.

- **From:** WRA STEM Kits `<kits@wrastem.com>`. **Reply-To:** Mark's inbox (the existing
  `NOTIFY_TO` secret), so pressing Reply reaches Mark.
- **Subject:** Thank you for requesting a kit from WRA STEM Kits
- **Top:** WRA STEM Kits logo badge, "Thank you for requesting a kit!", then "Hi [name], I got
  your request for [N set(s)] of the plant cell kit for [school]. I'll email you about next
  steps soon." With no name given: "Hi,". Then a picture of the kit.
- **What you get:** "A plant cell students can hold." and 9 ruled rows: 12 pieces, reusable
  for years, take it apart, one-click worksheets, a fixed question bank, drawings from the
  kit, made for the standards (designed to align with NGSS MS-LS1-2), works offline,
  Standards AI.
- **Button:** "See the kit in 3D" (wrastem.com), and a link to the worksheet generator.
- **Sign-off:** Mark, WRA STEM Kits, a student project at Western Reserve Academy. Small print:
  why they got this one email (no mailing list), and the NGSS trademark note the site uses.
- A plain-text copy of the same words goes with it.

Mark's call: the email leaves out the project's testing status (not yet tested with students,
teacher review to come). It still makes no false claims: no classroom results, testimonials,
endorsements or "NGSS certified".

## How it must look

- One solid background, no coloured boxes behind text. Gmail's iPhone dark mode recolours
  coloured boxes and flips light text to dark, which made the first sample unreadable.
- Light mode: the site's paper colour with dark ink text. Dark mode: black with white text
  (Apple Mail and Outlook through a `prefers-color-scheme` rule; Gmail darkens it itself).
- The logo is the green badge with white letters, readable on black or white; the kit
  picture is a transparent PNG.
- Built for email apps: tables for layout, styles inline, Helvetica/Arial (no web font),
  PNG images, fits a phone screen without scrolling sideways.
- Pictures load from wrastem.com (`assets/img/email/`), so each email stays small. Each has
  alt text so the email still reads when an app hides pictures.

## Approaches considered (how it is sent)

| | Cost | Trade-off |
|---|---|---|
| Cloudflare Email Sending | $5/month (Workers Paid only) | Cleanest, but not free. **Ruled out: must stay free.** |
| **Resend (free tier)** | Free: 100 emails/day, 3,000/month | New account, one API key and a few DNS records for wrastem.com. **Picked.** |
| Gmail Apps Script auto-reply | Free | Sends from Mark's personal Gmail, lives outside the repo. |

Also dropped: a PDF attachment (Mark preferred the promotion inside the email).

## How it works

In `worker/src/index.js`, after the request email goes to Mark, the Worker calls the
Resend API (`api.resend.com/emails`) with the thank-you email. The teacher's name and school
are escaped before they go into the HTML.

- **Off until launch:** if the `RESEND_API_KEY` secret is not set, the thank-you is skipped.
  Deploying the code without the key changes nothing teachers see.
- **Not sent when the request looks fake:** if the "Who sent this" verdict is *Check this
  one* (throwaway address, or a domain that can't receive mail), no thank-you is sent. This
  stops people using the form to send email to someone else's address. The existing limit
  of 3 requests a minute per visitor still applies.
- **Never blocks a request:** if Resend fails or the 100-a-day limit is hit, the teacher
  still sees "Thank you", Mark still gets the request, and the failure goes to the Logs.
  Mark's request email gets one line: "Thank-you email: sent / skipped (reason) / failed".
- The form's thank-you page adds "Check your inbox for a confirmation email" only when the
  server says it was actually sent.

## Also changes

- `assets/img/email/`: the logo badge and kit picture the email loads.
- `privacy/index.html` section 6: add Resend as the service that sends the confirmation
  email (it receives the teacher's email address, name and school). Update its effective
  date.
- `worker/README.md`: launch steps.
- `worker/test/security.test.mjs`: tests for sent, skipped with no key, skipped for *Check
  this one*, Resend failing without breaking the request, and a name or school containing
  HTML being shown as text.

## Launch steps (Mark, later, about 10 minutes; not part of this work)

1. Merge the pull request (puts the email pictures and page changes on wrastem.com).
2. Make a free Resend account, add the domain `wrastem.com`, and add the DNS records it
   shows in Cloudflare DNS. They go on a `send.` subdomain, so the existing email routing
   is not affected.
3. `npx wrangler secret put RESEND_API_KEY`, then `npm run deploy` in `worker/`.
4. Send the Request kits form to yourself and check the email on your phone.

## Non-goals

- No paid services. No mailing list, follow-ups, or tracking of opens and clicks.
- Nothing is deployed, and no DNS or account changes are made, as part of this work.

## Left to the builder

Small wording and spacing changes within the approved sample.
