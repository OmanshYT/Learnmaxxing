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

## Tough spots, in the order they are likely to bite

These are places where the code does something defensible that still surprises
people. Each line says what to try and what to expect, so a surprise reads as a
decision instead of a bug.

### Reading your notes

16. **Term bolded, definition on the next line.** The parser only reads the
    definition that follows the bold term *on the same line*. A glossary laid out
    as a bold word then its definition underneath produces nothing. Try yours
    formatted both ways.
17. **A glossary in a Word table.** Same cause: term in one cell, definition in
    the next cell. Expect no cards.
18. **Terms styled as a Word Heading** (they look bold but carry no bold
    property). Also expect nothing — the heading style is not a bold run.
19. **One stray bold word in a dashed document.** As soon as a document has any
    bold term, the `Term — definition` fallback switches off entirely, so a single
    bolded “**important**” can empty a page of otherwise good dash lines. This is
    the most likely way to lose terms without noticing.
20. **Bold used for emphasis in prose** — “do not **ever** add water to acid”.
    If enough text follows on that line it becomes a term with that text as its
    definition. Look for cards that read like sentences.
21. **Very short or very long terms.** Definitions under 10 characters are
    dropped (“**Mole** — mol”), and terms over 60 characters or over 8 words are
    dropped. Check a shorthand-heavy page.
22. **Duplicate terms.** Only the first definition of a term survives; a second,
    better one later in the document is ignored.
23. **PDFs have no bold.** Text extraction throws away formatting, so a PDF of
    your notes only works through the dash/colon fallback — a beautifully bolded
    PDF glossary still yields zero terms. Expect the plain text + no terms.
24. **Superscripts and subscripts in a PDF** land on their own text row
    (10^23 can extract as “10” and “23” on separate lines), and two-column
    worksheets interleave left and right columns.
25. **PDF reading needs the internet the first time** — the reader comes from a
    CDN. Try it offline or on a school network and check the error is friendly.
26. **Big PDFs get cut.** Each upload keeps at most 400,000 characters, so a
    30+ page document may lose its tail without saying so. Also watch whether the
    tab freezes while it extracts.
27. **Scanned PDF** (photos of paper) should say it found no readable text.
28. **Pasting a fully bold paragraph from Google Docs** becomes one over-long
    term and is dropped, so a heavily formatted doc can paste as no terms.
29. **PowerPoint speaker notes** are folded into the text as “> Notes: …” lines
    and can become fill-in-the-blank questions. Check a deck with notes.

### Quiz and flashcards

30. **Needs four distinct terms** before the good question types appear; with
    three or fewer the mini quiz says it cannot build one. A two-term document is
    therefore effectively flashcards-only.
31. **Long definitions are cut at 130 characters**, so two definitions that only
    differ near the end look like the same option twice. Watch for two identical
    choices in one question.
32. **Answers that mix units** — a definition containing “−890 kJ/mol” gets
    “890 kJ” blanked and leaves “/mol” behind. Check the sentence still reads.
33. **Silent caps:** 60 cards, 40 quiz questions, 10 per mini quiz. On a big
    document check the counts, because nothing warns you that material was left
    out.
34. **Same file, same order** is deliberate (seeded by the text), so retrying is
    fair — but editing one character reshuffles everything. Do not read it as the
    quiz “changing its mind”.
35. **A sentence that mentions two terms** only blanks the first one, and any
    sentence containing a colon within its first ~58 characters is skipped for
    fill-in-the-blank.

### Layout and saving

36. **Dragging tabs on a phone or tablet does nothing** — reordering is HTML5
    drag, which touch does not trigger. The ↑ ↓ arrows are the touch path.
37. **Dropping a dragged tab on empty page space** reorders nothing and shows no
    hint; it only works when released directly on another tab.
38. **Hiding a tab and showing it again** puts it back at the end of the bar, not
    where it was. Same for dashboard widgets.
39. **Dark mode follows your operating system** until you press ◐; after that it
    is pinned. A palette looking different on your phone than your laptop is
    usually this, not a broken palette.
40. **A big dashboard photo can fill localStorage.** Once it is full you get
    “Progress could not be saved in this browser” and study progress stops
    persisting. Upload a large photo and keep using the app to see whether that
    toast appears.
41. **Export only covers progress** — the JSON file does not contain uploads.
    “Download text” on each upload is the backup for those.
42. **Importing progress also imports the layout** (tabs, palette, font, photo)
    from whatever device exported it. Home and Look & layout are locked, so it is
    always recoverable, but the screen will jump.
43. **Private/incognito windows** may refuse IndexedDB, so uploads fail with a
    storage message while the rest of the site still works.
