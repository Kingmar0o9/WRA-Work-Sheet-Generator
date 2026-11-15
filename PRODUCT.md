# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS (plus small inline JS), hosted free on GitHub Pages from the `main` branch, custom domain wrastem.com (Cloudflare DNS, not proxied). Each tool is one self-contained HTML file in its own folder (for example `cell-kit-generator/index.html`).

## Users

Primary: middle school science teachers (grades 6 and 7) deciding whether to use a hands-on 3D printed kit and its worksheets in class. Secondary: the Western Reserve Academy community and others evaluating the project.

## Product Purpose

WRA STEM Kits is a student Compass project at Western Reserve Academy: hands-on, 3D printed science kits for middle school classrooms, with free web tools that produce the printed materials that go with each kit. Success means a teacher can understand the kit in a minute and print a ready-to-use worksheet and answer key.

## Positioning

The worksheets are built around a physical kit: the labeling drawings are rendered from the kit's own 3D model STL files, and every question comes from a fixed, teacher-reviewable bank rather than being generated on the spot.

## Operating Context

- Plant Cell Worksheet Generator (`cell-kit-generator/`): one click builds a new 3-page plant cell worksheet plus answer key for grades 6–7. Designed to align with NGSS MS-LS1-2 (not certified). Uses only cell wall, cell membrane, nucleus, chloroplast, mitochondrion.
- Fixed bank of 43 items; every worksheet has the same 6 sections (label, match, how parts work together, think and write, circle the best answer, a second think and write).
- Each worksheet has a version number 1000–9999 so it can be rebuilt. Download worksheet PDF, answer key PDF, or print. Works offline.
- A 27-page Teacher Review Packet lists every question for a science teacher to approve or change.

## Capabilities and Constraints

- Live: plant cell worksheet generator.
- Coming soon, not built: Instruction sheet editor; NGSS AI (an assistant to answer questions about the NGSS). The AI would need a server (e.g. a Cloudflare Worker); GitHub Pages is static.
- Status: built and tested in software, **not yet tested with students**; teacher review not done yet.
- Never claim NGSS certification, classroom results, or teacher endorsement.

## Brand Commitments

Name: **WRA STEM Kits**. Domain: wrastem.com. Voice: plain, honest, student-made.

## Evidence on Hand

- Real plant cell drawings rendered from the kit's STL models (embedded in `cell-kit-generator/index.html`).
- No testimonials, classroom data, or teacher endorsements exist; do not invent them.
- The "why I built it" story is a draft written by Claude from known facts; Mark will rewrite it.

## Product Principles

1. Honest about status: say what is built, what is coming, and what is untested.
2. Teacher time is precious: one click to something printable.
3. The physical kit is the center; the web tools serve it.
4. Fast and free on any school device, including offline use.
