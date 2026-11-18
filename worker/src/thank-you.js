// The thank-you email a teacher gets right after sending the Request kits form.
// It is sent through Resend's free plan (100 emails a day), because Cloudflare's free plan can
// only email addresses in this account. It stays off until the RESEND_API_KEY secret is set:
//   npx wrangler secret put RESEND_API_KEY
// The look was approved from samples in Mark's inbox. It keeps one plain background with no
// coloured box behind any text, because Gmail's iPhone dark mode recolours boxes and flips
// light text to dark. Phones in dark mode show it black with white text.

const RESEND_URL = 'https://api.resend.com/emails';
const SUBJECT = 'Thank you for requesting a kit from WRA STEM Kits';
const IMG = 'https://wrastem.com/assets/img/email/';

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// What the kit gives a teacher. Plain claims only: never classroom results, endorsements or
// "NGSS certified" (see PRODUCT.md). [title, text]; the HTML versions may use entities.
const BENEFITS = [
  ['12 pieces', '11 cell structures plus the nucleolus, custom-designed and 3D printed. Magnets hold each one in its slot.'],
  ['Reusable for years', 'Nothing gets used up, so one kit serves class after class.'],
  ['Take it apart', 'Students lift each part out, see where it sits, and put the cell back together.'],
  ['One-click worksheets', 'A new 3-page worksheet and its answer key, ready to print or save as PDF.'],
  ['A fixed question bank', 'Every question comes from a set bank of 43 you can review, never made up on the spot.'],
  ['Drawings from the kit', 'The labeling drawings are made from the kit’s own 3D models, so they match what students hold.'],
  ['Made for the standards', 'Designed to align with NGSS* MS-LS1-2, for grades 6–8.'],
  ['Works offline', 'The worksheet tool is made to run on school iPads and Chromebooks, even without internet.'],
  ['Standards AI', 'A teaching assistant for lesson planning that answers in plain words and shows the exact spot in each standard.'],
];
const NGSS_NOTE = '*Next Generation Science Standards is a registered trademark of WestEd. Neither WestEd nor the lead states and partners that developed the Next Generation Science Standards were involved in the production of this product, and do not endorse it.';
const WHY = 'You’re getting this one email because you sent the Request kits form on wrastem.com. There’s no mailing list. Reply to this email to reach Mark.';

// Keeps "MS-LS1-2" and "6–8" from breaking across lines in the HTML.
const keepTogether = (t) => esc(t).replace('MS-LS1-2', 'MS&#8209;LS1&#8209;2').replace('grades 6–8', 'grades&nbsp;6&ndash;8');

const INK = 'color:#13261C;', INK2 = 'color:#3E5446;', RULE = 'border-color:#13261C;';
const row = ([title, text]) =>
  `<tr><td valign="top" class="ink rule" style="padding:12px 12px 12px 0;border-bottom:2px solid;${RULE}width:38%;font-size:16px;font-weight:800;line-height:1.25;${INK}">${esc(title)}</td>` +
  `<td valign="top" class="ink2 rule" style="padding:12px 0;border-bottom:2px solid;${RULE}${INK2}">${keepTogether(text)}</td></tr>`;

// The subject, HTML and plain-text versions for one request.
export function thankYouEmail({ name, sets, school }) {
  const hi = name ? `Hi ${name},` : 'Hi,';
  const count = `${sets} set${sets === 1 ? '' : 's'}`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${SUBJECT}</title>
<style>
@media (prefers-color-scheme: dark) {
  .bg { background:#000000 !important; }
  .ink { color:#F6F7F2 !important; }
  .ink2 { color:#C9D6CC !important; }
  .rule { border-color:#F6F7F2 !important; }
  .link { color:#F6C343 !important; }
}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#F6F7F2;">
<div style="display:none;max-height:0;overflow:hidden;">I got your request and will email you about next steps soon. Here&rsquo;s what the kit and its free tools give you.</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F6F7F2;">
<tr><td align="center" style="padding:28px 20px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ink" style="max-width:560px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;${INK}">
<tr><td>
<img src="${IMG}logo.png" width="220" height="46" alt="WRA STEM Kits" style="display:block;border:0;width:220px;height:auto;border-radius:6px;">
<h1 class="ink" style="margin:30px 0 0;font-size:34px;line-height:1.05;font-weight:800;letter-spacing:-1px;${INK}">Thank you for requesting a kit!</h1>
<p class="ink2" style="margin:14px 0 0;font-size:17px;line-height:1.5;${INK2}">${esc(hi)} I got your request for <b class="ink" style="${INK}">${count}</b> of the plant cell kit for <b class="ink" style="${INK}">${esc(school)}</b>. I&rsquo;ll email you about next steps soon.</p>
<img src="${IMG}kit.png" width="360" alt="The 3D printed plant cell kit, put together" style="display:block;border:0;width:100%;max-width:360px;height:auto;margin:22px auto 4px;">
</td></tr>
<tr><td class="rule" style="padding-top:26px;border-top:2px solid;${RULE}">
<h2 class="ink" style="margin:0;font-size:26px;line-height:1.05;font-weight:800;letter-spacing:-.6px;${INK}">A plant cell students can hold.</h2>
<p class="ink2" style="margin:10px 0 0;font-size:16px;line-height:1.5;${INK2}">A hands-on, 3D printed kit for middle school science, with free web tools that print its worksheets in one click.</p>
</td></tr>
<tr><td style="padding-top:16px;">
<table role="presentation" class="rule" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid;${RULE}font-size:15px;line-height:1.45;">
${BENEFITS.map(row).join('\n')}
</table>
</td></tr>
<tr><td style="padding-top:26px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="rule" style="border:2px solid;${RULE}border-radius:999px;"><a class="ink" href="https://wrastem.com/" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:700;${INK}text-decoration:none;">See the kit in 3D &rarr;</a></td>
</tr></table>
<p class="ink2" style="margin:14px 0 0;font-size:15px;line-height:1.5;${INK2}">Or try the free <a class="link" href="https://wrastem.com/cell-kit-generator/" style="color:#124A2B;font-weight:700;">worksheet generator</a> while you wait.</p>
</td></tr>
<tr><td style="padding-top:28px;">
<p class="ink" style="margin:0;font-size:16px;line-height:1.5;${INK}">Mark<br><span class="ink2" style="${INK2}">WRA STEM Kits, a student project at Western Reserve Academy</span></p>
<p class="ink2 rule" style="margin:22px 0 0;padding-top:14px;border-top:2px solid;${RULE}font-size:11px;line-height:1.45;${INK2}">${esc(WHY)}<br><br>${esc(NGSS_NOTE)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  const text = [
    'Thank you for requesting a kit!',
    `${hi} I got your request for ${count} of the plant cell kit for ${school}. I'll email you about next steps soon.`,
    'A plant cell students can hold. A hands-on, 3D printed kit for middle school science, with free web tools that print its worksheets in one click.',
    BENEFITS.map(([t, d]) => `- ${t}: ${d}`).join('\n'),
    'See the kit in 3D: https://wrastem.com/\nWorksheet generator: https://wrastem.com/cell-kit-generator/',
    'Mark\nWRA STEM Kits, a student project at Western Reserve Academy',
    WHY,
    NGSS_NOTE,
  ].join('\n\n');
  return { subject: SUBJECT, html, text };
}

// Sends the thank-you. 'sent', 'skipped_no_key' (not launched yet) or 'failed' (Resend refused it,
// for example after the day's 100 free emails, or couldn't be reached). Never throws.
export async function sendThankYou(env, to, request) {
  if (!env.RESEND_API_KEY) return 'skipped_no_key';
  const { subject, html, text } = thankYouEmail(request);
  try {
    const r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `WRA STEM Kits <${env.FROM_ADDRESS || 'kits@wrastem.com'}>`,
        to: [to],
        ...(env.NOTIFY_TO ? { reply_to: env.NOTIFY_TO } : {}),
        subject, html, text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return 'sent';
    const why = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status} ${why}`);
  } catch (err) {
    console.log(JSON.stringify({ thank_you_error: String(err && (err.message || err)).slice(0, 300) }));
    return 'failed';
  }
}
