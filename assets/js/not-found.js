// The page-not-found page (404.html).
// Show the address that wasn't found, and if it looks like one of the site's
// pages (a typo, capital letters, an old name), offer that page.
(function () {
  var path = location.pathname;
  try { path = decodeURIComponent(path); } catch (e) {}

  // Opened directly as /404.html (a preview): there is no missing address to show.
  if (/^\/404(\.html)?\/?$/.test(path)) return;

  var shown = (location.host + path).replace(/\/+$/, '');
  if (shown.length > 90) shown = shown.slice(0, 90) + '…';
  document.getElementById('tried-url').textContent = shown;
  document.getElementById('tried').hidden = false;

  var pages = [
    { href: '/cell-kit-generator/', name: 'the Worksheet Generator', words: ['cellkitgenerator', 'worksheetgenerator', 'generator', 'worksheet', 'worksheets', 'answerkey'] },
    { href: '/standards-ai/', name: 'Standards AI', words: ['standardsai', 'standards', 'standard', 'ngss', 'ai'] },
    { href: '/purchase/', name: 'the Request kits page', words: ['purchase', 'request', 'requestkits', 'order', 'buy'] }
  ];

  // how many single-letter changes turn a into b
  function distance(a, b) {
    var row = [], i, j;
    for (j = 0; j <= b.length; j++) row[j] = j;
    for (i = 1; i <= a.length; i++) {
      var prev = row[0]; row[0] = i;
      for (j = 1; j <= b.length; j++) {
        var keep = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        prev = keep;
      }
    }
    return row[b.length];
  }

  var parts = path.toLowerCase().split('/'), best = null, bestScore = 99;
  for (var s = 0; s < parts.length; s++) {
    var seg = parts[s].replace(/\.(html?|php|aspx?)$/, '').replace(/[^a-z0-9]/g, '');
    if (!seg || seg === 'index') continue;
    for (var p = 0; p < pages.length; p++) {
      for (var w = 0; w < pages[p].words.length; w++) {
        var word = pages[p].words[w], score = 99;
        if (seg === word) score = 0;
        else if (word.length >= 5 && seg.indexOf(word) !== -1) score = 1;
        else if (seg.length >= 5 && word.indexOf(seg) !== -1) score = 1;
        else if (word.length >= 5) {
          var d = distance(seg, word);
          if (d <= Math.floor(word.length / 4)) score = 1 + d;
        }
        if (score < bestScore) { bestScore = score; best = pages[p]; }
      }
    }
  }
  if (best) {
    var link = document.getElementById('guess-link');
    link.href = best.href;
    link.textContent = best.name;
    document.getElementById('guess').hidden = false;
  }
})();
