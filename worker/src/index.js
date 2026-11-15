// Standards AI server (Cloudflare Worker, free plan).
//
// POST /ask {"q": "...", "history": [{q, a}]}
//   ->  {"answer": "... [MS-LS1-2] ...", "sources": ["MS-LS1-2", ...], "type": "science", "status": "ok"}
// GET  /health  ->  what is loaded
//
// It talks like a helpful colleague for science teachers. Its main source is its own copy of
// the NGSS text; it may also use well-established general science and common teaching ideas.
// The two are kept apart:
//   1. For each question it finds the matching performance expectations (the same search the
//      web page uses) and gives the model that text.
//   2. Anything the answer says the NGSS says must end with that standard's code, like [MS-LS1-2].
//   3. Before an answer goes out, every coded sentence is checked against the standard it cites:
//      quotes must be word for word, assessment boundaries may only be quoted, and its science
//      words must actually be in that standard. A coded sentence that fails is cut (or, if it is
//      plain science that doesn't claim to be the NGSS, it keeps its words and loses the code).
//   4. Lines without a code are general science or teaching advice, and the page says so.

import data from '../../standards-ai/ngss.json';
import { createIndex, search, sourceText, codesIn, interpret, bandsIn, bandOf, tokens, smallTalk } from '../../standards-ai/search.js';

const index = createIndex(data);

const SYSTEM = `You are Standards AI on wrastem.com, a friendly, knowledgeable helper for science teachers, mostly in middle school. Talk like a helpful colleague: warm, plain words, short and clear.

Where your answers come from:
- The NGSS text under SOURCES. This is your main source.
- Well-established general science that any good science textbook agrees on.
- Common, practical classroom teaching ideas.

How to answer:
1. Answer the actual question first, in plain words that are still scientifically accurate (for example, cells release energy from food; they don't "make" energy). For "What is X?", say what X is in one or two sentences, then what the NGSS says about it and at which grade (for example "In middle school, ...").
2. When you say what the NGSS says or expects, use only SOURCES, and end that sentence with the standard's code in square brackets, exactly as written in SOURCES, like [MS-LS1-2]. A short exact phrase from SOURCES in quotation marks is good.
3. General science and teaching ideas get no code. Never put a code on a sentence that is not from that standard. Never say the NGSS says something that is not in SOURCES. Never make up codes, quotes, studies, websites or links.
4. Teaching questions ("How should I teach...?", "My students are struggling with..."): give 2 or 3 concrete classroom ideas as a short numbered list, tied to what the standard asks students to do (with its code when an idea comes from the standard). If the teacher sounds stuck or frustrated, start with one short, understanding phrase. If they haven't said the topic or grade, don't only ask questions back: give ideas that work in most science classes, then ask only for what's missing (the topic, the grade, or both) so you can point them to the standard.
5. If asked to explain more simply, rewrite your last answer in simpler words, keeping the codes.
6. How something is assessed: quote the assessment boundary exactly, in quotation marks. Do not reword it.
7. If SOURCES don't cover the topic, say in one short sentence that the NGSS doesn't address it directly, then still help with general science.
8. Greetings and small talk: reply in a sentence or two and offer to help. Questions not about science or teaching: say kindly that you help with science teaching and the NGSS.
9. Keep it under about 120 words. No headings, no bold, no long introductions.
10. This is a conversation: use earlier turns to understand "it", "that" or "what about high school?".
11. This site, WRA STEM Kits, makes a 3D-printed plant cell model kit and a worksheet generator for MS-LS1-2. When a teacher asks for activities on plant cells or cell parts, you may suggest the kit in one short sentence.`;

// Step 1 (routing): a small, fast model works out what kind of message this is and what the
// person meant (misspellings, scrambled letters, everyday words). It does not answer.
const ROUTER = `You read a teacher's message to a science-standards helper. Reply with one line of JSON and nothing else:
{"type":"chat, science, teaching or other","keywords":"3 to 8 correctly spelled science words for the topic, including closely related terms","grade":"K, 1, 2, 3, 4, 5, MS, HS or any"}
type: chat = greetings, thanks, small talk or questions about you. science = a science topic, term or standard. teaching = how to teach, plan, explain or assess something, or any classroom problem (for example "I don't know what to do with my students"). other = not about science or teaching.
The message may be misspelled, scrambled or vague: work out the science topic it most likely means. For follow-ups ("what about high school?", "simpler please"), take the topic from the earlier questions.
grade: only a grade the message or earlier questions name; otherwise "any".
Keywords are science words only, never words like "explain", "simple" or "teach". Leave keywords empty for chat, other, or a teaching question with no science topic.
Do not answer the question. Do not invent standard codes.`;
// Workers AI models reply either as { response } or in the chat-completions shape.
// A reply that is JSON may arrive already decoded into an object.
const textOf = (r) => {
  const v = r && (r.response ?? r.choices?.[0]?.message?.content);
  return v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
};

const GRADE_WORDS = { K: 'kindergarten', 1: 'first grade', 2: 'second grade', 3: 'third grade', 4: 'fourth grade', 5: 'fifth grade', MS: 'middle school', HS: 'high school' };
const TYPES = ['chat', 'science', 'teaching', 'other'];

async function route(env, q, spell, history = []) {
  try {
    // the spelling help (which can unscramble letters) and earlier questions go along as hints
    const before = history.length ? `Earlier questions in this chat: ${history.map((t) => `"${t.q}"`).join(', ')}\n` : '';
    const user = before + `Message: "${q}"` + (spell ? `\nSpell-checked: "${spell}"` : '');
    const r = await env.AI.run(env.ROUTER_MODEL, {
      messages: [{ role: 'system', content: ROUTER }, { role: 'user', content: user }],
      max_tokens: 70, temperature: 0,
    });
    // read the reply leniently: small models sometimes write slightly broken JSON
    const raw = textOf(r);
    let j = null;
    try { j = JSON.parse((raw.match(/\{[\s\S]*\}/) || [''])[0]); } catch {
      const kw = raw.match(/"keywords"\s*:\s*"([^"]*)/), gr = raw.match(/grade"?\s*:\s*"([^"]*)/), ty = raw.match(/type"?\s*:\s*"([^"]*)/);
      j = kw || ty ? { keywords: kw ? kw[1] : '', grade: gr ? gr[1] : '', type: ty ? ty[1] : '' } : null;
    }
    if (!j) { console.log(JSON.stringify({ router_unreadable: raw.slice(0, 200) })); return null; }
    if (env.CACHE_TAG) console.log(JSON.stringify({ q, router: j })); // test copies only
    const type = TYPES.find((t) => String(j.type || '').toLowerCase().includes(t)) || 'science';
    const words = String(Array.isArray(j.keywords) ? j.keywords.join(', ') : j.keywords || '')
      .replace(/\b\d+(st|nd|rd|th)\b/gi, ' ').replace(/[^a-zA-Z ,-]/g, ' ').replace(/\b(grade|grades|level|any|empty|none|[a-z]{1,2})\b/gi, ' ')
      .replace(/(^|[\s,])-+(?=[\s,]|$)/g, ' ').replace(/\s*,\s*(,\s*)*/g, ', ').replace(/\s+/g, ' ').replace(/^[ ,]+|[ ,]+$/g, '').slice(0, 120);
    const band = String(j.grade || '').toUpperCase().replace(/^GRADE\s*/, '');
    const grade = GRADE_WORDS[band] || '';
    return { type, words, band: GRADE_WORDS[band] ? band : '', search: words ? (words + ' ' + grade).trim() : '' };
  } catch (err) { console.log(JSON.stringify({ router_error: String(err).slice(0, 300) })); return null; }
}

// ---- Checking an answer before it goes out
const CITE = /\[([A-Z0-9][A-Z0-9-]*\d)\]/g;
const flat = (t) => t.toLowerCase().replace(/[“”"’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// a sentence that says it is reporting the standards
const CLAIMS_NGSS = /\b(NGSS|standards?|performance expectations?|clarification statements?|assessment boundar(y|ies)|core ideas?|crosscutting|(K|[1-5]|MS|HS|K-2|3-5)-(PS|LS|ESS|ETS)\d)/i;
// words that frame a sentence rather than carry its science; they don't need to be in the standard
const FRAMING = new Set(tokens('help helps idea ideas part parts way ways learn learns understand understanding focus focuses emphasis emphasize ' +
  'name names named include includes including like example examples use uses using describe describes show shows need needs expect expects ' +
  'expected important key role roles work works simple simply only just one two three first next still think look see make makes making ' +
  'build builds building ask asks asked whole well good great try activity activities lesson lessons class classroom group groups ' +
  'kid kids child children age ages level levels clear plain word words call called mention mentions mentioned specifically directly cover covers ' +
  'assess assessed assesses tested test tests quiz graded grade grades limit limited know knowing ' +
  'doesn don isn aren didn won wasn rather instead mostly mainly detail details big small tiny ' +
  'simpler simplest easier easy again shorter longer another more less version'));
const CODE_TEXT = /\b(K-2|3-5|K|[1-5]|MS|HS)-(PS|LS|ESS|ETS)\d(-\d+)?\b/gi;
const TOPICAL_MAX_DF = 30; // a word used by at most this many standards is a topic word

const QUOTE = /["“]([^"”]{8,})["”]/g;
// how many of these words a text uses (the same word in another form counts: describe / describing)
function shareIn(words, text) {
  if (!words.length) return 1;
  const vocab = new Set(tokens(text));
  const roots = new Set([...vocab].filter((w) => w.length >= 6).map((w) => w.slice(0, 6)));
  return words.filter((w) => vocab.has(w) || (w.length >= 6 && roots.has(w.slice(0, 6)))).length / words.length;
}
// full codes written in a sentence, with or without brackets ("as in MS-LS2-1")
const codesOf = (sent) => [...new Set([...[...sent.matchAll(CITE)].map((m) => m[1]),
  ...[...sent.replace(CITE, ' ').matchAll(CODE_TEXT)].filter((m) => m[3]).map((m) => m[0].toUpperCase())])];

// "In middle school ... [4-ESS2-2]": the grade named must be the grade of the standard cited
const GRADE_PHRASE = /\b(kindergarten|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|1st|2nd|3rd|4th|5th|6th|7th|8th) grade|middle school|high school)\b/gi;
const PHRASE_BAND = { kindergarten: 'K', first: '1', '1st': '1', second: '2', '2nd': '2', third: '3', '3rd': '3', fourth: '4', '4th': '4', fifth: '5', '5th': '5' };
const BAND_PHRASE = { K: 'kindergarten', 1: '1st grade', 2: '2nd grade', 3: '3rd grade', 4: '4th grade', 5: '5th grade', 'K-2': 'grades K–2', '3-5': 'grades 3–5', MS: 'middle school', HS: 'high school' };
const phraseBand = (p) => { const w = p.toLowerCase(); return w === 'middle school' || /^(sixth|seventh|eighth|6th|7th|8th)/.test(w) ? 'MS' : w === 'high school' ? 'HS' : PHRASE_BAND[w.split(' ')[0]]; };
const fits = (phrase, band) => band === phrase || (band === 'K-2' && ['K', '1', '2'].includes(phrase)) || (band === '3-5' && ['3', '4', '5'].includes(phrase));
function fixGrade(sent) {
  const bands = [...new Set(codesOf(sent).map(bandOf))];
  const phrases = [...sent.matchAll(GRADE_PHRASE)];
  if (bands.length !== 1 || phrases.length !== 1 || fits(phraseBand(phrases[0][0]), bands[0])) return sent;
  const right = BAND_PHRASE[bands[0]];
  return right ? sent.replace(phrases[0][0], /^[A-Z]/.test(phrases[0][0]) ? right[0].toUpperCase() + right.slice(1) : right) : sent;
}

function sentenceCheck(sent, sourceTexts, allText) {
  const codes = codesOf(sent);
  const bare = sent.replace(CITE, ' ');
  const claims = CLAIMS_NGSS.test(bare) || codes.length > 0;
  const quotes = [...bare.matchAll(QUOTE)].map((m) => m[1]);
  const quoted = quotes.length > 0;
  const inText = (text) => {
    const ft = flat(text);
    // a quote must appear word for word; "..." may skip words between its parts
    return quotes.every((qt) => qt.split(/\.{3}|…/).map(flat).filter((p) => p.length > 2).every((p) => ft.includes(p)));
  };
  if (!codes.length) {
    // a quote of NGSS text with no code gets the code of the standard it comes from
    if (quoted && Object.keys(sourceTexts).length) {
      const from = Object.keys(sourceTexts).find((c) => inText(sourceTexts[c]));
      if (from) return 'cite:' + from;
    }
    if (!claims) return 'keep'; // general science or teaching advice
    // it talks about the standards without a code: any quote must still be real NGSS text,
    // and assessment boundaries may only be quoted
    if (quoted && !inText(allText)) return 'cut';
    if (/assessment boundar/i.test(bare.replace(QUOTE, ' ')) && !quoted) return 'cut';
    return 'keep';
  }
  if (codes.some((c) => !sourceTexts[c])) return CLAIMS_NGSS.test(bare) ? 'cut' : 'uncite';
  const text = codes.map((c) => sourceTexts[c]).join(' ');
  if (quoted && !inText(text)) return 'cut';
  const own = tokens(bare.replace(QUOTE, ' ').replace(CODE_TEXT, ' ')).filter((w) => !FRAMING.has(w));
  // Assessment boundaries are easy to misread. In plain words is fine, but nearly every word
  // must come from the assessment boundary itself.
  if (/\b(assess|tested|on the test)/i.test(bare.replace(QUOTE, ' ')) && !quoted) {
    const limits = codes.map((c) => (sourceTexts[c].match(/^Assessment boundary: (.*)$/m) || ['', ''])[1]).join(' ');
    return limits.trim() && shareIn(own, limits) >= 0.75 ? 'keep' : 'cut';
  }
  // its topic words (the science, not the framing) must be in the standard it cites
  const topic = own.filter((w) => index.df.has(w) && index.df.get(w) <= TOPICAL_MAX_DF);
  if (shareIn(topic, text) >= 0.6) return 'keep';
  // plain science that doesn't say it is the NGSS keeps its words but loses the code
  return CLAIMS_NGSS.test(bare) ? 'cut' : 'uncite';
}

const addCode = (s, c) => (/[.!?]$/.test(s) ? s.replace(/([.!?])$/, ` [${c}]$1`) : `${s} [${c}]`);

function checkAnswer(answer, sourceTexts) {
  const allText = Object.values(sourceTexts).join(' ');
  const cut = [], uncited = [];
  const lines = answer.split('\n').map((line) => {
    const sentences = line.split(/(?<=[.!?]["”]?(?:\s*\[[A-Z0-9-]+\])*)\s+(?=["“(A-Z0-9])/);
    const kept = [];
    for (let s of sentences) {
      if (!s.trim()) continue;
      s = fixGrade(s);
      const verdict = sentenceCheck(s, sourceTexts, allText);
      if (verdict === 'keep') kept.push(s);
      else if (verdict.startsWith('cite:')) kept.push(fixGrade(addCode(s.trim(), verdict.slice(5))));
      else if (verdict === 'uncite') { uncited.push(s); kept.push(s.replace(/\s*\[[A-Z0-9][A-Z0-9-]*\d\]/g, '').replace(/\s+([.!?])/g, '$1')); }
      else cut.push(s);
    }
    return kept.join(' ');
  });
  const text = lines
    .filter((l, i) => !/^\s*(\d+[.)]|[-*•])\s*$/.test(l)) // a list item whose words were all cut
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text, cut, uncited };
}

// models sometimes add markdown; the page shows plain text, short paragraphs and lists
// (a question tacked onto the last list item becomes its own line)
const tidy = (t) => t.replace(/\*\*|__/g, '').replace(/^#+\s*/gm, '').replace(/^\s*[*•]\s+/gm, '- ').replace(/[ \t]+\n/g, '\n')
  .replace(/^(\s*(?:\d+[.)]|-)\s+.*?[.!])\s+([A-Z][^\n]*\?)\s*$/gm, '$1\n\n$2').trim();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });

// ---- Purchase requests (wrastem.com/purchase) ------------------------------------
// The form's answers are emailed to the kit maker, who replies to the teacher directly.
// The address they go to is a secret on this server (NOTIFY_TO), never in the code or on the
// site. Free: Cloudflare delivers to a verified address in the account at no cost. Every
// request is also written to the logs, so nothing is lost if an email can't be sent.
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
async function purchase(request, env) {
  if (env.LIMITER) {
    const { success } = await env.LIMITER.limit({ key: 'purchase:' + (request.headers.get('cf-connecting-ip') || 'anon') });
    if (!success) return json({ error: 'slow_down' }, 429);
  }
  let body = {};
  try { body = await request.json(); } catch { /* bad body */ }
  // a hidden field people never see: if it is filled in, a bot sent the form
  if (clean(body.website, 200)) return json({ ok: true });
  const sets = Math.floor(Number(body.sets));
  // one-line answers stay on one line (they go into the email's subject and headers)
  const line = (v, max) => clean(String(v ?? '').replace(/\s+/g, ' '), max);
  const name = line(body.name, 80), school = line(body.school, 120), email = clean(body.email, 200).replace(/\s/g, '');
  const message = clean(body.message, 1500).replace(/\r\n?/g, '\n');
  const bad = [];
  if (!(sets >= 1 && sets <= 1000)) bad.push('sets');
  if (school.length < 2) bad.push('school');
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) bad.push('email');
  if (bad.length) return json({ error: 'invalid', fields: bad }, 400);

  const request_ = { sets, name, school, email, message };
  const subject = `Kit request: ${sets} set${sets === 1 ? '' : 's'} for ${school}`.slice(0, 200);
  const rows = [['Sets', String(sets)], ['Name', name || '(not given)'], ['School', school], ['Email', email], ['Message', message || '(none)']];
  const text = `A teacher asked to buy the plant cell kit on wrastem.com.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nReply to this email to answer them. They were told to expect a reply within 48 hours.`;
  const html = `<p>A teacher asked to buy the plant cell kit on wrastem.com.</p><table cellpadding="6" style="border-collapse:collapse">${
    rows.map(([k, v]) => `<tr><th align="left" valign="top">${k}</th><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join('')
  }</table><p>Reply to this email to answer them. They were told to expect a reply within 48 hours.</p>`;
  let status = 'emailed';
  try {
    if (!env.EMAIL || !env.NOTIFY_TO) throw new Error('email not set up');
    await env.EMAIL.send({
      to: env.NOTIFY_TO,
      from: { email: env.FROM_ADDRESS || 'kits@wrastem.com', name: 'WRA STEM Kits' },
      replyTo: { email, name: name || undefined },
      subject, text, html,
    });
  } catch (err) {
    status = 'email_failed';
    console.log(JSON.stringify({ purchase_email_error: String(err && (err.code || '') + ' ' + (err.message || err)).slice(0, 300) }));
  }
  console.log(JSON.stringify({ purchase: request_, status }));
  return json({ ok: true });
}

// Questions are cached for a week, so a repeated question costs no AI time.
const normal = (q) => q.toLowerCase().replace(/[^a-z0-9- ]+/g, ' ').replace(/\s+/g, ' ').trim();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/health') {
      return json({ ok: true, standards: data.count, retrieved: data.retrieved, model: env.MODEL });
    }
    if (url.pathname === '/purchase' && request.method === 'POST') return purchase(request, env);
    if (url.pathname !== '/ask' || request.method !== 'POST') return json({ error: 'not_found' }, 404);

    // a few questions a minute per visitor, so nobody can use up the day's free allowance
    if (env.LIMITER) {
      const { success } = await env.LIMITER.limit({ key: request.headers.get('cf-connecting-ip') || 'anon' });
      if (!success) return json({ error: 'slow_down' }, 429);
    }

    let q = '', history = [];
    try {
      const body = await request.json();
      q = String(body.q || '').slice(0, 300).trim();
      // the last few turns of the chat, so follow-up questions make sense
      history = (Array.isArray(body.history) ? body.history : []).slice(-3)
        .map((t) => ({ q: String(t?.q || '').slice(0, 300), a: String(t?.a || '').slice(0, 900) }))
        .filter((t) => t.q);
    } catch { /* bad body */ }
    if (q.length < 2) return json({ error: 'empty' }, 400);

    // "hi", "thanks", "who are you": a friendly reply, no AI needed
    const hello = smallTalk(q);
    if (hello) {
      console.log(JSON.stringify({ q, status: 'small_talk' }));
      return json({ answer: hello, sources: [], interpreted: null, type: 'chat', status: 'ok' });
    }

    // "How is MS-LS1-2 assessed?" / "clarification for HS-LS1-5": answer straight from the text
    const named = codesIn(q).map((c) => data.pe.find((p) => p.c === c)).filter(Boolean);
    if (named.length === 1 && /\b(assess|boundar|clarif)/i.test(q)) {
      const pe = named[0], wantsBoundary = /\b(assess|boundar)/i.test(q);
      const part = wantsBoundary ? pe.ab : pe.cs, label = wantsBoundary ? 'assessment boundary' : 'clarification statement';
      const answer = part ? `Here is the ${label} for ${pe.c}, word for word: "${part}" [${pe.c}]` : `${pe.c} doesn't have a ${label} [${pe.c}].`;
      console.log(JSON.stringify({ q, sources: [pe.c], status: 'direct' }));
      return json({ answer, sources: [pe.c], interpreted: null, type: 'science', status: 'ok' });
    }

    const cache = caches.default;
    const key = new Request(`https://cache.standards-ai/${env.CACHE_TAG || 'v12'}/ask?q=` + encodeURIComponent(normal(q)));
    const cached = history.length ? null : await cache.match(key);
    if (cached) {
      console.log(JSON.stringify({ q, status: 'cached' }));
      return new Response(cached.body, { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // Route: a typed code goes straight to its standard; anything else is interpreted first.
    const spell = interpret(index, q);
    const hasCode = codesIn(q).length > 0;
    const routed = hasCode ? null : await route(env, q, spell.changed ? spell.text : '', history);
    const type = hasCode ? 'science' : routed ? routed.type : 'science';
    let hits = [], interpreted = null;
    if (type === 'science' || type === 'teaching') {
      const seen = new Set();
      const add = (list) => { for (const h of list) if (h.pe && !seen.has(h.pe.c)) { seen.add(h.pe.c); hits.push(h); } };
      // A follow-up with no science words of its own ("explain that more simply", "what about
      // high school?") stays on the standards the last answer used.
      const last = history.length ? [...new Set([...history[history.length - 1].a.matchAll(CITE)].map((m) => m[1]))] : [];
      const followUp = last.length > 0 && !hasCode
        && !tokens(spell.text).some((w) => !FRAMING.has(w) && index.df.has(w) && index.df.get(w) <= TOPICAL_MAX_DF);
      if (followUp) add(last.map((c) => ({ pe: data.pe.find((p) => p.c === c), score: 0 })));
      // when the spelling help fixed the words (even unscrambled them), that is the topic
      const agrees = spell.changed && routed && spell.text.split(' ').every((w) => routed.words.toLowerCase().includes(w));
      const topic = (spell.changed && (!routed || agrees)) ? spell.text : routed && routed.words ? routed.words : spell.changed ? spell.text : '';
      if (!followUp) add([...(spell.changed ? search(index, spell.text + ' ' + q, 5) : []),
        // the raw words only when the router couldn't help: "explain that more simply" is not a topic
        ...(routed && routed.search ? search(index, routed.search, 5) : []), ...(routed ? [] : search(index, q, 5))]);
      // a grade band in the question (or worked out by the router) keeps only that band, if it has matches
      const routedBand = !followUp && routed && routed.band ? routed.band : '';
      const bands = [...bandsIn(q), ...(routedBand ? (['K', '1', '2'].includes(routedBand) ? [routedBand, 'K-2'] : ['3', '4', '5'].includes(routedBand) ? [routedBand, '3-5'] : [routedBand]) : [])];
      if (bands.length) {
        // that grade's standards first, then the two best from other grades, so the answer can
        // point to where a topic is actually taught when the asked-for grade doesn't cover it
        const words = [routed && routed.words, spell.changed && spell.text, !routed && q].filter(Boolean).join(' ');
        add(search(index, words, 3, bands));
        const inBand = hits.filter((h) => bands.includes(bandOf(h.pe.c)));
        if (inBand.length) hits = [...inBand.slice(0, 3), ...hits.filter((h) => !bands.includes(bandOf(h.pe.c))).slice(0, 2)];
      }
      hits.splice(5);
      // show "Looking at ..." only when the words were fixed or reinterpreted
      const qWords = new Set(tokens(q));
      if (!followUp && topic && (spell.changed || !tokens(topic).some((w) => qWords.has(w)))) interpreted = topic;
    }
    const sources = hits.map((h) => h.pe.c);
    const texts = Object.fromEntries(hits.map((h) => [h.pe.c, sourceText(data, h.pe)]));
    const context = hits.length ? Object.values(texts).join('\n\n---\n\n') : 'None of the standards match this message.';

    let answer = null, status = 'ok';
    try {
      const r = await env.AI.run(env.MODEL, {
        messages: [
          { role: 'system', content: SYSTEM },
          ...history.flatMap((t) => [{ role: 'user', content: t.q }, ...(t.a ? [{ role: 'assistant', content: t.a }] : [])]),
          { role: 'user', content: `SOURCES (NGSS text):\n\n${context}\n\nMESSAGE: ${q}${interpreted ? `\n(This most likely means: ${interpreted})` : ''}${
            type === 'teaching' && !hits.length ? '\n(No topic yet: give 2 or 3 practical ideas that work in most science classes first, then ask what topic and grade they teach.)' : ''}` },
        ],
        max_tokens: 380,
        temperature: 0.2,
      });
      answer = tidy(textOf(r));
    } catch (err) {
      // most often the free daily allowance is used up; the page falls back to search results
      status = 'ai_unavailable';
      console.log(JSON.stringify({ q, type, interpreted, sources, status, error: String(err).slice(0, 200) }));
      return json({ answer: null, sources, interpreted, type, status });
    }

    const checked = checkAnswer(answer, texts);
    if (checked.cut.length || checked.uncited.length) console.log(JSON.stringify({ q, cut: checked.cut, uncited: checked.uncited }));
    if (!checked.text) { answer = null; status = 'unsupported'; } else answer = checked.text;

    console.log(JSON.stringify({ q, type, interpreted, sources, status }));
    const res = json({ answer, sources, interpreted, type, status });
    if (status === 'ok' && !history.length) ctx.waitUntil(cache.put(key, new Response(res.clone().body, { headers: { 'Cache-Control': 'max-age=604800' } })));
    return res;
  },
};
