# Change log

Every change to the Chem Study Hub, newest first, with the reasoning and the
way back. `git log --oneline` is the machine-readable version; this file says
why each piece exists and how to undo it.

## How to backtrack

| Goal | Command |
| --- | --- |
| See what changed | `git log --oneline`, then `git show <sha>` |
| Undo one change, keeping history | `git revert <sha>` |
| Throw away everything after a point | `git reset --hard <sha>` (destroys later work) |
| Look at a file as it was | `git show <sha>:app.js > /tmp/old-app.js` |
| Reset only colours, fonts, tab order | In the app: **Look & layout → Reset look & layout** |

Uploads, study progress and layout choices live in the browser, not in Git.
They are stored under the key `chem-study-hub.v1`; clearing site data wipes
them, and **Stats → Export** backs up the study progress.

## 2026-10-31 — tough spots checklist

`dev/TESTING.md` grows a second section listing the places the code behaves in a
defensible but surprising way, in the order they are likely to be noticed: bold
terms need their definition on the same line, one bold word switches off the
dash fallback, PDFs carry no bold at all, the quiz needs four terms and cuts
definitions at 130 characters, tab dragging is not a touch gesture, dark mode
follows the OS until ◐ is pressed, and a large dashboard photo can fill
localStorage so progress stops saving.

Documentation only, nothing in the site changed. Revert by deleting the
“Tough spots” section from `dev/TESTING.md`.

## 2026-10-31 — AGENTS.md working notes

New file `AGENTS.md`: what the project is, how to run it, the file map, the
bold-term upload contract, the quiz design, the layout model, where state lives,
the gotchas that cost time (em dashes in regex classes, trimming run-boundary
spaces), and how changes were verified. It exists so a fresh chat does not
re-derive all of that, and so the change-log rule is stated up front.

Revert by deleting the file; nothing imports or reads it. It is guidance for
agents, not part of the site.

## 2026-10-31 — long quiz answers wrap

`styles.css` only, quiz option styling; revert with `git checkout -- styles.css`.

`.opt` is a flex row, and its text `<span>` kept `min-width: auto`, so a long
definition pushed the grid column past the card and spilled off the panel edge.
The column is now `minmax(0, 1fr)`, the text span is `flex: 1 1 auto; min-width: 0`,
and options opt into `white-space: normal; overflow-wrap: anywhere; line-height: 1.45`
so unbroken chemical strings wrap instead of clipping. Both the session quiz and
the upload mini-quiz use `.opt`, so one rule covers both.

## 2026-10-31 — bold-term glossary, term-driven quiz, modular layout

Commit `b7e166e`. `git revert b7e166e` undoes this whole batch.

### New files

- **`library.js`** — the upload pipeline. Unzips `.docx`/`.pptx` locally,
  pulls text out of PDFs with pdf.js, converts clipboard HTML from Google
  Docs, and turns the result into cards and quiz questions. Materials are kept
  in IndexedDB (`chem-uploads` / `materials`), so uploads stay on that device.
- **`ui.js`** — the layout model: tab list, dashboard widgets, six palettes,
  ten fonts, defaults, `normalize()` for missing or older settings,
  `moveItem()`, `applyTheme()`, and `photoFromFile()` which shrinks a chosen
  image to a 720 px JPEG before storing it.
- **`dev/serve.py`** — dev-only static server with live reload over SSE. The
  published site does not need it.
- **`dev/TESTING.md`** — the running list of checks that need a real browser.

### Changed

- **`app.js`** (703 lines added) — upload views (`#/upload` and
  `#/upload/<id>?tab=study|cards|quiz|terms`), the library list with download
  and delete, the deck runner, the mini quiz, the **Look & layout** screen,
  navigation drawn from the saved model, dashboard widgets, drag and arrow
  reordering, and import/export/reset that preserve the layout settings.
- **`index.html`** — loads `ui.js` before `app.js`, adds the settings entry.
- **`styles.css`** (95 lines added) — palette blocks for light and dark, plus
  settings, swatch, font list, tab list, photo card and upload styling.

### Behaviour changes worth knowing

- **Bold is the glossary.** `**Term** — definition`, `**Term**: definition`,
  `**Term** :: definition` and `**Term** (definition)` all work. Word bold
  runs (`<w:b/>`) and PowerPoint bold runs (`b="1"`) are folded into the same
  markup, so students never need markdown. Once a document has any bold term,
  only bold terms are used; the older "word — definition" line guessing stays
  as a fallback for notes with no bold at all.
- **The quiz is built from those terms**: definition → term, term →
  definition, and fill-in-the-blank when a term appears in a sentence or the
  notes contain numbers. Wrong options are drawn from sibling terms, the order
  is seeded so a retry is stable, and missed terms are listed at the end.
- **The interface is driven by saved state**: tabs can be reordered, hidden
  and restored, the dashboard is an ordered list of widgets, and colours and
  fonts are choices rather than constants. Home and Look & layout cannot be
  hidden, so the settings screen always remains reachable.

### Undoing one part

- **Layout, palettes, fonts** — delete `ui.js`, remove its `<script>` from
  `index.html`, then `git show e6d9836:app.js > app.js`. Or just press
  **Reset look & layout**, which touches no files.
- **Uploads** — remove `library.js`, its `<script>` tag, and the import/export
  blocks in `app.js`. Materials already stored in a browser must be cleared
  separately.
- **Everything** — `git reset --hard e6d9836` returns to the original site.

## Initial commit — the static vault build

Commit `e6d9836`. `build.py` turns the Studying Vault into `data.js` plus
`files/source/`; `app.js` provides the router, quiz builder, timed exam,
flashcards with spaced repetition, stats, search and export; `styles.css`
does the light and dark theme.
