// The Standards AI page (standards-ai/index.html): the chat, the search, and "Find it in the NGSS".
// It lives in its own file so the page can tell browsers to run no script written into the page itself.
// Everything the AI or a visitor writes is shown as plain text (see esc below), never as HTML.
import { createIndex, search, codesIn, interpret, smallTalk, tokens } from './search.js';

const DATA_URL = 'ngss.json';
const ENDPOINT = document.querySelector('meta[name="standards-ai-endpoint"]').content;
const NO_MATCH = 'I couldn’t find a standard that matches that. Try other words, or a code like MS-LS1-2.';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let data, index, aiOn = null, pending = null, busy = false, spotN = 0;
const turns = []; // { q, a } for follow-up questions
const chat = $('#chat'), form = $('#ask-form'), input = $('#q'), send = form.querySelector('.send');
const peByCode = new Map();
const urlOf = (code) => { const p = peByCode.get(code); return p ? `https://www.nextgenscience.org/pe/${p.u}` : '#'; };

// ---- the standards file: cached by the browser so it loads instantly next time, even offline
async function loadData() {
  try {
    const cache = await caches.open('standards-ai-data-1');
    const hit = await cache.match(DATA_URL);
    if (hit) return hit.json();
    const res = await fetch(DATA_URL);
    if (res.ok) { cache.put(DATA_URL, res.clone()).catch(() => {}); return res.json(); }
  } catch { /* no Cache API here: just download */ }
  return (await fetch(DATA_URL)).json();
}

// ---- AI answers on/off (on by default; remembered on this computer)
let aiWanted = true;
try { aiWanted = localStorage.getItem('sai-ai') !== 'off'; } catch { /* storage blocked: stays on */ }
const toggleBtn = $('#ai-toggle');
function paintToggle() { toggleBtn.textContent = aiWanted ? 'Turn off AI answers' : 'Turn on AI answers'; toggleBtn.setAttribute('aria-pressed', String(aiWanted)); }
toggleBtn.addEventListener('click', () => {
  aiWanted = !aiWanted;
  try { localStorage.setItem('sai-ai', aiWanted ? 'on' : 'off'); } catch { /* this visit only */ }
  paintToggle(); setMeta();
});
paintToggle();

function setMeta() {
  if (!data) return;
  const when = new Date(data.retrieved + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const ai = !aiWanted ? 'AI answers turned off' : aiOn === false ? 'AI answers unavailable right now, standards search only' : 'AI answers on';
  const m = $('#meta'); if (m) m.textContent = `${data.count} performance expectations, K–12, copied from nextgenscience.org on ${when} · ${ai}`;
}

// ---- the answer text: short paragraphs, lists and bold labels. Standard codes in brackets are
// left out of the words (the "Find it in the NGSS" button under the answer holds them).
const ANY_CODE = /\[([A-Z0-9][A-Z0-9-]*\d)\]|\b((?:K-2|3-5|K|[1-5]|MS|HS)-(?:PS|LS|ESS|ETS)\d-\d+)\b/g;
const words = (t) => String(t)
  // "...the standard [MS-LS1-2]" reads wrong without its code, so a code that is part of the sentence stays, plainly
  .replace(/\b(in|by|see|under|standard|from|of|to|per|with)\s+\[([A-Z0-9][A-Z0-9-]*\d)\]/g, '$1 $2')
  .replace(/\s*\[[A-Z0-9][A-Z0-9-]*\d\]/g, '').replace(/\s+([.,;:!?])/g, '$1');
const inline = (t) => esc(words(t)).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*\*/g, '');
function render(text) {
  const blocks = []; let list = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim(), m = line.match(/^(\d+[.)]|[-•])\s+(.*)$/);
    if (m) {
      const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (!list || list.tag !== tag) { list = { tag, items: [] }; blocks.push(list); }
      list.items.push(m[2]); continue;
    }
    list = null;
    if (line) blocks.push(line);
  }
  return blocks.map((b, i) => (typeof b === 'string' ? `<p style="--i:${i}">${inline(b)}</p>`
    : `<${b.tag} style="--i:${i}">${b.items.map((it) => `<li>${inline(it)}</li>`).join('')}</${b.tag}>`)).join('');
}

// ---- "Find it in the NGSS": the place in each standard where the topic appears, highlighted
const KIND = { SEP: 'Science and engineering practice', DCI: 'Disciplinary core idea', CCC: 'Crosscutting concept' };
const BAND = { K: 'Kindergarten', 1: '1st grade', 2: '2nd grade', 3: '3rd grade', 4: '4th grade', 5: '5th grade', 'K-2': 'Grades K–2', '3-5': 'Grades 3–5', MS: 'Middle school', HS: 'High school' };
const bandName = (c) => BAND[c.startsWith('K-2') ? 'K-2' : c.startsWith('3-5') ? '3-5' : c.split('-')[0]] || '';
const partsOf = (pe) => [['The performance expectation', pe.s], pe.cs && ['Clarification statement', pe.cs], pe.ab && ['Assessment boundary', pe.ab],
  ...pe.e.map((j) => { const [k, h, t] = data.el[j]; return [`${KIND[k]}: ${h}`, t]; })].filter(Boolean);
const root = (w) => (w.length >= 6 ? w.slice(0, 6) : w);
function matcher(focus) {
  const roots = new Set(focus.map(root));
  return (w) => { const t = tokens(w)[0]; return !!t && roots.has(root(t)); };
}
const highlight = (text, match) => String(text).split(/([A-Za-z]+)/).map((p, i) => (i % 2 && match(p) ? `<mark>${esc(p)}</mark>` : esc(p))).join('');
// topic words of a question: words the standards use, but not in so many standards that they say nothing
const topical = (text) => [...new Set(tokens(text))].filter((w) => index.df.has(w) && index.df.get(w) <= 30);

function standardCard(pe) {
  return `<div class="pe">
    <p class="s">${esc(pe.s)}</p>
    ${pe.cs ? `<p class="cs"><b>Clarification statement:</b> ${esc(pe.cs)}</p>` : ''}
    ${pe.ab ? `<p class="ab"><b>Assessment boundary:</b> ${esc(pe.ab)}</p>` : ''}
  </div>`;
}
// The standards to show: the ones the answer used, then any other match that actually uses the topic's words.
function spotsFor(cited, others, focus) {
  const match = matcher(focus);
  const found = (pe) => partsOf(pe).filter(([, t]) => t.split(/[^A-Za-z]+/).some(match));
  const list = [...cited.map((pe) => ({ pe, hits: found(pe), cited: true })),
    ...others.filter((pe) => !cited.includes(pe)).map((pe) => ({ pe, hits: focus.length ? found(pe) : [], cited: false })).filter((x) => x.hits.length)];
  return { list: list.slice(0, 3), match };
}
function findPanel({ cited, others, focus, open }) {
  const { list, match } = spotsFor(cited, others, focus);
  if (!list.length) return '';
  const id = `spot-${++spotN}`;
  const term = focus.length && list.some((x) => x.hits.length) ? focus[0] : '';
  const sub = `${list.map((x) => x.pe.c).join(', ')}${term ? ` · where it talks about “${esc(term)}”` : ''}`;
  const body = list.map(({ pe, hits }) => {
    const shown = hits.length ? hits.slice(0, 2) : [partsOf(pe)[0]];
    return `<div class="spot-pe">
      <p class="spot-head"><b>${esc(pe.c)}</b> ${esc(bandName(pe.c))} · ${esc(pe.t)}</p>
      ${shown.map(([where, t]) => `<p class="spot-where">${esc(where)}</p><blockquote>${highlight(t, match)}</blockquote>`).join('')}
      ${!hits.length && focus.length ? `<p class="none">This standard covers the bigger idea; it doesn’t use the word “${esc(focus[0])}”.</p>` : ''}
      <details><summary>Read the whole standard</summary>${standardCard(pe)}</details>
      <a class="official" href="${urlOf(pe.c)}" target="_blank" rel="noopener">Open ${esc(pe.c)} on nextgenscience.org ↗</a>
    </div>`;
  }).join('');
  return `<div class="find">
    <button type="button" class="find-btn" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${id}">
      <span class="pin"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" fill="currentColor"/><circle cx="12" cy="10" r="2.6" fill="var(--leaf)"/></svg></span>
      <span><span class="lbl">Find it in the NGSS</span><span class="sub">${sub}</span></span>
      <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="spot" id="${id}"${open ? '' : ' hidden'}>${body}</div>
  </div>`;
}
chat.addEventListener('click', (e) => {
  const btn = e.target.closest('.find-btn');
  if (btn) {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    document.getElementById(btn.getAttribute('aria-controls')).hidden = !open;
    return;
  }
  const chip = e.target.closest('.chips button');
  if (chip && !busy) ask(chip.textContent);
});

// ---- follow-ups the teacher can tap, so the conversation keeps going
const CHIPS = {
  explain: ['I don’t get it. Explain it more simply', 'How do I explain this to my students?', 'Give me a fun activity for this'],
  again: ['Still confused. Try another way', 'Got it! How do I explain it to my students?'],
  students: ['Turn this into a lesson plan', 'Give me 3 quiz questions on this'],
  teaching: ['Help me plan a lesson', 'Give me a quick game idea'],
  'plan-ask': ['Just pick for me'],
  'plan-write': ['Make it shorter', 'Turn it into a game', 'Make it harder'],
};
const chipsFor = (mode) => (CHIPS[mode] || []).map((c) => `<button type="button">${esc(c)}</button>`).join('');

// ---- one turn of the chat
function fill(box, { text, note, heard, cited = [], others = [], focus = [], open = false, mode = '' }) {
  box.classList.remove('thinking');
  const chips = chipsFor(mode);
  box.innerHTML = `<p class="who">Standards AI</p>${heard ? `<p class="heard">Looking at: <b>${esc(heard)}</b></p>` : ''}
    <div class="text${reduceMotion ? '' : ' reveal'}">${render(text)}</div>${note ? `<p class="note">${esc(note)}</p>` : ''}
    ${mode === 'plan-ask' ? '' : findPanel({ cited, others, focus, open })}${chips ? `<div class="chips" aria-label="Ask next">${chips}</div>` : ''}`;
}
function addTurn(q) {
  $('#intro')?.remove();
  chat.querySelectorAll('.chips').forEach((c) => c.remove()); // only the latest answer offers next steps
  const t = document.createElement('div');
  t.className = 'turn';
  t.innerHTML = `<div class="me"><p>${esc(q)}</p></div><div class="ai thinking"><p class="who">Standards AI</p><p class="text">Thinking</p></div>`;
  chat.appendChild(t);
  t.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  return t.querySelector('.ai');
}

// ---- asking
async function ask(q) {
  q = q.trim();
  if (!q || busy) return;
  if (!index) { pending = q; return; }
  busy = true; send.disabled = true;
  const box = addTurn(q);
  const local = search(index, q, 5).map((h) => h.pe);
  const heard = interpret(index, q);
  const localFocus = topical(heard.changed ? heard.text : q).slice(0, 3);
  try {
    // a bare code needs no AI: the standard itself is the answer
    if (codesIn(q).length && q.replace(/[\s-]/g, '').length <= 12) {
      const text = local.length ? `Here’s ${local[0].c}, word for word. Tap below to read it, or ask me what it means in plain words.` : NO_MATCH;
      fill(box, { text, cited: local.slice(0, 1), open: true });
      turns.push({ q, a: local.length ? `Here is ${local[0].c}, word for word [${local[0].c}].` : '' });
      return;
    }
    if (!aiWanted || aiOn === false) {
      const hello = smallTalk(q);
      if (hello) { fill(box, { text: hello }); return; }
      fill(box, {
        text: local.length ? 'AI answers are off, so here are the standards that match, word for word.' : NO_MATCH,
        note: aiWanted ? 'The AI server can’t be reached right now.' : 'Use “Turn on AI answers” at the top for a written answer.',
        heard: heard.changed ? heard.text : '', cited: local.slice(0, 3), focus: localFocus, open: true,
      });
      return;
    }
    // the server reads the first 300 characters of a question and 1,600 of an earlier answer; send no more than that
    const history = turns.slice(-6).map((t) => ({ q: t.q.slice(0, 300), a: t.a.slice(0, 1600) }));
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: q.slice(0, 300), history }) });
    const out = await res.json().catch(() => ({}));
    const pes = (out.sources || []).map((c) => peByCode.get(c)).filter(Boolean);
    const focus = (out.focus && out.focus.length ? out.focus : localFocus);
    if (res.status === 429) {
      fill(box, { text: 'That’s a lot of questions in one minute. Give it a moment, then ask again.' });
    } else if (out.answer) {
      // the standards the answer actually used; other matches show only if they use the topic's words
      const cited = [...new Set([...out.answer.matchAll(ANY_CODE)].map((m) => m[1] || m[2]).filter((c) => peByCode.has(c)))].map((c) => peByCode.get(c));
      fill(box, { text: out.answer, heard: out.interpreted || '', cited, others: pes, focus, mode: out.mode || (out.type === 'chat' ? '' : 'explain') });
      turns.push({ q, a: out.answer });
    } else if (out.status === 'unsupported') {
      fill(box, { text: 'I couldn’t check that answer against the standards, so I won’t guess. Try asking it another way. Here’s where the topic shows up in the NGSS.', heard: out.interpreted || '', cited: (pes.length ? pes : local).slice(0, 2), focus, open: true });
      turns.push({ q, a: '' });
    } else {
      fill(box, { text: 'AI answers are resting for today, so here are the standards that match, word for word.', note: 'The free daily allowance resets at midnight UTC.', cited: (pes.length ? pes : local).slice(0, 3), focus, open: true });
    }
  } catch {
    aiOn = false; setMeta();
    const hello = smallTalk(q);
    fill(box, hello ? { text: hello } : { text: local.length ? 'I can’t reach the AI right now, so here are the standards that match, word for word.' : NO_MATCH, heard: heard.changed ? heard.text : '', cited: local.slice(0, 3), focus: localFocus, open: true });
  } finally {
    busy = false; send.disabled = false;
    input.focus({ preventScroll: true });
  }
}

const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, innerHeight * 0.3) + 'px'; };
form.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value; input.value = ''; grow(); ask(q); });
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
input.addEventListener('input', grow);
document.querySelectorAll('.starters button').forEach((b) => b.addEventListener('click', () => ask(b.textContent)));
$('#new-chat').addEventListener('click', () => { location.href = location.pathname; });

// Is the AI server reachable? Search works either way.
const ctl = new AbortController(); setTimeout(() => ctl.abort(), 5000);
fetch(ENDPOINT.replace(/\/ask$/, '/health'), { signal: ctl.signal })
  .then((r) => r.json()).then((h) => { aiOn = !!(h && h.ok); })
  .catch(() => { aiOn = false; })
  .finally(setMeta);

loadData().then((d) => {
  data = d; index = createIndex(d);
  for (const p of d.pe) peByCode.set(p.c, p);
  setMeta();
  const q = pending || new URLSearchParams(location.search).get('q');
  pending = null;
  if (q) ask(q);
}).catch(() => { const m = $('#meta'); if (m) m.textContent = 'The standards could not be loaded. Check your connection and reload the page.'; });
