#!/bin/bash
# Polite crawl of nextgenscience.org performance expectation pages (1 request/second).
D="$1"; cd "$D" || exit 1
: > pe_urls.txt
for i in $(seq 0 34); do
  curl -sSL -A "Mozilla/5.0 (education project crawler)" "https://www.nextgenscience.org/search-standards?page=$i" | grep -o 'href="/pe/[^"]*"' | sed 's/href="//; s/"$//' >> pe_urls.txt
  sleep 1
done
sort -u pe_urls.txt -o pe_urls.txt
echo "index done: $(wc -l < pe_urls.txt) PEs"
while read -r u; do
  f="pe/$(basename "$u").html"
  [ -s "$f" ] || { curl -sSL -A "Mozilla/5.0 (education project crawler)" -o "$f" "https://www.nextgenscience.org$u"; sleep 1; }
done < pe_urls.txt
echo "pages done: $(ls pe | wc -l)"
