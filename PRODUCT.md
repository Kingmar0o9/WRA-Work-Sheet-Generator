# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/JS hosted free on GitHub Pages from the `main` branch, custom domain wrastem.com (Cloudflare DNS, not proxied). Each page is one self-contained HTML file in its own folder (for example `cell-kit-generator/index.html`). The home page's 3D model is three.js (bundled from `src/cell-viewer.js`). Standards AI and the purchase-request form use a small Cloudflare Worker on the free plan (`worker/`, live at ai.wrastem.com).

## Users

Primary: middle school science teachers (grades 6–8) deciding whether to use a hands-on 3D printed kit and its worksheets in class, and whether to request kits. Secondary: the Western Reserve Academy community and others evaluating the project.

## Product Purpose

WRA STEM Kits is a student Compass project at Western Reserve Academy: hands-on, 3D printed science kits for middle school classrooms, with web tools that go with each kit. Success means a teacher can understand the kit in a minute, print a ready-to-use worksheet and answer key, and request kits for their class.

## Positioning

The worksheets are built around a physical kit: the labeling drawings are rendered from the kit's own 3D model STL files, and every question comes from a fixed, teacher-reviewable bank rather than being generated on the spot.

## Operating Context

- Plant Cell Kit: 12 custom-designed, 3D printed pieces (11 cell structures plus the nucleolus), held in place by 6 x 2 mm magnets; the small 3 mm holes are for labels. Reusable for years.
- Plant Cell Worksheet Generator (`cell-kit-generator/`): one click builds a new 3-page plant cell worksheet plus answer key for middle school (grades 6–8). Designed to align with NGSS MS-LS1-2. Uses only cell wall, cell membrane, nucleus, chloroplast, mitochondrion.
- Fixed bank of 43 items; every worksheet has the same 6 sections (label, match, how parts work together, think and write, circle the best answer, a second think and write).
- Each worksheet has a version number 1000–9999 so it can be rebuilt. Download worksheet PDF, answer key PDF, or print. Works offline.
- A 27-page Teacher Review Packet lists every question for a science teacher to approve or change.

## Capabilities and Constraints

- Live: home page with the interactive 3D kit; plant cell worksheet generator; Standards AI (a chat that answers from the NGSS text and links every standard it cites); Request kits form (emails each request to the kit maker).
- Coming soon, not built: Instruction sheet editor (a worksheet editor).
- Status: built and tested in software, **not yet tested with students**; teacher review not done yet.
- Never claim NGSS certification, classroom results, or teacher endorsement. Say "designed to align with the NGSS".

## Brand Commitments

Name: **WRA STEM Kits**. Domain: wrastem.com. Voice: plain, honest, student-made. The maker appears by first name only ("Mark").

## Evidence on Hand

- Real plant cell drawings rendered from the kit's STL models (embedded in `cell-kit-generator/index.html`).
- No testimonials, classroom data, or teacher endorsements exist; do not invent them.
- The "Why I built it" text is Mark's approved statement; use it as written.

## Product Principles

1. Honest about status: say what is built, what is coming, and what is untested.
2. Teacher time is precious: one click to something printable.
3. The physical kit is the center; the web tools serve it.
4. Fast and free on any school device, including offline use.
