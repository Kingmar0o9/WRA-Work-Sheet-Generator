// Standards AI server (Cloudflare Worker, free plan).
//
// POST /ask {"q": "..."}  ->  {"answer": "... [MS-LS1-2]" | null, "sources": ["MS-LS1-2", ...], "status": "..."}
// GET  /health            ->  what is loaded
//
// How it stays on the standards:
//   1. It finds the matching performance expectations in its own copy of the NGSS text
//      (the same search the web page uses).
//   2. The model is given ONLY that text and told to use nothing else and cite every claim.
//   3. Before an answer is sent back, every citation is checked against the text it was
//      given. An answer that cites anything else, or cites nothing, is thrown away and the
//      page shows the matching standards instead.

import data from '../../standards-ai/ngss.json';
import { createIndex, search, sourceText, codesIn, interpret, bandsIn, bandOf } from '../../standards-ai/search.js';

const index = createIndex(data);

export const NOT_COVERED = 'The NGSS text I have does not address that.';

const SYSTEM = `You are Standards AI on wrastem.com. You help teachers read the Next Generation Science Standards (NGSS).
You may use ONLY the NGSS text given under SOURCES. You have no other knowledge, and you must not use any.
Rules:
1. Every sentence must be supported by SOURCES. Do not add facts, examples, activities, lesson ideas, opinions, or explanations that are not in SOURCES.
2. End each sentence with the code of the performance expectation it comes from, in square brackets, exactly as written in SOURCES, for example [MS-LS1-2].
3. When you say what a standard says, quote its exact words inside quotation marks. Never restate a clarification statement or assessment boundary in your own words, and never apply a sentence to a different part, organelle or grade than the one it names.
4. If SOURCES do not answer the question, or the question is not about the science standards, reply with exactly this sentence and nothing else: ${NOT_COVERED}
5. Write plainly for a teacher, in at most 150 words.`;

// Step 1 (routing): a small, fast model works out what the person meant (misspellings,
// scrambled letters, everyday words) and turns it into search words. It does not answer.
const ROUTER = `You turn a teacher's search text into search keywords for the Next Generation Science Standards.
The text may be misspelled, scrambled, abbreviated or vague. Work out the science topic they most likely mean.
Reply with only one line of JSON and nothing else, in this form:
{"keywords":"3 to 8 correctly spelled science words for the topic","grade":"K, 1, 2, 3, 4, 5, MS, HS or any"}
Do not answer the question. Do not invent standard codes.`;
// Workers AI models reply either as { response } or in the chat-completions shape.
// A reply that is JSON may arrive already decoded into an object.
const textOf = (r) => {
  const v = r && (r.response ?? r.choices?.[0]?.message?.content);
  return v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
};

const GRADE_WORDS = { K: 'kindergarten', 1: 'first grade', 2: 'second grade', 3: 'third grade', 4: 'fourth grade', 5: 'fifth grade', MS: 'middle school', HS: 'high school' };

async function route(env, q, spell) {
  try {
    // the spelling help (which can unscramble letters) goes along as a hint
    const user = `Search text: "${q}"` + (spell ? `\nSpell-checked: "${spell}"` : '');
    const r = await env.AI.run(env.ROUTER_MODEL, {
      messages: [{ role: 'system', content: ROUTER }, { role: 'user', content: user }],
      max_tokens: 60, temperature: 0,
    });
    // read the reply leniently: small models sometimes write slightly broken JSON
    const raw = textOf(r);
    let j = null;
    try { j = JSON.parse((raw.match(/\{[\s\S]*\}/) || [''])[0]); } catch {
      const kw = raw.match(/"keywords"\s*:\s*"([^"]*)/), gr = raw.match(/grade"?\s*:\s*"([^"]*)/);
      j = kw ? { keywords: kw[1], grade: gr ? gr[1] : '' } : null;
    }
    const words = String(Array.isArray(j?.keywords) ? j.keywords.join(', ') : j?.keywords || '')
      .replace(/\b\d+(st|nd|rd|th)\b/gi, ' ').replace(/[^a-zA-Z ,-]/g, ' ').replace(/\b(grade|grades|level|any|[a-z]{1,2})\b/gi, ' ')
      .replace(/\s*,\s*(,\s*)*/g, ', ').replace(/\s+/g, ' ').replace(/^[ ,]+|[ ,]+$/g, '').slice(0, 120);
    if (!words) { console.log(JSON.stringify({ router_unreadable: textOf(r).slice(0, 200) })); return null; }
    const band = String(j.grade || '').toUpperCase().replace(/^GRADE\s*/, '');
    const grade = GRADE_WORDS[band] || '';
    return { words, band: GRADE_WORDS[band] ? band : '', search: (words + ' ' + grade).trim() };
  } catch (err) { console.log(JSON.stringify({ router_error: String(err).slice(0, 300) })); return null; }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });

// Questions are cached for a week, so a repeated question costs no AI time.
const normal = (q) => q.toLowerCase().replace(/[^a-z0-9- ]+/g, ' ').replace(/\s+/g, ' ').trim();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/health') {
      return json({ ok: true, standards: data.count, retrieved: data.retrieved, model: env.MODEL });
    }
    if (url.pathname !== '/ask' || request.method !== 'POST') return json({ error: 'not_found' }, 404);

    // a few questions a minute per visitor, so nobody can use up the day's free allowance
    if (env.LIMITER) {
      const { success } = await env.LIMITER.limit({ key: request.headers.get('cf-connecting-ip') || 'anon' });
      if (!success) return json({ error: 'slow_down' }, 429);
    }

    let q = '';
    try { q = String((await request.json()).q || '').slice(0, 300).trim(); } catch { /* bad body */ }
    if (q.length < 3) return json({ error: 'empty' }, 400);

    const cache = caches.default;
    const key = new Request('https://cache.standards-ai/v6/ask?q=' + encodeURIComponent(normal(q)));
    const cached = await cache.match(key);
    if (cached) {
      console.log(JSON.stringify({ q, status: 'cached' }));
      return new Response(cached.body, { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // Route: a typed code goes straight to its standard; anything else is interpreted first.
    const spell = interpret(index, q);
    const routed = codesIn(q).length ? null : await route(env, q, spell.changed ? spell.text : '');
    // when the spelling help fixed the words (even unscrambled them), that is the topic
    const agrees = spell.changed && routed && spell.text.split(' ').every((w) => routed.words.toLowerCase().includes(w));
    const topic = (spell.changed && (!routed || agrees)) ? spell.text : routed ? routed.words : spell.changed ? spell.text : '';
    const seen = new Set();
    let hits = [];
    for (const h of [...(spell.changed ? search(index, spell.text + ' ' + q, 6) : []),
      ...(routed ? search(index, routed.search, 6) : []), ...search(index, q, 6)]) {
      if (!seen.has(h.pe.c)) { seen.add(h.pe.c); hits.push(h); }
    }
    // a grade band in the question (or worked out by the router) keeps only that band, if it has matches
    const bands = [...bandsIn(q), ...(routed && routed.band ? (['K', '1', '2'].includes(routed.band) ? [routed.band, 'K-2'] : ['3', '4', '5'].includes(routed.band) ? [routed.band, '3-5'] : [routed.band]) : [])];
    if (bands.length) {
      // that grade's standards first, then the two best from other grades, so the answer can
      // point to where a topic is actually taught when the asked-for grade doesn't cover it
      const inBand = hits.filter((h) => bands.includes(bandOf(h.pe.c)));
      if (inBand.length) hits = [...inBand.slice(0, 4), ...hits.filter((h) => !bands.includes(bandOf(h.pe.c))).slice(0, 2)];
    }
    hits.splice(6);
    const sources = hits.map((h) => h.pe.c);
    const interpreted = topic || null;
    if (!hits.length) {
      console.log(JSON.stringify({ q, interpreted, sources, status: 'no_match' }));
      return json({ answer: NOT_COVERED, sources, interpreted, status: 'no_match' });
    }

    const context = hits.map((h) => sourceText(data, h.pe)).join('\n\n---\n\n');
    let answer = null, status = 'ok';
    try {
      const r = await env.AI.run(env.MODEL, {
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `SOURCES (the only text you may use):\n\n${context}\n\nQUESTION: ${
            interpreted && q.split(/\s+/).length <= 3 ? `What do these standards say about ${interpreted}?`
              : q + (interpreted ? `\n(The question is about: ${interpreted})` : '')}` },
        ],
        max_tokens: 380,
        temperature: 0.1,
      });
      answer = textOf(r).trim();
    } catch (err) {
      // most often the free daily allowance is used up; the page falls back to search results
      status = 'ai_unavailable';
      console.log(JSON.stringify({ q, interpreted, sources, status, error: String(err).slice(0, 200) }));
      return json({ answer: null, sources, interpreted, status });
    }

    // Keep the answer only if every citation points at text it was given.
    const cited = [...answer.matchAll(/\[([A-Z0-9][A-Z0-9-]*\d)\]/g)].map((m) => m[1]);
    // a cited answer sometimes trails off with the refusal sentence; drop that line
    if (cited.length && !answer.startsWith(NOT_COVERED)) answer = answer.split(NOT_COVERED).join('').trim();
    if (answer.startsWith(NOT_COVERED)) { answer = NOT_COVERED; status = 'not_covered'; }
    else if (!cited.length || cited.some((c) => !sources.includes(c))) { answer = null; status = 'unsupported'; }

    console.log(JSON.stringify({ q, interpreted, sources, status }));
    const res = json({ answer, sources, interpreted, status });
    if (status === 'ok') ctx.waitUntil(cache.put(key, new Response(res.clone().body, { headers: { 'Cache-Control': 'max-age=604800' } })));
    return res;
  },
};
