---
name: modern-web-guidance
description: |
  Modern web platform best practices (Google Chrome, Microsoft Edge, Mozilla Firefox and MDN teams), bundled offline with 210 guides. Use FIRST for any HTML, CSS or client-side JavaScript work: building or changing pages, components, layout, animation, forms, accessibility, performance (LCP, INP, CLS, image/script/font priority, content-visibility, prefetching), dialogs/popovers/menus, dark mode, view transitions, scroll effects, security (CSP, sanitizing HTML, passkeys), web components, PWA/install, dates and time zones. Also use when asked to "modernize" a site or apply modern web guidance. Do NOT use for backend, infra, build tooling, Python, CI or Git-only work.
---

# Modern Web Guidance

Expert-curated, token-efficient guides that steer web code away from legacy patterns and toward native platform features, with browser-support data and the fallbacks each feature needs. Source: https://github.com/GoogleChrome/modern-web-guidance (Apache 2.0, see `LICENSE`). The original skill text is kept in `UPSTREAM-SKILL.md`.

This copy is **local-first**: every guide is in `guides/<category>/<id>.md`, so it works offline and in sandboxes that block `npx`. All paths below are relative to this skill's folder (`.claude/skills/modern-web-guidance/`).

## Workflow

### 1. Search

Break the task into single platform capabilities or UI patterns, each a 2–5 word action phrase (`"light dismiss dialog"`, `"lazy load images"`, `"font fallback layout shift"`). Leave out framework and app names. If the request names an intent but not the UI primitive ("confirm first"), search for the primitive ("confirmation dialog").

Search the index, then the full text if the index is thin:

- Grep `INDEX.md` for the key words (case-insensitive). Each line is `` `id` — **Title**. Summary ``.
- If nothing fits, Grep `guides/` for the concrete API or element name (`fetchpriority`, `popover`, `content-visibility`, `@font-face`) and rephrase once.
- If still nothing fits, the topic is not covered: go ahead without a guide.

Optional, when the network allows `npx`: the live catalog may be newer than this copy.

```sh
npx -y modern-web-guidance@latest search "<query>"
npx -y modern-web-guidance@latest retrieve "<id>[,<id>...]"
```

### 2. Retrieve

Read each matching guide **in full** with the Read tool (`guides/<category>/<id>.md`), plus the broad discipline guide that applies: `html/html.md`, `css/css.md`, `forms/forms.md`, `accessibility/accessibility.md`, `visual-design/color.md`, `performance/performance.md`, `security/security.md`, `ui-behaviors/motion.md`. Never quote or cite a guide you have not read in this turn.

### 3. Apply and verify

- Use the guide's modern pattern **and** the fallback it asks for.
- **Browser support:** Baseline *widely available* features need no fallback. Anything newer must follow the guide's fallback advice, unless the project states its own support policy (check `CLAUDE.md`, `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`). If the project must run on old school devices or old iPads, prefer progressive enhancement: feature-detect, and make the page work without the new feature.
- Before finishing, re-read the changed code against each guide: right attributes, right fallbacks, nothing the user did not ask for.

### 4. Say which guides you used

End the reply that delivers the change with a `### Modern Web Guidance` section: one bullet per guide that shaped the code, first person, 1–2 sentences, with a short verbatim quote of the specific rule:

`- **\`<id>\`**: <what I applied and the pitfall it avoids> ("<short quote>").`

If you searched but no guide applied, say in one sentence what you checked and why none fit.

## Modernizing a whole codebase

When asked for a broad, open-ended modernization or legacy audit (no single feature named):

1. If `npx` works, run `npx -y modern-web-guidance@latest legacy-scan <path> --json` and check each finding against its `keepWhen` / `dropWhen` rubric; drop false positives (fallbacks, vendor code, look-alikes). It covers only about 20% of the catalog.
2. Either way, walk the categories that matter for the project in `INDEX.md` (usually `performance`, `html`, `css`, `accessibility`, `forms`, `security`, `ui-behaviors`) and compare the code with each relevant guide.
3. Report the verified findings and the plan; if asked to modernize, apply each fix with its guide (keeping existing code as the fallback where the guide requires one).

## Adapting to frameworks

Guides use vanilla HTML/CSS/JS. Keep the modern feature when porting: spread or cast newly shipped attributes (`popover`, `commandfor`, `interestfor`) instead of dropping them; guard `window`/`HTMLElement` in SSR; call `showModal()` through refs; generate per-instance IDs and `anchor-name`s; keep `:root` and `@starting-style` rules unscoped.

## Updating this copy

```sh
git clone --depth 1 https://github.com/GoogleChrome/modern-web-guidance /tmp/mwg
rm -rf .claude/skills/modern-web-guidance/guides
cp -r /tmp/mwg/skills/modern-web-guidance/guides .claude/skills/modern-web-guidance/
cp /tmp/mwg/skills/modern-web-guidance/SKILL.md .claude/skills/modern-web-guidance/UPSTREAM-SKILL.md
```

Then rebuild `INDEX.md` (one line per guide: id, `# ` title, first paragraph).
