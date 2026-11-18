# Kit Request Thank-You Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a teacher sends the Request kits form, the Worker emails them a thank-you with the kit's benefits inside the email, through Resend's free tier, and stays off until a `RESEND_API_KEY` secret exists.

**Architecture:** A new module `worker/src/thank-you.js` builds the email (subject, HTML, plain text) and sends it with one `fetch` to the Resend API. `purchase()` in `worker/src/index.js` calls it before emailing Mark, adds the outcome to Mark's email, and answers the page with `confirmation: true` when it was sent. The two email pictures are served from wrastem.com.

**Tech Stack:** Cloudflare Worker (plain ES modules, bundled by wrangler), Resend HTTP API, node:test, static HTML/CSS/older JS on GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-18-kit-request-auto-reply-design.md`

## Global Constraints

- Free only. Nothing is deployed, and no DNS or account changes are made.
- Subject: `Thank you for requesting a kit from WRA STEM Kits`. From: `WRA STEM Kits <kits@wrastem.com>` (`env.FROM_ADDRESS` overrides the address, as for Mark's email). Reply-To: `env.NOTIFY_TO`.
- The email copy is the approved sample in the spec, with no testing-status line. Never claim classroom results, testimonials, endorsements or "NGSS certified".
- Email look: one solid background (#F6F7F2 light, #000000 under `prefers-color-scheme: dark`), no coloured box behind text, tables plus inline styles, Helvetica/Arial, max width 560px.
- Pictures: `https://wrastem.com/assets/img/email/logo.png` (green badge, 440x92) and `https://wrastem.com/assets/img/email/kit.png` (transparent, 720 wide), each with alt text.
- `assets/js/` stays older JavaScript (var, function, no arrow functions). Bump `purchase.js?v=` when it changes.
- Privacy Policy must name Resend and get a new effective date (November 18, 2026).

## Review Focus

- A name or school containing HTML (`<b>`, `"`, `&`) shows as text in the thank-you, never as markup.
- No name given: the greeting is `Hi,`; one set reads `1 set`, more read `N sets`.
- Resend answers with an error (for example 429 when the 100-a-day limit is hit) or the call throws or times out: counted as `failed`, request still answered `{ ok: true }` and Mark still emailed.
- A request marked *Check this one* never calls Resend.
- No `RESEND_API_KEY`: no call to Resend, page reply stays exactly `{ ok: true }`.

---

### Task 1: The email itself (`thank-you.js`)

**Files:**
- Create: `worker/src/thank-you.js`
- Create: `assets/img/email/logo.png`, `assets/img/email/kit.png` (from the approved sample: logo-on-green cropped to 440x92; `assets/img/cell-assembled.webp` cropped to the cell and saved as a 720-wide transparent PNG)
- Test: `worker/test/security.test.mjs`

**Interfaces:**
- Produces: `thankYouEmail({ name, sets, school }) -> { subject, html, text }` and `async sendThankYou(env, to, { name, sets, school }) -> 'sent' | 'skipped_no_key' | 'failed'` (named exports). `sendThankYou` POSTs JSON `{ from, to: [to], reply_to, subject, html, text }` to `https://api.resend.com/emails` with `Authorization: Bearer ${env.RESEND_API_KEY}`, 8 s timeout; any non-2xx or throw is `failed` and is logged as `{ thank_you_error }`.

- [ ] **Step 1: Write the failing tests** (they exercise it through `/purchase`, see Task 2; the stub `fetch` records calls to `api.resend.com` in `resend.sent` and answers `resend.status`, default 200).
- [ ] **Step 2: Implement `thank-you.js`** with the approved copy; names and school go through the same `esc` as Mark's email (copy the one-line helper into the module).
- [ ] **Step 3: Commit** with Task 2.

### Task 2: Wire it into `/purchase`, the page and the docs

**Files:**
- Modify: `worker/src/index.js` (`purchase()`), `worker/wrangler.jsonc` (comment on the secret), `worker/README.md` (launch steps)
- Modify: `purchase/index.html` (hidden `#confirm` line in `.thanks`, bump `purchase.js?v=20261118a`), `assets/js/purchase.js` (unhide `#confirm` when `res.body.confirmation`)
- Modify: `privacy/index.html` (Resend in section 6 and the summary; effective date November 18, 2026)
- Test: `worker/test/security.test.mjs`

**Interfaces:**
- Consumes: `sendThankYou` from Task 1.
- Produces: `/purchase` replies `{ ok: true, confirmation: true }` only when the thank-you was sent; Mark's email gets the row `['Thank-you email', 'sent' | 'not sent: the server has no Resend key yet' | 'not sent: this request is marked "check this one"' | 'failed (see the Logs)']`; the log line gains `thank_you`.

- [ ] **Step 1: Write the failing tests**

```js
test('with a Resend key, the teacher gets one thank-you email and the page is told', ...)
  // env RESEND_API_KEY 'test-key'; resend.sent.length === 1; to ['ada@school.org']; reply_to 'owner@example.org';
  // subject 'Thank you for requesting a kit from WRA STEM Kits'; html includes '2 sets' and 'Hudson Middle School';
  // reply deepEqual { ok: true, confirmation: true }; Mark's html matches /Thank-you email.*sent/
test('without a Resend key nothing is sent to the teacher and the reply is unchanged', ...)
  // resend.sent.length === 0; reply deepEqual { ok: true }
test('a request marked "check this one" gets no thank-you email', ...)
  // throwaway address (mailinator.com) with key set; resend.sent.length === 0
test('a name or school with HTML in it is shown as text in the thank-you', ...)
  // name 'Ada <b>Bold</b> & "Co"', school 'Hudson <i>MS</i>'; html has no '<b>Bold' or '<i>MS'; has '&lt;b&gt;'
test('no name means a plain "Hi,"; one set is "1 set"', ...)
test('when Resend fails or is out of emails, the request still goes through', ...)
  // resend.status 429 and resend.status 'throw'; reply { ok: true }; env.sent.length === 1; Mark's html matches /failed/
```

- [ ] **Step 2: Run `npm test` in `worker/`** — Expected: the new tests FAIL.
- [ ] **Step 3: Implement** in `purchase()`: after `checkSender`, `thankYou = check.verdict === 'check' ? 'skipped_check' : await sendThankYou(env, email, { name, sets, school })`; add the row to `who`; send Mark's email; reply `{ ok: true, ...(thankYou === 'sent' ? { confirmation: true } : {}) }`.
- [ ] **Step 4: Run `npm test`** — Expected: all pass.
- [ ] **Step 5: Page, privacy, README changes**; check the purchase page in Chromium at phone width with a stubbed endpoint that returns `confirmation: true`.
- [ ] **Step 6: Commit and push** to `claude/brave-gates-ejzltm`.
