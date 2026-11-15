// Standards search, shared by the Standards AI page (runs in the visitor's browser)
// and the AI server (Cloudflare Worker), so both always find the same standards.
// No libraries: a few kilobytes that run quickly on any computer.

const STOP = new Set(('a an and are as at be been by can could do does doing for from has have how i if in into is it its ' +
  'me my of on or our should so than that the their them then there these they this those to too us was we were what when ' +
  'where which who why will with would you your about tell explain show give list any all also much many more most need want ' +
  'know does standard standards ngss performance expectation expectations students student teach teaching cover covers hs ms ' +
  'assessment boundary boundaries clarification statement say says said mean means grade grades level middle high school ' +
  'elementary kindergarten kinder first second third fourth fifth sixth seventh eighth 1st 2nd 3rd 4th 5th 6th 7th 8th').split(' '));

function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2);
  if (w.length > 5 && w.endsWith('oes')) return w.slice(0, -2); // volcanoes, potatoes
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
  return w;
}

export function tokens(text) {
  return (String(text).toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
}

// Standard codes look like MS-LS1-2, K-PS2-1, 3-5-ETS1-1, HS-ESS3-4. A partial code (MS-LS1)
// matches every expectation under it.
const CODE = /\b(k-2|3-5|k|[1-5]|ms|hs)[\s-]*(ps|ls|ess|ets)\s*(\d)(?:[\s-]+(\d{1,2}))?\b/gi;
export function codesIn(query) {
  return [...String(query).matchAll(CODE)].map((m) => (m[1] + '-' + m[2] + m[3] + (m[4] ? '-' + m[4] : '')).toUpperCase());
}

// Grade words in a question nudge results toward that grade band.
const BANDS = [
  [/\b(kindergarten|kinder)\b/i, ['K']],
  [/\b(first grade|grade 1|1st grade)\b/i, ['1', 'K-2']],
  [/\b(second grade|grade 2|2nd grade)\b/i, ['2', 'K-2']],
  [/\b(third grade|grade 3|3rd grade)\b/i, ['3', '3-5']],
  [/\b(fourth grade|grade 4|4th grade)\b/i, ['4', '3-5']],
  [/\b(fifth grade|grade 5|5th grade)\b/i, ['5', '3-5']],
  [/\b(elementary)\b/i, ['K', '1', '2', '3', '4', '5', 'K-2', '3-5']],
  [/\b(middle school|grade [678]|[678]th grade|sixth|seventh|eighth|ms)\b/i, ['MS']],
  [/\b(high school|grades? (9|10|11|12)|(9|10|11|12)th grade|biology|chemistry|physics|hs)\b/i, ['HS']],
];
// Grade bands a question asks for, e.g. ['MS'] for "middle school photosynthesis".
export function bandsIn(query) { return BANDS.filter(([re]) => re.test(query)).flatMap(([, b]) => b); }
export { bandOf };
const bandOf = (code) => (code.startsWith('K-2') ? 'K-2' : code.startsWith('3-5') ? '3-5' : code.split('-')[0]);

export function createIndex(data) {
  const docs = data.pe.map((p, i) => {
    const el = p.e.map((j) => data.el[j]);
    // field weights: the expectation itself counts most, then its clarification
    const fields = [[p.c + ' ' + p.t, 1.4], [p.s, 2.2], [p.cs, 1.3], [p.ab, 0.6], [el.map((e) => e[1] + ' ' + e[2]).join(' '), 0.7]];
    const tf = new Map(); let len = 0;
    for (const [txt, w] of fields) for (const t of tokens(txt)) { tf.set(t, (tf.get(t) || 0) + w); len += w; }
    return { i, tf, len };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avg = docs.reduce((a, d) => a + d.len, 0) / docs.length;
  // spelling help: every word the standards use, and the same words with their letters sorted
  const vocab = [...df.keys()].filter((t) => /^[a-z]+$/.test(t) && t.length > 3);
  const anagram = new Map();
  for (const t of vocab) { const k = [...t].sort().join(''); if (!anagram.has(k) || df.get(t) > df.get(anagram.get(k))) anagram.set(k, t); }
  return { data, docs, df, avg, N: docs.length, vocab, anagram };
}

// Edit distance that counts a swap of two neighbouring letters as one change.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

// A word the standards never use is swapped for the closest one they do: a misspelling
// (mitocondria), swapped letters (mtiochondira) or fully scrambled letters (aidnorhcotim).
function fixWord(index, w) {
  // short words are too easy to mistake for other words, so they are left alone
  if (index.df.has(w) || w.length < 5 || /\d/.test(w)) return w;
  const scrambled = w.length >= 6 && index.anagram.get([...w].sort().join(''));
  if (scrambled) return scrambled;
  const max = w.length >= 8 ? 2 : 1;
  let best = null, bestD = max + 1;
  for (const t of index.vocab) {
    // typos usually keep the first letter; long words may not (fotosynthesis)
    if (w.length < 8 && t[0] !== w[0]) continue;
    const dd = distance(w, t, max);
    if (dd < bestD || (dd === bestD && best && index.df.get(t) > index.df.get(best))) { best = t; bestD = dd; }
  }
  return best || w;
}

// What the search will actually look for, after spelling help: { text, changed }.
export function interpret(index, query) {
  const raw = (String(query).toLowerCase().replace(CODE, ' ').match(/[a-z0-9]+/g) || []).filter((w) => w.length > 1 && !STOP.has(w));
  const fixed = raw.map((w) => { const st = stem(w); const f = fixWord(index, st); return f === st ? w : f; });
  return { text: fixed.join(' '), changed: fixed.some((f, i) => f !== raw[i] && f !== stem(raw[i])) };
}

// Returns [{ pe, score }] best first.
export function search(index, query, limit = 8) {
  const { data, docs, df, avg, N } = index;
  const out = new Map();
  // 1. exact or partial codes always come first
  for (const code of codesIn(query)) {
    data.pe.forEach((p, i) => {
      if (p.c === code) out.set(i, 1e6);
      else if (p.c.startsWith(code + '-') && !out.has(i)) out.set(i, 1e5 - i);
    });
  }
  // 2. ranked text match (BM25)
  const q = [...new Set(tokens(query.replace(CODE, ' ')).map((t) => fixWord(index, t)))];
  const bands = bandsIn(query.replace(CODE, ' '));
  if (q.length) {
    const k1 = 1.2, b = 0.75;
    for (const d of docs) {
      let s = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));
        s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avg));
      }
      if (s <= 0) continue;
      if (bands.length && bands.includes(bandOf(data.pe[d.i].c))) s *= 1.6;
      if (!out.has(d.i)) out.set(d.i, s);
    }
  }
  const ranked = [...out.entries()].sort((a, b) => b[1] - a[1]);
  // drop weak tail matches: keep results within reach of the best text match
  const best = ranked.find(([, s]) => s < 1e5)?.[1] || 0;
  return ranked
    .filter(([, s]) => s >= 1e5 || s >= best * 0.35)
    .slice(0, limit)
    .map(([i, score]) => ({ pe: data.pe[i], score }));
}

const KIND = { SEP: 'Science and engineering practice', DCI: 'Disciplinary core idea', CCC: 'Crosscutting concept' };

// The full NGSS text of one performance expectation, as plain text.
export function sourceText(data, p) {
  const lines = [
    `${p.c} (${p.t})`,
    `Performance expectation: Students who demonstrate understanding can: ${p.s}`,
  ];
  if (p.cs) lines.push(`Clarification statement: ${p.cs}`);
  if (p.ab) lines.push(`Assessment boundary: ${p.ab}`);
  for (const j of p.e) { const [k, h, t] = data.el[j]; lines.push(`${KIND[k]}, ${h}: ${t}`); }
  return lines.join('\n');
}
