# Things worth testing by hand

A running list of checks that need a real browser. Ask for it and it comes back as-is.

## Uploads

1. **PDF upload** — drag one of the course worksheet PDFs onto the Upload page. Text extraction was verified against
   `files/source/Worksheet Ch1 (answers).pdf` in Node, but the file-picker path itself has not been clicked.
2. **A scanned PDF** (photos of paper, no text layer) — should say it found no readable text and suggest pasting instead.
3. **Your own `.docx` or `.pptx`** with bolded terms — every bold term should appear as a card, and the deck size should
   match the number of bold terms (plus nothing invented).
4. **Paste from Google Docs** — copy a formatted doc and paste into the box on the Upload page. Bold should survive as
   `**term**`, and the preview/cards should show it as a term.
5. **Big file** — a 30+ page PDF: does extraction finish in a few seconds, or does the tab feel stuck?
6. **Delete** — deleting an upload removes it from the library and from the home dashboard.

## Quiz and flashcards

7. **Quiz answer text** — check that long definitions wrap inside the option buttons without clipping.
8. **Quiz review list** — after a round with mistakes, the "Worth another look" list should name the right answers.
9. **Flashcard shuffle** — shuffle then navigate: the counter should stay in range.

## Look & layout

10. **Drag tabs** in the top bar (not just the arrow buttons — dragging was only tested through the arrows).
11. **Every palette in light and dark mode** — the ◐ toggle; check text contrast on the accent buttons.
12. **A serif or mono font** — tables, buttons and the search box should all change together.
13. **Dashboard picture** — upload a photo, set a caption, hide the widget, then re-add it.
14. **Reload the page** — tabs, palette, font and dashboard order should all still be there.
15. **Narrow window / phone** — the tab bar and the settings grids should wrap, not overflow.
