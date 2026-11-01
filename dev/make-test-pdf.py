#!/usr/bin/env python3
"""
Write dev/test-notes.pdf: a small chemistry handout for testing the uploader.

The file is built by hand (Helvetica, two pages, uncompressed text streams) so
the repo stays free of dependencies. Run it again to rebuild:

    python3 dev/make-test-pdf.py

Every glossary line is written the way the upload pipeline expects it, and every
one of them fits on a single line, because the PDF reader rebuilds text one row
at a time: a definition allowed to wrap loses its second half. A few lines are
written wrong on purpose, so uploading the file shows what works and what is
silently dropped. dev/TESTING.md says which is which.
"""

from pathlib import Path

PAGE_W, PAGE_H = 612, 792  # US Letter
LEFT, RIGHT, TOP = 64, 548, 716

# Helvetica widths, per 1000 units of type size. Approximate is fine: they only
# decide where a wrapped line breaks and where a bold run ends.
WIDTHS = {
    " ": 278, "!": 278, '"': 355, "#": 556, "$": 556, "%": 889, "&": 667,
    "'": 191, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333,
    ".": 278, "/": 278, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584,
    "?": 556, "@": 1015, "[": 278, "\\": 278, "]": 278, "^": 469, "_": 556,
    "`": 333, "{": 334, "|": 260, "}": 334, "~": 584,
    "\u2014": 1000, "\u2013": 556, "\u00d7": 584, "\u00b0": 400,
    "\u00b2": 333, "\u00b3": 333, "\u2026": 1000, "\u201c": 333, "\u201d": 333,
    "\u2018": 222, "\u2019": 222,
}
for _c in "0123456789":
    WIDTHS[_c] = 556
for _c, _w in zip(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    [667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
     667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611],
):
    WIDTHS[_c] = _w
for _c, _w in zip(
    "abcdefghijklmnopqrstuvwxyz",
    [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
     556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500],
):
    WIDTHS[_c] = _w

# Characters outside ASCII that the content needs, expressed in WinAnsi bytes.
WINANSI = {
    "\u2014": "\x97", "\u2013": "\x96", "\u00d7": "\xd7", "\u00b0": "\xb0",
    "\u00b2": "\xb2", "\u00b3": "\xb3", "\u2026": "\x85", "\u201c": "\x93",
    "\u201d": "\x94", "\u2018": "\x91", "\u2019": "\x92",
}

BOLD = 1.08  # Helvetica-Bold runs wider than the table above says


def width(text, size, bold=False):
    w = sum(WIDTHS.get(ch, 556) for ch in text) * size / 1000.0
    return w * BOLD if bold else w


def pdf_string(text):
    raw = "".join(WINANSI.get(ch, ch) for ch in text).encode("latin-1")
    return raw.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")


def text_op(x, y, text, bold, size):
    font = b"F2" if bold else b"F1"
    return (
        b"BT /" + font + b" " + f"{size:g}".encode() + b" Tf "
        + f"{x:.2f} {y:.2f} Td (".encode() + pdf_string(text) + b") Tj ET"
    )


def emit_line(ops, y, chunks, size):
    """One text run per same-font stretch: pdf.js keeps spaces inside a run, but
    merges two runs placed a hair apart, so runs must not be split per word."""
    x = LEFT
    for i, (text, bold) in enumerate(chunks):
        payload = text if i == 0 else " " + text
        ops.append(text_op(x, y, payload, bold, size))
        x += width(payload, size, bold) + 0.3


def paragraph(ops, y, segments, size=10.5, leading=15.5):
    """Lay out (text, bold) segments, wrapping at word boundaries."""
    tokens = [(word, bold) for text, bold in segments for word in text.split()]
    lines, line, used = [], [], 0.0
    for word, bold in tokens:
        w = width(word, size, bold) + width(" ", size)
        if line and used + w > (RIGHT - LEFT):
            lines.append(line)
            line, used = [], 0.0
        line.append((word, bold))
        used += w
    if line:
        lines.append(line)

    last = y
    for words in lines:
        chunks = []
        for word, bold in words:
            if chunks and chunks[-1][1] == bold:
                chunks[-1][0] += " " + word
            else:
                chunks.append([word, bold])
        emit_line(ops, y, [(t, b) for t, b in chunks], size)
        last, y = y, y - leading
    return last


def rule(ops, y):
    ops.append(f"0.7 w 0.65 0.65 0.65 RG {LEFT} {y:.1f} m {RIGHT} {y:.1f} l S".encode())


def page_one():
    ops, y = [], TOP
    y = paragraph(ops, y, [("CHEM 159 \u2014 Unit 4 notes", True)], size=18, leading=22)
    y -= 18
    y = paragraph(
        ops,
        y,
        [("Thermodynamics and equilibrium. A two-page handout for testing the Study "
          "Hub uploader.", False)],
        leading=16,
    )
    y -= 14
    rule(ops, y)
    y -= 28

    y = paragraph(ops, y, [("Glossary", True)], size=13, leading=18)
    y -= 20

    entries = [
        # Works: em dash.
        ("Enthalpy", " \u2014 the heat content of a system at constant pressure"),
        # Works: colon.
        ("Entropy", ": how spread out the energy of a system is"),
        # Works: double colon, and a two-word term.
        ("Gibbs free energy", " :: the energy usable for work at constant pressure"),
        # Works: hyphen.
        ("Catalyst", " - a substance that speeds a reaction without being consumed"),
        # Deliberate miss: the definition is under twelve characters.
        ("Mole", " \u2014 mol"),
        # Deliberate miss: the term is already defined above, so the first one wins.
        ("Entropy", " \u2014 second definition, ignored because the first one wins"),
        # Works, until the last line of this page.
        ("Le Chatelier's principle", " \u2014 equilibrium shifts to oppose the disturbance"),
        # Deliberate miss: the term is eleven words long.
        ("The second law of thermodynamics as stated in the course notes",
         " \u2014 total entropy of an isolated system never decreases"),
    ]
    for term, rest in entries:
        y = paragraph(ops, y, [(term, True), (rest, False)])
        y -= 9

    y -= 16
    y = paragraph(ops, y, [("Two lines that will not become terms", True)], size=13, leading=18)
    y -= 18
    # Deliberate miss: the definition sits on the next line, not the same line.
    y = paragraph(ops, y, [("Electronegativity", True)])
    y -= 5
    y = paragraph(
        ops,
        y,
        [("the tendency of an atom to attract shared electrons in a covalent bond", False)],
    )
    y -= 26

    y = paragraph(ops, y, [("Copied out of a two-column table", True)], size=13, leading=18)
    y -= 8
    # Two cells on one row arrive as one line of text, so the pair is neither a
    # term nor a definition.
    ops.append(text_op(LEFT, y, "Molar volume at STP", False, 10.5))
    ops.append(text_op(330, y, "22.4 L/mol at 273 K and 1 atm", False, 10.5))
    y -= 60

    rule(ops, y)
    y -= 16
    y = paragraph(ops, y, [("Page 1 of 2", False)], size=9, leading=12)
    return b"\n".join(ops)


def page_two():
    ops, y = [], TOP
    y = paragraph(ops, y, [("Worked example", True)], size=13, leading=18)
    y -= 20

    paragraphs = [
        "The combustion of one mole of methane releases about 890 kJ of energy at 298 K.",
        "A reaction whose Gibbs free energy change is negative is spontaneous at that "
        "temperature.",
        "Raising the temperature by 10 K roughly doubles the rate of many room "
        "temperature reactions.",
        "A catalyst lowers the activation energy, so more collisions carry enough energy "
        "to react.",
    ]
    for para in paragraphs:
        y = paragraph(ops, y, [(para, False)])
        y -= 13

    y -= 6
    y = paragraph(ops, y, [("A superscript, split onto its own row", True)], size=13, leading=18)
    y -= 14

    # The exponent is drawn as a separate raised run, the way a real PDF of notes
    # looks. Text extraction therefore returns "10" and "23" on two rows, and the
    # sentence arrives broken.
    head = "One mole of any substance contains 6.022 \u00d7 10"
    ops.append(text_op(LEFT, y, head, False, 10.5))
    x = LEFT + width(head, 10.5)
    ops.append(text_op(x, y + 4, "23", False, 7.5))
    tail = " particles, which is Avogadro's number."
    ops.append(text_op(x + width("23", 7.5) + 0.5, y, tail, False, 10.5))
    y -= 70

    rule(ops, y)
    y -= 16
    y = paragraph(ops, y, [("Page 2 of 2", False)], size=9, leading=12)
    return b"\n".join(ops)


def build():
    contents = [page_one(), page_two()]
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 7 0 R /F2 8 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length %d >>\nstream\n" % len(contents[0]) + contents[0] + b"\nendstream",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 7 0 R /F2 8 0 R >> >> /Contents 6 0 R >>",
        b"<< /Length %d >>\nstream\n" % len(contents[1]) + contents[1] + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica "
        b"/Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold "
        b"/Encoding /WinAnsiEncoding >>",
    ]

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"

    xref = len(out)
    out += b"xref\n0 %d\n" % (len(objects) + 1)
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += (
        b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n"
        % (len(objects) + 1, xref)
    )

    target = Path(__file__).with_name("test-notes.pdf")
    target.write_bytes(bytes(out))
    print(f"wrote {target} ({len(out)} bytes)")


if __name__ == "__main__":
    build()
