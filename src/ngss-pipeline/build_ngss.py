"""Build standards-ai/ngss.json from saved nextgenscience.org performance expectation pages.

usage: python3 build_ngss.py <dir with pe/*.html> <out.json> <retrieved-date YYYY-MM-DD>

Output (compact on purpose, so it loads fast on slow computers):
{
  "source": ..., "retrieved": ..., "count": N,
  "el": [[kind, heading, text], ...],      # unique foundation-box elements, stored once
  "pe": [{"c": code, "t": topic, "s": statement, "cs": clarification, "ab": boundary,
          "e": [element indexes], "u": url slug}, ...]
}
kind is "SEP" (practice), "DCI" (core idea) or "CCC" (crosscutting concept, including the
"Connections to ..." boxes, which the site prints in the same column).
"""
import sys, os, re, json, glob, html

SRC, OUT, DATE = sys.argv[1], sys.argv[2], sys.argv[3]


def text(fragment):
    t = re.sub(r'<[^>]+>', ' ', fragment)
    t = html.unescape(t).replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', t).strip()


def column(page, cls):
    m = re.search(r'<td class="%s">(.*?)</td>' % cls, page, re.S)
    return m.group(1) if m else ''


def elements(col_html, kind):
    """Walk h2/h3/h4/li in order: headings label the bullets that follow."""
    out, heading, sub = [], '', ''
    for tag, body in re.findall(r'<(h2|h3|h4|li)[^>]*>(.*?)</\1>', col_html, re.S):
        t = text(body)
        if not t:
            continue
        if tag == 'h2':
            continue
        if tag == 'h3':
            heading, sub = t, ''
        elif tag == 'h4':
            sub = t
        else:
            label = heading + (' (' + sub + ')' if sub else '')
            out.append((kind, label, t))
    return out


els, el_index, pes = [], {}, []
for path in sorted(glob.glob(os.path.join(SRC, 'pe', '*.html'))):
    page = open(path, encoding='utf-8', errors='ignore').read()
    # Pages come in two HTML styles. Normalise: drop hover-text attributes (they contain raw
    # HTML), and turn single-quoted class names into double-quoted ones.
    page = re.sub(r'\stitle="[^"]*"', '', page)
    page = re.sub(r"\stitle='[^']*'", '', page)
    page = re.sub(r"class='([^']*)'", r'class="\1"', page)
    m = re.search(r'<span class="code">(.*?)</span>(.*?)</p>', page, re.S)
    if not m:
        print('skip (no code):', path); continue
    code, topic = text(m.group(1)), text(m.group(2))
    row = re.search(r'<tr class="row2">(.*?)<tr class="row2b">', page, re.S)
    if not row:
        print('skip (no statement):', path); continue
    cell = re.search(r'<th>\s*' + re.escape(code) + r'\.?\s*</th>\s*<td>(.*)', row.group(1), re.S)
    body = cell.group(1) if cell else row.group(1)
    body = re.split(r'</table>', body)[0]
    red = body.find('<span class="red">')
    statement = text(body[:red] if red >= 0 else body)
    extra = text(body[red:]) if red >= 0 else ''
    statement = re.sub(r'^Students who demonstrate understanding can:\s*', '', statement)
    cs = re.search(r'Clarification Statement:\s*(.*?)\s*\]', extra)
    ab = re.search(r'Assessment Boundary:\s*(.*?)\s*\]', extra)
    ids = []
    for cls, kind in (('blue', 'SEP'), ('orange', 'DCI'), ('green', 'CCC')):
        for e in elements(column(page, cls), kind):
            if e not in el_index:
                el_index[e] = len(els); els.append(list(e))
            ids.append(el_index[e])
    pes.append({'c': code, 't': topic, 's': statement, 'cs': cs.group(1) if cs else '',
                'ab': ab.group(1) if ab else '', 'e': ids,
                'u': os.path.splitext(os.path.basename(path))[0]})


def order(code):
    band = code.split('-')[0]
    rank = {'K': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, 'K-2': 5.5, '3-5': 5.6, 'MS': 6, 'HS': 7}.get(band, 9)
    nums = [int(n) for n in re.findall(r'\d+', code.split('-', 1)[1])] if '-' in code else []
    return (rank, re.sub(r'[\d-]', '', code.split('-', 1)[-1]), nums)


pes.sort(key=lambda p: order(p['c']))
data = {'source': 'Next Generation Science Standards, nextgenscience.org (NGSS Lead States, 2013)',
        'retrieved': DATE, 'count': len(pes), 'el': els, 'pe': pes}
json.dump(data, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(pes), 'performance expectations,', len(els), 'unique elements,', os.path.getsize(OUT), 'bytes')
