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
import { createIndex, search, sourceText, codesIn, interpret, bandsIn, bandOf, tokens } from '../../standards-ai/search.js';

const index = createIndex(data);

export const NOT_COVERED = 'The NGSS text I have does not address that.';

const SYSTEM = `You are Standards AI on wrastem.com. You help teachers read the Next Generation Science Standards (NGSS).
You may use ONLY the NGSS text given under SOURCES. You have no other knowledge, and you must not use any.
Rules:
1. Every sentence must be supported by SOURCES. Do not add facts, examples, activities, lesson ideas, opinions, or explanations that are not in SOURCES.
2. End each sentence with the code of the performance expectation it comes from, in square brackets, exactly as written in SOURCES, for example [MS-LS1-2].
3. When you say what a standard says, use its exact words in quotation marks: a key phrase, not a whole paragraph. When asked how something is assessed, quote the assessment boundary in full, inside quotation marks. Never restate a clarification statement or assessment boundary in your own words, and never apply a sentence to a different part, organelle or grade than the one it names.
4. If SOURCES do not answer the question, or the question is not about the science standards, reply with exactly this sentence and nothing else: ${NOT_COVERED}
5. Be short and sharp: lead with the direct answer, then at most two more sentences, about 70 words in all. Plain words a busy teacher can use right away. No lists, no headings, no filler.
6. Answer the exact thing asked, not a neighbouring topic. If SOURCES only name it without explaining it, say what they do say (for example, that a standard names it) and that the standards don't go further.
7. This is a conversation. Earlier turns tell you what "it", "that" or "what about high school?" refers to, but every fact must still come from SOURCES.`;

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

async function route(env, q, spell, history = []) {
  try {
    // the spelling help (which can unscramble letters) and earlier questions go along as hints
    const before = history.length ? `Earlier questions in this chat: ${history.map((t) => `"${t.q}"`).join(', ')}\n` : '';
    const user = before + `Search text: "${q}"` + (spell ? `\nSpell-checked: "${spell}"` : '');
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

// Grounding check: a sentence stays only if (a) at least 80% of its content words appear in
// the standards it cites (or, uncited, in the sources given), and (b) any quoted phrase
// appears word for word in that text. Everything else is cut.
const flat = (t) => t.toLowerCase().replace(/[“”"’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function grounded(answer, sourceTexts) {
  const sentences = answer.replace(/\s+/g, ' ').split(/(?<=[.!?]["”]?(?:\s*\[[A-Z0-9-]+\])?)\s+(?=["“A-Z])/);
  const kept = [], cut = [];
  for (const sent of sentences) {
    const codes = [...sent.matchAll(/\[([A-Z0-9][A-Z0-9-]*\d)\]/g)].map((m) => m[1]);
    const text = (codes.length ? codes : Object.keys(sourceTexts)).map((c) => sourceTexts[c] || '').join(' ');
    const vocab = new Set(tokens(text));
    const roots = new Set([...vocab].filter((w) => w.length >= 6).map((w) => w.slice(0, 6)));
    // the same word in another form counts (describe / describing, emphasis / emphasized)
    const known = (w) => vocab.has(w) || (w.length >= 6 && roots.has(w.slice(0, 6)));
    const words = tokens(sent.replace(/\[[^\]]*\]/g, ' '));
    const share = words.length ? words.filter(known).length / words.length : 1;
    // a quote must appear word for word; "..." may skip words between its parts
    const flatText = flat(text);
    const quotesOk = [...sent.matchAll(/["“]([^"”]{8,})["”]/g)].every((m) =>
      m[1].split(/\.{3}|…/).map(flat).filter((part) => part.length > 2).every((part) => flatText.includes(part)));
    // assessment boundaries are easy to misread, so they may only be quoted, never paraphrased
    const aboutAssessment = /\bassess/i.test(sent.replace(/["“][^"”]*["”]/g, ''));
    const quoted = /["“][^"”]{8,}["”]/.test(sent);
    (share >= 0.8 && quotesOk && (!aboutAssessment || quoted) ? kept : cut).push(sent);
  }
  return { text: kept.join(' ').trim(), cut };
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

    let q = '', history = [];
    try {
      const body = await request.json();
      q = String(body.q || '').slice(0, 300).trim();
      // the last few turns of the chat, so follow-up questions make sense
      history = (Array.isArray(body.history) ? body.history : []).slice(-3)
        .map((t) => ({ q: String(t?.q || '').slice(0, 300), a: String(t?.a || '').slice(0, 700) }))
        .filter((t) => t.q);
    } catch { /* bad body */ }
    if (q.length < 2) return json({ error: 'empty' }, 400);

    // "How is MS-LS1-2 assessed?" / "clarification for HS-LS1-5": answer straight from the text
    const named = codesIn(q).map((c) => data.pe.find((p) => p.c === c)).filter(Boolean);
    if (named.length === 1 && /\b(assess|boundar|clarif)/i.test(q)) {
      const pe = named[0], wantsBoundary = /\b(assess|boundar)/i.test(q);
      const part = wantsBoundary ? pe.ab : pe.cs, label = wantsBoundary ? 'assessment boundary' : 'clarification statement';
      const answer = part ? `The ${label} for ${pe.c} reads: "${part}" [${pe.c}]` : `${pe.c} has no ${label} [${pe.c}].`;
      console.log(JSON.stringify({ q, sources: [pe.c], status: 'direct' }));
      return json({ answer, sources: [pe.c], interpreted: null, status: 'ok' });
    }

    const cache = caches.default;
    const key = new Request('https://cache.standards-ai/v11/ask?q=' + encodeURIComponent(normal(q)));
    const cached = history.length ? null : await cache.match(key);
    if (cached) {
      console.log(JSON.stringify({ q, status: 'cached' }));
      return new Response(cached.body, { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // Route: a typed code goes straight to its standard; anything else is interpreted first.
    const spell = interpret(index, q);
    const routed = codesIn(q).length ? null : await route(env, q, spell.changed ? spell.text : '', history);
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
          ...history.flatMap((t) => [{ role: 'user', content: t.q }, ...(t.a ? [{ role: 'assistant', content: t.a }] : [])]),
          { role: 'user', content: `SOURCES (the only text you may use):\n\n${context}\n\nQUESTION: ${
            interpreted && q.split(/\s+/).length <= 3 ? `What do these standards say about ${interpreted}?`
              : q + (interpreted ? `\n(The question is about: ${interpreted})` : '')}` },
        ],
        max_tokens: 220,
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
    let cutCount = 0;
    if (answer.startsWith(NOT_COVERED)) { answer = NOT_COVERED; status = 'not_covered'; }
    else if (!cited.length || cited.some((c) => !sources.includes(c))) { answer = null; status = 'unsupported'; }
    else {
      const texts = Object.fromEntries(hits.map((h) => [h.pe.c, sourceText(data, h.pe)]));
      const g = grounded(answer, texts);
      cutCount = g.cut.length;
      if (g.cut.length) console.log(JSON.stringify({ q, cut: g.cut }));
      if (!g.text || !/\[[A-Z0-9][A-Z0-9-]*\d\]/.test(g.text)) { answer = null; status = 'unsupported'; } else answer = g.text;
    }

    console.log(JSON.stringify({ q, interpreted, sources, status }));
    const res = json({ answer, sources, interpreted, status });
    if (status === 'ok' && !history.length) ctx.waitUntil(cache.put(key, new Response(res.clone().body, { headers: { 'Cache-Control': 'max-age=604800' } })));
    return res;
  },
};
