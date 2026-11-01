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

## 2026-11-01 — every screen has a heading, and a damaged save no longer crashes

Found by a deep jsdom pass (152 checks) that walked every route, every part
page, every setting and every `data-act` in the app. Two real defects, both
fixed here; the rest of the run was clean.

- **In-session screens had no top-level heading.** Practice, exam and flashcard
  screens open with a counter and a card but no `<h1>`, and the upload error
  state had none either, so a screen reader found no page title there. Each now
  starts with a `sr-only` heading — “Practice: Due today”, “Exam: Exam”,
  “Flashcards: Ch 1 …”, “Your uploads” — which is invisible to sighted users
  and does not change the layout.
- **A save with `null` fields crashed the whole app.** `{ ...defaults, ...saved }`
  copied `q: null` or `settings: null` over the defaults, and then `S.q[id]` in a
  part page or `S.settings.theme` at boot threw: the site went blank for anyone
  whose save was half-written or came from an older build. The loader now
  coerces `q`, `cards`, `sched` and `settings` to objects and `log` to an array,
  once, before anything reads them.

To undo: `git revert` this commit. Both changes are additive guards — no saved
data, layout model or visual design moves, and removing them only restores the
old behaviour (no hidden headings, null saves crashing).

## 2026-11-01 — backups that include the uploads, a fairer quiz, and a site you can install

Five follow-ups from the review list. Everything is still client-side: no build
step, no dependency, no server.

- **“Export everything” covers uploads.** Stats → Backup now writes one file with
  `progress` (which includes your layout) and `uploads`, the parsed text of every
  document in IndexedDB. Uploads were the only unrecoverable thing here — a
  cleared browser took them with it — and the export did not include them.
  “Progress only” is still there for a tiny file. Import reads both shapes, so a
  file exported before this change still restores. `Library.restore` re-checks
  every field, caps the text at the same 400k limit as an upload, and keeps the
  original ids so nothing that referred to an upload dangles.
- **The quiz stopped inventing unfair questions.** Two definitions that differ
  only past the 130-character cut used to appear as two identical options; a
  question whose options read the same is now dropped. Compound units are
  blanked whole, so “−890 kJ/mol” no longer leaves a dangling “/mol” behind.
  Repeated stems are filtered out, and every generated question carries
  `source`, the sentence or definition it came from, which the mini quiz shows
  under the answer and in “Worth another look”.
- **Search reaches the formula sheet and your uploads.** The formula sheet is
  stored as HTML and was never searched; it is now matched on its text. Uploads
  live in IndexedDB, so their hits arrive after the page paints, with a line of
  context around the match and a link straight to the document.
- **The site installs and works offline.** `manifest.webmanifest`, a generated
  flask icon (SVG plus real 192 and 512 PNGs) and `sw.js`, a cache-first shell
  with a background refresh. `data.js` and the notes are cached, so the hub opens
  with no signal; a new deploy arrives on the next visit online. Registration is
  relative, so it works under the `/Learnmaxxing/` Pages sub-path.
- **Tabs can be dragged on a touch screen.** HTML5 drag is mouse-only, so the
  bar now also listens to pointer events: tap still navigates, press and hold a
  tab for a moment and slide it. The order saves on release, Escape cancels, and
  the ↑ ↓ arrows remain for anyone who prefers them.

Checked with a throwaway jsdom harness outside the repo (29 checks): export
carries uploads and progress, both import shapes restore, quiz options are
unique, the compound unit is blanked whole, sources are attached, formula and
upload hits render, a tap does not reorder while a hold drops the tab after the
pointer, `sw.js` registers and precaches only files that exist, and the 512 icon
is a real 512×512 PNG. Existing suites still pass (28 + 31 + 9). Not checked:
real touch gestures, the install prompt and offline reload in a real browser —
there is none here. See `dev/TESTING.md` 58–64.

To undo: `git revert` this commit. It deletes `sw.js`, `manifest.webmanifest`
and the icons as well as the code changes; the cache they create is dropped by
the browser on its own. Saved data is untouched — the backup format is additive
and `HubUI.normalize` ignores what it does not know.

## 2026-11-01 — “Next up” stops printing its own links

The home dashboard's schedule window read
`<a href="#/part/1.4">1.4 Atomic Mass and the Mole</a> (20 min)` — literally.
Generated schedule tasks in `data.js` are already HTML (the Schedule page
injects them as such), but the home widget escaped the whole string, so the
markup showed as text. It now takes the task apart (`schedBits`), escapes the
words, and rebuilds one real link plus the plain “(20 min)” tail — no nested
anchors and no raw HTML leaking through.

To undo: `git revert` this commit. The Schedule page, the “today” panel and
`data.js` are untouched, so nothing else changes back.

## 2026-11-01 — tabs you can actually drop, a page you can edit, and a text size

Four things the owner asked for after using the site:

- **Panels sat flush against each other.** Dashboard windows, the uploads box and
  the schedule box shared edges, so they read as one blob. Everything the page
  stacks now keeps a 1rem gap (`#app > * + *`), which collapses with the spacing
  that already existed instead of doubling it.
- **Tabs could be grabbed but never dropped.** The drag itself worked; the drop
  was refused because `dragover` was only cancelled over the upload zone, and a
  browser will not deliver a drop to a target that did not cancel it. The top bar
  now accepts the drop, shows which side of which tab the pointer is on (a bar
  on the left or right edge, or at the end), and drops there — including onto the
  empty space past the last tab. The ↑ ↓ arrows in Look & layout still reorder
  for touch, and a tip at the foot of that box says so.
- **Edit mode.** A small ⚗ button in the top bar (next to ◐) turns the home
  screen into an editable page: every window gets a ✕ to remove it, the hidden
  ones are listed as “add back” chips, and **Done** (or Escape) leaves. The
  countdown is marked “always shown” because it is the landing block. Edits save
  immediately, so there is nothing to confirm.
- **Text size.** Look & layout → Text size has A− / slider / A+ / Reset from 85%
  to 135%. It is applied as a percentage `font-size` on `<html>`, so every rem
  scales together and the browser's own text-size preference still counts.

Verified with a throwaway jsdom harness outside the repo: all 12 routes still
paint, the drag drop handler reorders `S.ui.tabs` from both sides of a target and
appends on the end zone, edit mode adds/removes widgets and survives a repaint,
and the scale normalises to 0.85–1.35 and is written to `documentElement`.
Not checked: the real drag gesture, the look of the ✕ buttons and the slider —
no browser here. See `dev/TESTING.md` items 36, 37 and 51–56.

To undo: `git revert` this commit. The panel spacing rule, the new drag
handlers, edit mode, the ⚗ button and `ui.scale` all go together; an existing
save keeps working because `HubUI.normalize` simply drops the unknown `scale`.

## 2026-11-01 — an exam survives a refresh, and dark mode stops flashing white

Four things a student could actually trip over:

- **A refresh erased a half-finished exam.** The live quiz lived only in memory.
  It is now mirrored to `sessionStorage["chem-study-hub.session.v1"]` and picked
  back up on load — same question, same typed answers — and the copy is deleted
  on Exit, on finishing, and on any page that is not the session, so nothing can
  come back stale. An attempt whose time ran out while the page was closed opens
  straight on "Grade your exam".
- **The timer counted ticks, not time.** It subtracted one second per interval,
  so a tab left in the background (where browsers throttle timers) handed back
  minutes that did not exist. The countdown is now derived from a stored
  `deadline`, so it stays correct after throttling, sleeping or a refresh.
- **Native controls ignored dark mode.** Select menus, checkboxes and the page
  scrollbar are drawn by the browser, and without `color-scheme` they stayed
  white on the dark palettes. `color-scheme: light` / `dark` now follows the same
  theme the page does, whether that comes from the ◐ button or the OS, plus a
  `<meta name="color-scheme">` for the first paint.
- **Smaller corrections:** `#app` no longer has `aria-live`, so a screen reader
  stops re-reading the whole page after every answer; a skip link and a focus
  move to the new page let keyboard navigation start at the content; the results
  table is wrapped so five columns scroll instead of overflowing a phone; the
  arrows in Look & layout have labels; `prefers-reduced-motion` turns
  transitions off; the page gained a favicon, a description and a theme colour
  so the tab and phone chrome match.

Verified with a throwaway jsdom harness outside the repo (28 checks): all 12
routes paint without errors; an exam saves, its typed answer returns after a
simulated refresh, an expired deadline switches to grading, a practice session
restores, Exit clears the saved copy, and a clean tab has none. The palette
contrast audit still passes 24/24. Not checked: how the native dark controls and
focus ring actually look — there is no browser here.

To undo: `git revert` this commit. The in-memory session, tick-based timer and
`aria-live` region come back with it.

## 2026-11-01 — every palette paints its own dark page

Picking Ocean, Forest, Sunset, Plum or Slate in dark mode left the area around
the cards a near-white sheet with light text sitting on it: the headings were
unreadable. The palettes' dark rules set the accent, the card colour and the
lines but never the page, and the light palette rules above them had already set
`--bg`, so the light value won the cascade.

Each dark palette now states `--bg`, `--surface`, `--surface-2` and `--line`
itself, and the page carries a soft glow of that palette's accent behind the
cards instead of one flat colour (the look the owner asked for). The glow is
`@media screen` only, so printing keeps its white page.

Checked with a throwaway cascade script outside the project (jsdom, real
selector matching and specificity, run against `git show HEAD:styles.css` and
the new file): before, 10 of 24 palette/mode states had text-on-page contrast
near 1.05; after, all 24 pass, between 13.7 and 16.5. There is no browser here,
so how the glow reads on screen is unseen.

To undo: `git revert` this commit — the flat page colours come back with it.

## 2026-11-01 — sample PDF no longer opens like the course notes

`dev/test-notes.pdf` opened with the heading “CHEM 159 — Unit 4 notes”, so the
Study tab of that upload began with a line that reads like the built-in course
notes and it was easy to think the wrong file had opened. It now opens “Upload
test handout”. Nothing else in the file changed: same five terms, same four
deliberate misses.

The new heading deliberately has no dash or colon: a “Term — definition” line is
exactly what the reader turns into a glossary entry, and a heading is not a term.

To undo: `git revert` this commit, then upload the previous PDF again if you want
it back in the library.

## 2026-11-01 — sample PDF for testing uploads

`dev/test-notes.pdf` is a two-page chemistry handout to upload instead of hunting
for a real worksheet: five glossary lines that parse, four deliberate misses, a
two-column row, and a raised superscript. `dev/make-test-pdf.py` builds it by
hand with no dependencies, so it can be regenerated or edited; `dev/TESTING.md`
opens with what a correct upload of it looks like.

Checked before committing, in Node with pdf.js 4.10.38 (the version the site
pins) and the site's own `Library.definitions`/`makeQuiz`: 5 terms, 9 cards, 11
questions, four question types, and every row inside the margins with no
overlapping text runs. How it looks on screen has not been seen — there is no
PDF renderer here.

To undo: `git revert` this commit and delete both files. The site does not
reference either of them, so nothing else changes.

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
