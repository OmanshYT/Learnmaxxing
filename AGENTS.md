# AGENTS.md — working notes for the Chem Study Hub

Notes for any agent or person picking this up. Read this before touching code.

## What this project is

A single-page study site for Chemistry (CHEM 159), built from the owner's Studying
Vault. It is plain HTML/CSS/JS with **no build step, no package manager, no
dependencies, no server, no tests to run**. Opening `index.html` is the whole
install. Anything that adds npm, a bundler or a backend is off-spec.

## Running it

```bash
python3 dev/serve.py 3000      # dev server with live reload over SSE
```

Then open `http://localhost:3000/`. `dev/serve.py` is development-only; the
published site is static and needs nothing.

`build.py` is **not** part of running the site. It regenerates `data.js` and
`files/source/*.pdf` from the owner's local Studying Vault, whose path only
exists on their machine:

```bash
python build.py "<path to Studying Vault>"
```

`data.js` is generated output — never hand-edit it.

## File map

| File | Owns |
| --- | --- |
| `index.html` | Shell. Loads `data.js`, then `ui.js`, then `library.js`, then `app.js`. |
| `data.js` | Generated chapters, questions, schedule, formula sheet (`window.STUDY_DATA`). |
| `app.js` | Router, all views, SRS scheduling, quiz/exam engine, stats, upload views, settings, layout actions, drag handlers. |
| `library.js` | Upload pipeline: md/txt/docx/pptx/pdf parsing, bold-term glossary, card and quiz generation, clipboard HTML conversion, IndexedDB store. Exports `window.Library`. |
| `ui.js` | Layout model: `TABS`, `WIDGETS`, `PALETTES`, `FONTS`, `DEFAULT`, `normalize`, `moveItem`, `applyTheme`, `photoFromFile`. Exports `window.HubUI`. |
| `styles.css` | Palettes (light and dark) and all component styling. |
| `dev/serve.py` | Dev-only static server with SSE live reload. |
| `dev/TESTING.md` | Running list of checks that need a real browser. Produce it when asked. |
| `CHANGELOG.md` | Every change, why, and how to revert it. |

## Rules

1. **Every change gets a `CHANGELOG.md` entry** — newest first, with the commit
   sha once known, what changed, why, and the exact way to undo it. This file is
   the owner's means of backtracking; treat it as part of the change, not
   documentation to write "later".
2. **Stay client-side.** Uploads are parsed in the browser and stored in
   IndexedDB. There is no backend and no API key in the project.
3. **No AI features yet.** They are planned behind a paywall in a later update;
   do not wire an LLM in without being asked.
4. **Bold is the glossary.** See the contract below; do not reintroduce
   guess-the-dash parsing as the primary path.
5. **Preserve the owner's data.** Study progress, uploads and layout choices live
   in the browser. Never ship code that clears them on upgrade; migrations go
   through `HubUI.normalize` and defensive defaults.

## Upload contract (important)

A document marks a term by **bolding it and attaching a definition**:

```
**Enthalpy** — the heat content of a system at constant pressure
**Molar volume**: 22.4 L at STP
**Mole** :: 6.022 × 10^23 particles
**Catalyst** (a substance that speeds a reaction without being consumed)
```

- Word bold runs (`<w:b/>`, excluding `w:val="0|false|none"`) and PowerPoint bold
  runs (`<a:rPr b="1">`) are folded into `**term**` by `foldRuns`, so one parser
  covers every format and students never type markdown.
- Pasting from Google Docs keeps bold via `fromHtmlPaste`.
- **If a document contains any bold term, only bold terms are used.** The older
  line heuristics (`Term — definition`) remain solely as a fallback for notes
  with no bold, because they invent terms out of ordinary prose.
- Definitions must not be double-blanked; `DEF_LIKE` guards cloze generation.

## Quiz design

Built from the same terms: definition → term, term → definition, plus
fill-in-the-blank when a term also appears in prose or the notes contain numbers.
Wrong options are drawn from sibling terms. Order is seeded (`mulberry32` + FNV)
so a retry is deterministic. Misses are listed for review afterwards.

## Layout model

`S.ui` in `app.js` mirrors `HubUI.DEFAULT`: tab order and visibility, dashboard
widget order and visibility, palette, font, photo, quote. Home and the
look & layout tab are locked (movable, not hideable) so settings stay reachable.
Palettes carry light and dark values; fonts load from Google Fonts on demand.

## Where state lives

- `localStorage["chem-study-hub.v1"]` — progress, flags, stats, and `ui` settings.
- IndexedDB `chem-uploads` / `materials` — uploaded files and their parsed text.

Clearing site data wipes both. Stats → Export backs up progress only.

## Gotchas learned the hard way

- Write the em dash as `\u2014` inside regex character classes; a literal
  "enhanced" dash silently failed to match.
- Use `xmlToClean`, not `xmlToText(...).trim()` — trimming destroys spaces that
  sit on run boundaries and welds `**Term**A definition` together.
- `document.textContent` is `null`; read `#app`'s text content instead.
- `allowedHosts: true` and blanket preview allowlists are not acceptable fixes.
- Keep large generated artifacts (bundles, zips) out of the repo.

## Verifying changes

There is no test runner in the repo. Behaviour has been checked with throwaway
jsdom harnesses outside the project (inline the scripts into `index.html`, stub
`indexedDB`, `scrollTo` and `confirm`, navigate by dispatching `hashchange`).
If you add tests, keep them out of the deployed site. Anything requiring real
input — file pickers, mouse dragging, canvas image resizing, fonts — belongs in
`dev/TESTING.md`, and should be reported as untested rather than assumed working.
