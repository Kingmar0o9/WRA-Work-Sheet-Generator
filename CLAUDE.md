# Notes for Claude Code

Read `PRODUCT.md` (what the site is and what may be claimed) and `DESIGN.md` (the design system) before changing pages.

## Web work

- Use the `modern-web-guidance` skill (`.claude/skills/modern-web-guidance/`) first for any HTML, CSS or browser JavaScript change, and follow its fallback advice.
- **Browser support:** the site must stay usable on old school iPads and Chromebooks. Newer features are progressive enhancement only: feature-detect them, and the page must still work without them. Scripts in `assets/js/` are written in plain older JavaScript (no build step).
- **Caching:** shared files are loaded with a version in the address (`site.js?v=20261117b`). When you change one, bump its `?v=` in every page that loads it. When you change the rules in `sw.js`, bump its `VERSION`.
- **Security:** every page has a Content-Security-Policy `<meta>` line. Anything new the page loads must be allowed there.
- The worksheet generator (`cell-kit-generator/index.html`) is one self-contained file so it works offline; keep it that way.
