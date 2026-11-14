---
name: WRA STEM Kits
description: Seed-packet print grammar for a hands-on 3D printed science kit and the free tools that print its worksheets.
colors:
  stock: "#F6F7F2"
  ink: "#13261C"
  ink-2: "#3E5446"
  rule: "#13261C"
  leaf: "#124A2B"
  leaf-deep: "#0C3520"
  on-leaf: "#F6F7F2"
  on-leaf-2: "#D7EDD3"
  sun: "#F6C343"
  plum: "#6B3A80"
typography:
  display:
    fontFamily: "Bricolage, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(2.9rem, 6.4vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Bricolage, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.4rem, 4.6vw, 4.2rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Bricolage, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 2vw, 1.9rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.03em"
  figure:
    fontFamily: "Bricolage, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.7rem, 2.4vw, 2.3rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.035em"
    fontFeature: "tnum"
  lede:
    fontFamily: "Bricolage, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.05rem, 1.2vw + .5rem, 1.3rem)"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "Bricolage, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(17px, 1.05vw + 12px, 19px)"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Bricolage, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.01em"
rounded:
  sticker: "6px"
  panel: "16px"
  stage: "22px"
  pill: "999px"
spacing:
  gutter: "clamp(16px, 4vw, 56px)"
  max: "1240px"
  chip-gap: "8px"
  action-gap: "12px"
  cell: "18px 20px 22px"
  section: "clamp(72px, 10vw, 128px)"
components:
  button-sun:
    backgroundColor: "{colors.sun}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  button-line:
    backgroundColor: "transparent"
    textColor: "{colors.on-leaf}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stock}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  button-ink-hover:
    backgroundColor: "{colors.leaf-deep}"
    textColor: "{colors.stock}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  button-ghost-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stock}"
  tag-live:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.stock}"
    rounded: "{rounded.pill}"
    padding: "4px 10px 4px 8px"
  tag-soon:
    backgroundColor: "transparent"
    textColor: "{colors.plum}"
    rounded: "{rounded.pill}"
    padding: "4px 10px 4px 8px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "40px"
  chip-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stock}"
  spec-cell-status:
    backgroundColor: "{colors.sun}"
    textColor: "{colors.ink}"
    padding: "{spacing.cell}"
  draft-sticker:
    backgroundColor: "{colors.sun}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sticker}"
    padding: "4px 10px"
  info-panel:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "18px 22px"
  viewer-box:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.on-leaf}"
    rounded: "{rounded.stage}"
---

# Design System: WRA STEM Kits

## Overview

**Creative North Star: "The Seed Packet"**

The site prints like the front and back of a seed packet, made modern. The front is a full-bleed field of deep leaf green with the real printed kit as the picture; the back is cool paper stock ruled into a fixed spec grid where every value sits in a cell. Colour is flat spot ink, never blended, and the type is one heavy, tightly set grotesque that carries volume through size alone.

Density is generous on the field and tight on the back panel: big display lines and air around the model, then hard 2px rules that box facts into cells and rows. The physical kit is always the picture. Chrome is quiet so the model, with its own per-part teaching colours, is the most colourful thing on screen.

Surfaces alternate between two grounds, leaf field and paper stock, joined by one continuous 2px ink horizon rule. Status is printed, not implied: every resource carries a ticket (Live or Coming soon) and every unconfirmed fact carries a sun-yellow draft sticker.

**Key Characteristics:**
- Two grounds only: deep leaf field and cool paper stock, with green-black ink.
- Flat spot inks; sunflower is the one action and highlight ink.
- One variable face (Bricolage Grotesque, 200-800), display at 800 with tight negative tracking.
- 2px ink rules everywhere a printed packet would have a rule: horizons, spec grid, resource list, tickets, chips.
- Pill-shaped controls; softly rounded panels; no hard offset shadows.
- The 3D model keeps its own one-colour-per-part teaching palette, separate from chrome.

## Colors

A strict spot-ink palette on two grounds: leaf field and paper stock, printed in green-black ink with sunflower as the single action ink and plum for "not yet".

### Primary
- **Sunflower Spot** (`sun`): the action and highlight ink. Primary buttons on the leaf field, text selection, the draft sticker, the "Where it stands" status cell, the kit name in the kitline, the icon in the field notes, and focus rings on leaf. On paper, the primary action is printed in ink instead (see button-ink).

### Secondary
- **Seed Plum** (`plum`): reserved for "Coming soon". Text and dashed border of the soon ticket. Never an action colour.

### Neutral
- **Deep Leaf Field** (`leaf`): the front-of-packet ground. Hero stage, viewer box, the Live ticket, the author monogram, scrollbar thumb, and `theme-color`.
- **Leaf Shadow** (`leaf-deep`): hover state of ink buttons only.
- **Cool Paper Stock** (`stock`): the back-of-packet ground and page background; also the text colour on ink and leaf (`on-leaf` holds the same value for clarity of role).
- **Pale Leaf** (`on-leaf-2`): secondary text on the leaf field (ledes, kitline).
- **Green-Black Ink** (`ink`, `rule`): all body text on paper, all 2px rules, the footer ground, ink buttons, pressed chips, focus rings on paper.
- **Soft Ink** (`ink-2`): secondary text on paper (intros, list copy, spec labels, captions, coming-soon titles).

Coral (#E8573A) and sky (#7CC4E8) are declared as spot inks in `:root` but are not used by any chrome on the shipped page; they appear only inside the model palette. Treat them as reserved inks, not as available accents, until a surface needs them.

### Model Teaching Palette (exception)
The 3D kit model is coloured one distinct flat colour per part so students tell parts apart at a glance: wall #EFE6CF, membrane #F6C343, cytoplasm #CFE8C9, nucleus #7A45A0, nucleolus #E06AA5, chloroplast #7EE07A, mitochondrion #E8573A, golgi #F29E38, ER #7CC4E8, vacuole #F4FAFC, vesicle #E06AA5 (source: `src/cell-viewer.js`, `INK`). These values appear in chrome only as the small swatch dot in the part info panel, which must match the model. Material is matte (roughness 0.62, metalness 0).

### Named Rules
**The Spot Ink Rule.** Chrome uses only the declared spot inks. Fills are flat; no gradients, no tints mixed by eye.

**The Teaching Palette Exception.** The model, and the swatch that names a model part, may use the per-part palette. Nothing else may. A future kit (for example an animal cell) defines its own per-part palette for its model and leaves chrome on the spot inks.

**The Sunflower Is The Button Rule.** On the leaf field, the one primary action is sunflower. On paper, the primary action is ink. Sunflower on paper marks status or a draft, not an action.

## Typography

**Display Font:** Bricolage Grotesque, self-hosted variable woff2 at weights 200-800 (with ui-sans-serif, system-ui fallback)
**Body Font:** the same family
**Label/Mono Font:** none; labels are the same face at 600-800

**Character:** One face does everything. Display is heavy (800) and tight (-0.035em, line-height 0.98) so size, not a second family, carries volume; body is plain 400 at a large, readable 17-19px.

### Hierarchy
- **Display** (800, clamp(2.9rem, 6.4vw, 6rem), 0.98): the hero line only, max 9.5ch. Mobile clamp(2.6rem, 11vw, 4rem). The second stage line steps down to clamp(2.3rem, 4.6vw, 4.4rem).
- **Headline** (800, clamp(2.4rem, 4.6vw, 4.2rem), 0.98): section titles on paper. The spec grid title sits a step lower at clamp(2rem, 3.4vw, 3rem).
- **Title** (800, clamp(1.5rem, 2vw, 1.9rem), -0.03em): resource names; the info panel title is 1.6rem.
- **Figure** (800, clamp(1.7rem, 2.4vw, 2.3rem), 1, tabular numerals): the big value inside a spec cell.
- **Lede** (400, clamp(1.05rem, 1.2vw + .5rem, 1.3rem), 1.45, max 34ch): one line of subcopy under a display line. Story paragraphs run at clamp(1.1rem, .9vw + .7rem, 1.3rem), 1.6, max 62ch.
- **Body** (400, clamp(17px, 1.05vw + 12px, 19px), 1.55): everything else; measure held to 40-56ch by component.
- **Label** (700, 0.85rem): spec cell labels, viewer hint, model labels, draft sticker. Tickets go to 800 at 0.8rem with +0.02em. Never uppercase.

### Named Rules
**The Loudest Line Rule.** The hero line is the largest type on the page. No other element may match it.

**The One Face Rule.** Bricolage only. Hierarchy comes from size and weight (400 body, 600-700 labels, 800 display), never from a second family or from uppercase tracking.

## Layout

Content sits in a centred column (max 1240px) with a fluid side gutter of clamp(16px, 4vw, 56px). Content sections on paper use an asymmetric 5:7 two-column grid (gap clamp(28px, 5vw, 96px)), collapsing to one column at 960px. Section padding runs clamp(64-72px) to clamp(120-140px) vertically.

The hero is a sticky stage: a 260svh leaf section with a 100svh sticky frame. Scroll progress (`--p`, 0 to 1) crossfades the assembled kit into the exploded kit in place, fades the first copy out and the second in, and reveals the part labels. Headline copy sits bottom-left; the model sits centre-right. Below 900px the model moves to the top half and copy holds the bottom.

The spec grid is a fixed-cell ruled grid: 4 columns, 2 at 960px, 1 at 520px. Cells may span 2; the status cell spans the full row. Values always sit inside a cell.

The resource column and the viewer column sit side by side; the viewer is sticky (top 88px) on desktop and stacks below 960px. The fixed header is 68px tall.

### Named Rules
**The Horizon Rule.** One 2px ink rule runs full width between each major section, tying the packet together.

**The Fixed Cell Rule.** Facts live in ruled cells or ruled rows, never as floating stat blocks.

## Elevation & Depth

The system is flat. Depth comes from the two grounds and from 2px rules, not from shadow. Two soft shadows exist, each tied to a specific job: the header gains a hairline and soft drop only once it turns solid over paper, and the model's floating part labels carry a soft drop so they read over the 3D render.

### Shadow Vocabulary
- **Header settle** (`box-shadow: 0 1px 0 rgba(19,38,28,.18), 0 8px 24px -16px rgba(19,38,28,.4)`, with `backdrop-filter: saturate(1.2) blur(8px)` over stock at 94%): only when the header leaves the leaf field.
- **Label lift** (`box-shadow: 0 4px 14px -6px rgba(0,0,0,.45)`): on the pill labels that point at model parts.

### Named Rules
**The Flat Print Rule.** Panels, cards, buttons, tickets and chips have no shadow. If something needs separation, give it a 2px ink rule or a ground change.

## Shapes

Two shape families. Controls and tickets are full pills (999px) with a 2px border in their own ink. Containers are gently rounded: the info panel at 16px, the viewer box at 22px. The draft sticker and focus outline use a small 6px corner. The spec grid and resource list are square-cornered and built from 2px rules only. The brand mark is a hexagonal kit outline with a nucleus and chloroplast dot, drawn in a 2.6px stroke of `currentColor`.

Icons are inline SVG line drawings, 18-22px, 2.2-2.4px strokes with round caps and joins, coloured by `currentColor`.

## Components

### Buttons
Confident, inked pills that lift slightly on hover.
- **Shape:** full pill (999px), 2px border in `currentColor`, min-height 48px (42px in the header), padding 0 22px, 700 at 1rem, -0.01em. Trailing arrow icon at 18px with a 0.55em gap.
- **Sun (primary on leaf):** sunflower fill and border, ink text.
- **Line (secondary on leaf):** transparent, inherits on-leaf text; hover adds a 12% white wash.
- **Ink (primary on paper):** ink fill, stock text; hover goes to leaf-deep.
- **Ghost (secondary on paper):** transparent, ink border and text; hover fills ink with stock text.
- **Hover / Active:** translateY(-2px) over 0.3s on the expo-out ease (`cubic-bezier(.16,1,.3,1)`); colour changes over 0.2s; active returns to 0.
- **Header swap:** when the header turns solid over paper, its sun button becomes ink.

### Status Tickets
Every resource prints its status.
- **Style:** pill, 2px border, 800 at 0.8rem, +0.02em, an 8px dot in `currentColor` before the text.
- **Live:** leaf fill and border, stock text.
- **Coming soon:** transparent, plum text and a dashed plum border; the resource title beside it drops to soft ink.

### Chips
- **Style:** pill, 2px ink border, transparent, ink text, 600 at 0.9rem, min-height 40px, padding 0 14px, gap 8px.
- **State:** hover adds an 8% ink wash; pressed (`aria-pressed="true"`) fills ink with stock text. Secondary chips ("Also in the kit") use soft ink for border and text, after a full-width break and a soft-ink caption.

### Draft Sticker
A sunflower block (6px corner, 4px 10px, 700 at 0.85rem, ink text) placed under any content that is a draft or unconfirmed. It names what needs confirming in plain words.

### Spec Grid
The back of the packet. A 2px ink-ruled grid of cells (padding 18px 20px 22px, min-height 150px). Each cell is a soft-ink label (700, 0.85rem) over a value: an optional big figure (800, tabular numerals) and a plain line beneath. The status cell spans the row and is filled sunflower.

### Resource List
A numbered list ruled top and bottom with 2px ink rules, rows padded 24px 0 26px. Each row: title and status ticket on one line, soft-ink description (max 46ch), and an ink button when the resource is live.

### Model Viewer
- **Box:** leaf ground, 22px corners, 4:3 (1:1 on mobile), grab cursor. A still image of the model fills it when 3D is off.
- **Tools:** pill buttons top-right, 2px on-leaf border over a 25% ink wash, on-leaf text; hover inverts to on-leaf fill and ink text; focus ring sunflower.
- **Hint:** on-leaf, 600 at 0.85rem, top-left with a hand icon.
- **Info panel:** below the chips, stock ground, 2px ink rule, 16px corners, padding 18px 22px. Holds the part title, its role, a plain comparison in soft ink, and a swatch dot (14px, 2px ink ring) in the part's model colour.

### Model Labels
Pill labels in stock with ink text (700, 0.85rem) on a short angled stock leader line ending in a 10px stock dot ringed in ink, carrying the Label lift shadow. They appear only as the kit comes apart.

### Navigation
Fixed header, 68px. Wordmark left (800, 1.15rem, -0.03em, with the hex mark at 30px), three text links right (600, 0.95rem, 90% opacity, underline on hover), then a sun button. On leaf it is transparent with on-leaf text; once past the stage it turns stock at 94% with ink text. Links hide below 760px, leaving the wordmark and button.

### Footer
Ink ground with stock text. A large wordmark (800, clamp(1.8rem, 3.4vw, 2.8rem)) over a plain status line, links underlined in stock.

### Focus and Selection
Focus is a 3px solid outline offset 3px with a 6px corner: ink on paper, sunflower on leaf. Selection is sunflower with ink text.

## Do's and Don'ts

### Do:
- **Do** set every surface on one of two grounds: leaf field (#124A2B) or paper stock (#F6F7F2).
- **Do** make the physical kit the picture, and let its per-part teaching palette be the most colourful thing on screen.
- **Do** use sunflower for the one primary action on leaf, and ink for the primary action on paper.
- **Do** rule facts into cells and rows with 2px ink lines, and separate major sections with a full-width 2px horizon rule.
- **Do** give every resource a printed status ticket (Live in leaf, Coming soon in dashed plum).
- **Do** mark unconfirmed content with the sunflower draft sticker, naming what needs confirming.
- **Do** keep controls as 2px-bordered pills at a 40px minimum height (48px for primary buttons).
- **Do** keep the hero line the largest type on the page, set in Bricolage 800 at -0.035em.
- **Do** show still pictures of the same model when a device cannot run 3D, and let people switch.

### Don't:
- **Don't** use gradients or blended tints in chrome; spot inks print flat.
- **Don't** use the model teaching palette in chrome, except the swatch dot that names a model part.
- **Don't** add a second typeface, uppercase tracked labels, or small text above headlines.
- **Don't** put shadows on panels, cards, buttons, tickets or chips; use a rule or a ground change.
- **Don't** let values float as loose stat blocks; they belong in ruled cells.
- **Don't** use plum for anything but "not yet", or sunflower on paper as an action.
- **Don't** build the edu-template hero of headline, stock illustration and three equal feature cards.
