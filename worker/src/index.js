// Standards AI server (Cloudflare Worker, free plan).
//
// POST /ask {"q": "...", "history": [{q, a}]}
//   ->  {"answer": "... [MS-LS1-2] ...", "sources": ["MS-LS1-2", ...], "focus": ["mitochondria"],
//        "type": "science", "status": "ok"}
// GET  /health  ->  what is loaded
//
// It is a teaching assistant for science teachers: it answers first, in plain words, then gives
// the facts, then says where the idea is in the NGSS. It works from two sources:
//   - science notes (standards-ai/science.json): short, checked explanations of common topics,
//     so the science is right. These are general science, never cited as the NGSS.
//   - its own copy of the NGSS text (standards-ai/ngss.json), for anything it says about the NGSS.
// The two are kept apart:
//   1. For each question it finds the matching performance expectations (the same search the
//      web page uses) and gives the model that text.
//   2. Anything the answer says the NGSS says must end with that standard's code, like [MS-LS1-2].
//      The page hides the codes in the text and shows a "Find it in the NGSS" button under the
//      answer that opens the exact spot in that standard.
//   3. Before an answer goes out, every coded sentence is checked against the standard it cites:
//      quotes must be word for word, assessment boundaries may only be quoted, and its science
//      words must actually be in that standard. A coded sentence that fails is cut (or, if it is
//      plain science that doesn't claim to be the NGSS, it keeps its words and loses the code).

import data from '../../standards-ai/ngss.json';
import sci from '../../standards-ai/science.json';
import { createIndex, search, sourceText, codesIn, interpret, bandsIn, bandOf, tokens, smallTalk, createNotes, findNotes, noteText } from '../../standards-ai/search.js';

const index = createIndex(data);
const notes = createNotes(sci);

const SYSTEM = `You are Standards AI on wrastem.com: a warm, friendly teaching assistant for science teachers, mostly in middle school. You are like the helpful colleague down the hall who knows science well and loves helping with lessons. Talk the way a kind, clear person talks: natural, simple words, short sentences, a little encouragement. Never stiff or robotic.

WHAT YOU WORK FROM
- SCIENCE NOTES: checked science facts. Use them so everything you say about science is correct.
- SOURCES: the official NGSS text. Only SOURCES can tell you what the NGSS says.
- Your own solid science knowledge and good classroom practice, when the notes don't cover something. Only say what any good science textbook agrees on.
- Be exact with science words: energy is released, transferred or changed from one form to another, never "made", "created" or "generated" by a cell.

Each message ends with a MODE line. Answer in that mode, and never write the MODE line or mode name in your answer.

MODE explain (what something is, how or why it works)
1. Answer first: one or two sentences that answer the question directly, in words a 12-year-old could follow. No warm-up like "Great question!".
2. The key facts: 3 or 4 short "- " bullet points about how it works. Define any science word the first time you use it.
3. One everyday comparison that makes it click ("Think of it like...").
4. One sentence on where it is in the NGSS (see WHERE IT IS IN THE NGSS).
5. One short, friendly offer of a next step that fits, like "Want a quick way to explain this to your students?"
About 120 to 190 words.

MODE again (they didn't understand, or want it simpler)
Explain the same idea again in a new way: simpler words, 3 to 5 short sentences, an everyday comparison you haven't used yet in this chat and one example from daily life, and no new science words. Don't repeat your last answer and don't make them feel bad. No NGSS line. End by checking in, like "Does that make more sense?" Keep doing this as many times as they ask.

MODE students (how to explain or teach it to their students)
1. One or two sentences on the big idea, in plain words.
2. **Say it like this:** a short script, 2 to 4 sentences, the teacher can say to the class, with an everyday comparison.
3. **Try this:** a quick demo or activity, 2 or 3 sentences.
4. **Ask the class:** 2 questions that get students thinking.
5. **Watch for:** one common mix-up students have, and how to fix it.
6. One sentence on where it is in the NGSS.
About 150 to 230 words.

MODE teaching (a classroom problem or general teaching advice)
If they sound stuck or frustrated, start with one short, understanding phrase. Give 2 or 3 concrete ideas as a numbered list. If a standard fits, add one sentence on where it is in the NGSS. Then ask one question that helps you help them more (for example their grade or topic).

MODE plan-ask (they want a lesson, activity, lab, game, project, review or event, but you don't know their students yet)
Don't write the plan yet. Say one friendly line, then ask 2 or 3 short questions, each on its own "- " line: grade or age, how much time they have, and one more that matters (materials, class size, or what students should get out of it). You may add a one-line preview of an idea you have in mind. Under 70 words.

MODE plan-write (write the plan)
If something is still unknown, pick a sensible default and say so in a few words. Never ask the same questions again. Lay it out like this, each label in bold on its own line:
**Goal:** one sentence, with the matching standard's code at the end.
**You'll need:** a short list.
**Steps:** 3 to 5 numbered steps, each with a rough time.
**Questions to ask:** 2 or 3 questions for students.
**Quick check:** one exit-ticket question.
About 180 to 260 words: practical, fun, and ready to use tomorrow. End with one short offer to change something (shorter, harder, a game version).

MODE chat
Greetings and small talk: a sentence or two, then offer to help. Questions that aren't about science or teaching: kindly say you help with science and science teaching.

WHERE IT IS IN THE NGSS
One sentence, with no label in front of it: which grade band learns this in the NGSS and what students do with it, using the words of the standard in SOURCES that fits best, ending with that standard's code in square brackets, like [MS-LS1-2]. The NGSS groups grades 6 to 8 as middle school and 9 to 12 as high school, so say "middle school" or "high school", not one grade. The code goes at the very end, never inside the sentence (not "as described in [MS-LS1-2]"). If no standard in SOURCES fits the topic, say in a few words that the NGSS doesn't name it directly.

THE NGSS RULES (very important)
- When you say what the NGSS says, expects or includes, use only SOURCES, and end that sentence with the code in square brackets, exactly as written in SOURCES.
- Pick the standard whose text is actually about the topic. Science facts and teaching ideas get no code.
- Never say the NGSS says something that isn't in SOURCES. Never make up codes, quotes, studies, websites or links.
- How something is assessed: quote the assessment boundary word for word, in quotation marks.

STYLE
- Plain text with short paragraphs, "- " bullets or "1." numbered lists. Bold (**like this**) only for short labels. No headings, tables or emojis.
- This is a conversation: use earlier turns to understand "it", "that", "what about 5th grade?" or a short reply like "7th grade, 45 minutes".
- This site, WRA STEM Kits, makes a 3D printed plant cell model kit and a worksheet generator for MS-LS1-2. When a teacher is planning something on plant cells or cell parts, you may suggest the kit in one short sentence.`;

// Step 1 (routing): a small, fast model works out what kind of message this is and what the
// person meant (misspellings, scrambled letters, everyday words). It does not answer.
const ROUTER = `You read a teacher's message to a science teaching assistant. Reply with one line of JSON and nothing else:
{"type":"chat, science, teaching, plan or other","keywords":"3 to 8 correctly spelled science words for the topic, most important first","grade":"K, 1, 2, 3, 4, 5, MS, HS or any"}
type: chat = greetings, thanks, small talk or questions about you. science = what a science idea is or how it works, including "I don't understand" or "simpler please" about an earlier topic. teaching = how to teach or explain something, or any classroom problem (for example "my students are bored"). plan = they want you to create or plan a lesson, activity, lab, game, project, review or event, or they are answering your questions about one (for example "7th grade, 45 minutes"). other = not about science or teaching.
The message may be misspelled, scrambled or vague: work out the science topic it most likely means. For follow-ups ("what about high school?", "I don't get it", "6th grade"), take the topic from the earlier questions.
grade: only a grade or age the message or earlier questions name (ages 11 to 14 are MS); otherwise "any".
Keywords are science words only, never words like "explain", "simple", "fun" or "activity". Leave keywords empty for chat, other, or a teaching or plan message with no science topic.
Do not answer the question. Do not invent standard codes.`;
// Workers AI models reply either as { response } or in the chat-completions shape.
// A reply that is JSON may arrive already decoded into an object.
const textOf = (r) => {
  const v = r && (r.response ?? r.choices?.[0]?.message?.content);
  return v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
};

const GRADE_WORDS = { K: 'kindergarten', 1: 'first grade', 2: 'second grade', 3: 'third grade', 4: 'fourth grade', 5: 'fifth grade', MS: 'middle school', HS: 'high school' };
const TYPES = ['chat', 'science', 'teaching', 'plan', 'other'];
// "how do I explain this to my 6th graders?"
const TO_STUDENTS = /\b(explain|teach|show|describe|introduce|present)\b.*\b(to|with|for)\s+(my\s+|the\s+|a\s+|our\s+)?(students|kids|class|classes|children|learners|kindergartners|\w+\s*graders?)\b/i;
// "I don't get it", "simpler please", "huh?"
const AGAIN = /\b(don'?t|do not|doesn'?t|didn'?t|still (don'?t|not)) (get|understand|follow)|\b(confus|lost\b|simpler|more simply|easier|dumb it down|eli5|another way|different way|again)|^(what|huh|wait|hm+)\W*$|^(i'?m )?(still )?not sure/i;

async function route(env, q, spell, history = []) {
  try {
    // the spelling help (which can unscramble letters) and earlier questions go along as hints
    const before = history.length ? `Earlier questions in this chat: ${history.map((t) => `"${t.q}"`).join(', ')}\n` : '';
    const user = before + `Message: "${q}"` + (spell ? `\nSpell-checked: "${spell}"` : '');
    const r = await env.AI.run(env.ROUTER_MODEL, {
      messages: [{ role: 'system', content: ROUTER }, { role: 'user', content: user }],
      max_tokens: 80, temperature: 0,
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
  'simpler simplest easier easy again shorter longer another more less version ' +
  'goal goals need step steps question questions check quick ticket exit minute minutes time fun game games ' +
  'create creates creating plan plans planning lesson lessons review project projects lab labs ' +
  'come comes came coming up down out off together along through around between within during each every other same ' +
  'worksheet worksheets generator kit kits printed print whiteboard marker markers handout handouts ' +
  'thing things stuff happen happens really actually usually often also part parts piece pieces get gets got ' +
  'student students teacher teachers grader graders explore explores explain explains everyday compare'));
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
  if (bands.length !== 1 || phrases.length !== 1) return sent;
  // the NGSS has one band for grades 6-8: "in 7th grade [MS-LS1-2]" becomes "in middle school"
  const single = /^(sixth|seventh|eighth|6th|7th|8th) grade$/i.test(phrases[0][0]) && bands[0] === 'MS';
  if (!single && fits(phraseBand(phrases[0][0]), bands[0])) return sent;
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

// models sometimes add markdown; the page shows short paragraphs, lists and bold labels
// (a question tacked onto the last list item becomes its own line)
const tidy = (t) => t.replace(/__/g, '').replace(/^\s*\(?MODE:?\s*[a-z-]+\)?\s*$/gim, '').replace(/^\s*(\*\*)?(the )?ngss line:?(\*\*)?:?\s*/gim, '').replace(/^#+\s*(.+?)\s*$/gm, (m, h) => (/\*\*/.test(h) ? h : `**${h}**`)).replace(/^\s*[*•]\s+/gm, '- ').replace(/[ \t]+\n/g, '\n')
  .replace(/^(\s*(?:\d+[.)]|-)\s+.*?[.!])\s+([A-Z][^\n]*\?)\s*$/gm, '$1\n\n$2')
  // "..., as described in [MS-LS1-2]." -> "... [MS-LS1-2]." (the page hides the code, so it can't be part of the sentence)
  .replace(/,?\s+(?:as (?:described|outlined|stated|explained|shown|seen|listed) in|according to|in line with|aligned (?:with|to)|based on|from|per|see|in)\s+(?:the\s+)?(?:NGSS\s+)?(?:standard\s+)?(\[[A-Z0-9][A-Z0-9-]*\d\])/g, ' $1').trim();

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
  const text = `A teacher requested the plant cell kit on wrastem.com.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nReply to this email to answer them. They were told you'll get back to them as soon as possible.`;
  const html = `<p>A teacher requested the plant cell kit on wrastem.com.</p><table cellpadding="6" style="border-collapse:collapse">${
    rows.map(([k, v]) => `<tr><th align="left" valign="top">${k}</th><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join('')
  }</table><p>Reply to this email to answer them. They were told you'll get back to them as soon as possible.</p>`;
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
      history = (Array.isArray(body.history) ? body.history : []).slice(-6)
        .map((t) => ({ q: String(t?.q || '').slice(0, 300), a: String(t?.a || '').slice(0, 1600) }))
        .filter((t) => t.q);
    } catch { /* bad body */ }
    if (q.length < 2) return json({ error: 'empty' }, 400);

    // "hi", "thanks", "who are you": a friendly reply, no AI needed
    const hello = smallTalk(q);
    if (hello) {
      console.log(JSON.stringify({ q, status: 'small_talk' }));
      return json({ answer: hello, sources: [], interpreted: null, focus: [], type: 'chat', status: 'ok' });
    }

    // "How is MS-LS1-2 assessed?" / "clarification for HS-LS1-5": answer straight from the text
    const named = codesIn(q).map((c) => data.pe.find((p) => p.c === c)).filter(Boolean);
    if (named.length === 1 && /\b(assess|boundar|clarif)/i.test(q)) {
      const pe = named[0], wantsBoundary = /\b(assess|boundar)/i.test(q);
      const part = wantsBoundary ? pe.ab : pe.cs, label = wantsBoundary ? 'assessment boundary' : 'clarification statement';
      const answer = part ? `Here's the ${label} for ${pe.c}, word for word: "${part}" [${pe.c}]` : `${pe.c} doesn't have a ${label} [${pe.c}].`;
      console.log(JSON.stringify({ q, sources: [pe.c], status: 'direct' }));
      return json({ answer, sources: [pe.c], interpreted: null, focus: [], type: 'science', status: 'ok' });
    }

    const cache = caches.default;
    const key = new Request(`https://cache.standards-ai/${env.CACHE_TAG || 'v13'}/ask?q=` + encodeURIComponent(normal(q)));
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
    let topic = '';
    if (type !== 'chat' && type !== 'other') {
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
      topic = (spell.changed && (!routed || agrees)) ? spell.text : routed && routed.words ? routed.words : spell.changed ? spell.text : '';
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

    // The science notes for this topic: from the person's words, or for a follow-up
    // ("I don't get it"), from the earlier questions and what the router worked out.
    const found = type === 'chat' || type === 'other' ? []
      : findNotes(notes, [q, spell.changed ? spell.text : ''].join(' '),
        [...history.slice(-2).map((t) => t.q), routed ? routed.words.split(',').slice(0, 2).join(' ') : ''].join(' '));
    const science = found.length ? found.map(noteText).join('\n\n') : 'No notes for this topic: use well-established science only.';

    // The words "Find it in the NGSS" highlights in the standard: the topic words of the
    // question, or else of the router's reading of it.
    const topical = (text) => [...new Set(tokens(text))].filter((w) => !FRAMING.has(w) && index.df.has(w) && index.df.get(w) <= TOPICAL_MAX_DF);
    const focus = (topical([q, spell.changed ? spell.text : ''].join(' ')).length ? topical([q, spell.changed ? spell.text : ''].join(' '))
      : topical(history.length ? history[history.length - 1].q : '').length ? topical(history[history.length - 1].q) : topical(topic)).slice(0, 4);

    // Which kind of answer this needs (MODE in the prompt).
    const said = [q, ...history.map((t) => t.q)].join(' ');
    const knowsGrade = bandsIn(said).length > 0 || (routed && routed.band) || /\b(\d{1,2}(st|nd|rd|th)?[- ]?(grade|graders?|year[- ]?olds?|yrs?)|age[sd]? \d)/i.test(said);
    // the last answer already asked who the students are (so don't ask again)
    const asked = history.length > 0 && /\b(grade|age|how old|how much time|how long)\b[^.!?\n]*\?/i.test(history[history.length - 1].a);
    const mode = type === 'chat' || type === 'other' ? 'chat'
      : type === 'plan' ? (knowsGrade || asked || /\b(just|go ahead|anything|any grade|surprise me|you pick|you choose)\b/i.test(q) ? 'plan-write' : 'plan-ask')
      : TO_STUDENTS.test(q) ? 'students'
      : history.length && AGAIN.test(q) ? 'again'
      : type === 'teaching' ? 'teaching' : 'explain';
    const hint = `\nMODE: ${mode}` + (mode === 'teaching' && !hits.length ? ' (no topic yet: give ideas that work in most science classes, then ask what topic and grade they teach)' : '');

    let answer = null, status = 'ok';
    try {
      const r = await env.AI.run(env.MODEL, {
        messages: [
          { role: 'system', content: SYSTEM },
          ...history.flatMap((t) => [{ role: 'user', content: t.q }, ...(t.a ? [{ role: 'assistant', content: t.a }] : [])]),
          { role: 'user', content: `SCIENCE NOTES (checked science, not NGSS text; never give these a code):\n\n${science}\n\n===\n\nSOURCES (NGSS text):\n\n${context}\n\n===\n\nMESSAGE: ${q}${interpreted ? `\n(This most likely means: ${interpreted})` : ''}${hint}` },
        ],
        max_tokens: 700,
        temperature: 0.4,
      });
      answer = tidy(textOf(r));
    } catch (err) {
      // most often the free daily allowance is used up; the page falls back to search results
      status = 'ai_unavailable';
      console.log(JSON.stringify({ q, type, interpreted, sources, status, error: String(err).slice(0, 200) }));
      return json({ answer: null, sources, interpreted, focus, type, status });
    }

    const checked = checkAnswer(answer, texts);
    if (checked.cut.length || checked.uncited.length) console.log(JSON.stringify({ q, cut: checked.cut, uncited: checked.uncited }));
    if (!checked.text) { answer = null; status = 'unsupported'; } else answer = checked.text;

    console.log(JSON.stringify({ q, type, mode, interpreted, sources, notes: found.map((n) => n.t), status }));
    const res = json({ answer, sources, interpreted, focus, type, mode, status });
    if (status === 'ok' && !history.length) ctx.waitUntil(cache.put(key, new Response(res.clone().body, { headers: { 'Cache-Control': 'max-age=604800' } })));
    return res;
  },
};
