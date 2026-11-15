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
import { createIndex, search, sourceText } from '../../standards-ai/search.js';

const index = createIndex(data);

export const NOT_COVERED = 'The NGSS text I have does not address that.';

const SYSTEM = `You are Standards AI on wrastem.com. You help teachers read the Next Generation Science Standards (NGSS).
You may use ONLY the NGSS text given under SOURCES. You have no other knowledge, and you must not use any.
Rules:
1. Every sentence must be supported by SOURCES. Do not add facts, examples, activities, lesson ideas, opinions, or explanations that are not in SOURCES.
2. End each sentence with the code of the performance expectation it comes from, in square brackets, exactly as written in SOURCES, for example [MS-LS1-2].
3. Use the standards' own wording where you can. Short quotes are good.
4. If SOURCES do not answer the question, or the question is not about the science standards, reply with exactly this sentence and nothing else: ${NOT_COVERED}
5. Write plainly for a teacher, in at most 150 words.`;

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

    const hits = search(index, q, 5);
    const sources = hits.map((h) => h.pe.c);
    if (!hits.length) {
      console.log(JSON.stringify({ q, sources, status: 'no_match' }));
      return json({ answer: NOT_COVERED, sources, status: 'no_match' });
    }

    const cache = caches.default;
    const key = new Request('https://cache.standards-ai/ask?q=' + encodeURIComponent(normal(q)));
    const cached = await cache.match(key);
    if (cached) {
      console.log(JSON.stringify({ q, sources, status: 'cached' }));
      return new Response(cached.body, { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    const context = hits.map((h) => sourceText(data, h.pe)).join('\n\n---\n\n');
    let answer = null, status = 'ok';
    try {
      const r = await env.AI.run(env.MODEL, {
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `SOURCES (the only text you may use):\n\n${context}\n\nQUESTION: ${q}` },
        ],
        max_tokens: 380,
        temperature: 0.1,
      });
      answer = String(r.response || '').trim();
    } catch (err) {
      // most often the free daily allowance is used up; the page falls back to search results
      status = 'ai_unavailable';
      console.log(JSON.stringify({ q, sources, status, error: String(err).slice(0, 200) }));
      return json({ answer: null, sources, status });
    }

    // Keep the answer only if every citation points at text it was given.
    const cited = [...answer.matchAll(/\[([A-Z0-9][A-Z0-9-]*\d)\]/g)].map((m) => m[1]);
    if (answer.startsWith(NOT_COVERED)) { answer = NOT_COVERED; status = 'not_covered'; }
    else if (!cited.length || cited.some((c) => !sources.includes(c))) { answer = null; status = 'unsupported'; }

    console.log(JSON.stringify({ q, sources, status }));
    const res = json({ answer, sources, status });
    if (answer) ctx.waitUntil(cache.put(key, new Response(res.clone().body, { headers: { 'Cache-Control': 'max-age=604800' } })));
    return res;
  },
};
