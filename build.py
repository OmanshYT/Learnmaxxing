"""Build the static study site from the Studying Vault.

Usage: python build.py [vault_path]
Reads Chemistry notes (read-only) and writes data.js plus files/source (PDFs).
"""
import html
import json
import re
import formula_sheet
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VAULT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"C:\Users\bmw27\Documents\Studying Vault")
CHEM = VAULT / "Chemistry"
YEAR = 2026

SUPERS = "⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺"
SUPER_MAP = dict(zip(SUPERS, "0123456789-+"))
PART_RE = re.compile(r"^(\d+)\.(\d+) (.+)\.md$")
Q_RE = re.compile(r"^> \[!question\]\s*(\S+?)\.?\s+(.*)$")
MC_RE = re.compile(r"(?:^|\s)([A-E])\) ")
LINKS = {}  # note title -> hash route, filled before rendering


def fix(line):
    """Undo UTF-8 that was saved as cp1252 mojibake (e.g. 'â†’' back to '→')."""
    if "â" not in line:
        return line
    try:
        return line.encode("cp1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return line


def read(path):
    return [fix(line) for line in path.read_text(encoding="utf-8").splitlines()]


def section(lines, title):
    """Lines under '## <title>' up to the next '## ' heading."""
    out, on = [], False
    for line in lines:
        if line.startswith("## "):
            if on:
                break
            on = line[3:].strip().startswith(title)
            continue
        if on:
            out.append(line)
    return out


def subsections(lines):
    """Split on '### 1.1 Title' headings, keyed by part id."""
    groups, cur = {}, None
    for line in lines:
        if line.startswith("### "):
            m = re.match(r"^### (\d+\.\d+)", line)
            cur = m.group(1) if m else None
            continue
        if cur and not line.startswith("## "):
            groups.setdefault(cur, []).append(line)
    return groups


def callouts(lines):
    """Parse '> [!question] Q1. ...' blocks with their '> [!success]' answers."""
    items, cur, mode = [], None, None
    for line in lines:
        m = Q_RE.match(line)
        if m:
            cur = {"id": m.group(1), "q": [m.group(2)], "a": []}
            items.append(cur)
            mode = "q"
            continue
        if cur is None:
            continue
        if line.startswith("> [!success]"):
            mode = "a"
            continue
        if line.startswith(">"):
            cur["a" if mode == "a" else "q"].append(line[1:].strip())
            continue
        if line.strip():
            cur = None
    return items


def plain_num(s):
    """Turn '2.00 × 10⁻¹⁹' into '2.00e-19' so numbers can be compared."""
    s = s.replace("−", "-")
    s = re.sub(r"\s*[×x]\s*10([" + SUPERS + r"]+)",
               lambda m: "e" + "".join(SUPER_MAP.get(c, c) for c in m.group(1)), s)
    s = re.sub(r"\s*[×x]\s*10\^(-?\d+)", r"e\1", s)
    return s


def plain(s):
    return re.sub(r"[*`]", "", s)


def inline(text):
    s = html.escape(text, quote=False)
    s = re.sub(r"!\[\[.*?\]\]", "", s)
    s = re.sub(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", _wikilink, s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![*\w])\*([^*\s][^*]*?)\*(?![*\w])", r"<em>\1</em>", s)
    return s


def _wikilink(m):
    target = m.group(1).split("/")[-1].strip()
    label = m.group(2) or target
    href = LINKS.get(target)
    return f'<a href="{href}">{label}</a>' if href else label


def blocks(lines):
    """Small markdown subset: paragraphs, nested bullets, headings, tables."""
    out, stack, para, table = [], [], [], []

    def close_para():
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>")
            para.clear()

    def close_table():
        if not table:
            return
        rows = [r.strip() for r in table if not re.fullmatch(r"\|[\s:|-]+\|", r.strip())]
        cells = [[c.strip() for c in r.strip("|").split("|")] for r in rows]
        head, body = cells[0], cells[1:]
        t = "<div class='table-wrap'><table><thead><tr>"
        t += "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>"
        t += "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in row) + "</tr>" for row in body)
        out.append(t + "</tbody></table></div>")
        table.clear()

    def close_top():
        if stack.pop():
            out.append("</li>")
        out.append("</ul>")

    def close_lists():
        while stack:
            close_top()

    def bullet(depth, text):
        depth = min(depth, len(stack))
        while len(stack) > depth + 1:
            close_top()
        if len(stack) == depth:
            out.append("<ul>")
            stack.append(False)
        elif stack[-1]:
            out.append("</li>")
            stack[-1] = False
        out.append("<li>" + inline(text))
        stack[-1] = True

    for raw in lines:
        line = raw.rstrip()
        if table and not line.startswith("|"):
            close_table()
        if not line.strip():
            close_para()
            close_lists()
            continue
        m = re.match(r"^(\s*)[-*] (.*)$", line)
        if m:
            close_para()
            bullet(len(m.group(1)) // 2, m.group(2))
            continue
        if line.startswith("|"):
            close_para()
            close_lists()
            table.append(line)
            continue
        h = re.match(r"^(#{1,4}) (.*)$", line)
        if h:
            close_para()
            close_lists()
            lvl = min(len(h.group(1)) + 1, 6)
            out.append(f"<h{lvl}>{inline(h.group(2))}</h{lvl}>")
            continue
        close_lists()
        para.append(line.strip().lstrip("> ").strip())
    close_para()
    close_table()
    close_lists()
    return "\n".join(out)


MC_LETTER = re.compile(r"^\(?([A-E])[.)]")
NUM_START = re.compile(r"^\s*(-?\d[\d,]*(?:\.\d+)?(?:e-?\d+)?)")


def make_question(item, part_id, kind):
    qtext = " ".join(t for t in item["q"] if t)
    options, stem = None, qtext
    hits = list(MC_RE.finditer(qtext))
    if len(hits) >= 2 and hits[0].group(1) == "A":
        stem = qtext[:hits[0].start()].strip()
        options = []
        for i, h in enumerate(hits):
            end = hits[i + 1].start() if i + 1 < len(hits) else len(qtext)
            options.append({"letter": h.group(1), "html": inline(qtext[h.end():end].strip())})
    a_plain = plain(" ".join(t for t in item["a"] if t))
    letter = None
    if options:
        m = MC_LETTER.match(a_plain.strip())
        letter = m.group(1) if m else None
    key = None
    m = NUM_START.match(plain_num(a_plain))
    if m:
        key = m.group(1).replace(",", "")
    return {
        "id": f"{part_id}.{item['id']}",
        "label": item["id"],
        "kind": kind,
        "q": inline(stem),
        "options": options,
        "letter": letter,
        "key": key,
        "answer": blocks(item["a"]),
    }


def build():
    LINKS["Chemistry Home"] = "#/"
    LINKS["Schedule"] = "#/schedule"
    LINKS["Formula Sheet"] = "#/reference"

    ch_dirs = sorted(d for d in CHEM.iterdir() if d.is_dir() and re.match(r"^\d\d ", d.name))
    for d in ch_dirs:
        num = int(d.name[:2])
        for f in d.glob("*.md"):
            m = PART_RE.match(f.name)
            if m:
                LINKS[f"{m.group(1)}.{m.group(2)} {m.group(3)}"] = f"#/part/{m.group(1)}.{m.group(2)}"
        LINKS[f"00 Chapter {num} Index"] = f"#/chapter/{num}"

    chapters = []
    for d in ch_dirs:
        num = int(d.name[:2])
        index = read(next(d.glob("00 Chapter * Index.md")))
        title_line = next(l for l in index if l.startswith("# Chapter"))
        title = re.sub(r"^# Chapter \d+: ", "", title_line)
        lecture = next((inline(re.sub(r"^Lecture: ", "", l)) for l in index if l.startswith("Lecture:")), "")
        ws = next((re.search(r"Source Files/(.+?)\]\]", l).group(1)
                   for l in index if "Worksheet:" in l and "Source Files/" in l), None)
        extras = subsections(index)

        parts = []
        for f in sorted(d.glob("*.md"), key=lambda p: [int(x) for x in re.findall(r"^\d+\.(\d+)", p.name)]):
            m = PART_RE.match(f.name)
            if not m:
                continue
            part_id = f"{m.group(1)}.{m.group(2)}"
            lines = read(f)
            questions = [make_question(i, part_id, "practice")
                         for i in callouts(section(lines, "Practice"))]
            questions += [make_question(i, part_id, "extra")
                          for i in callouts(extras.get(part_id, []))]
            cards = []
            for n, line in enumerate(section(lines, "Flashcards"), 1):
                if "::" in line and not line.startswith("#"):
                    q, a = line.split("::", 1)
                    cards.append({"id": f"{part_id}.F{n}", "q": inline(q.strip()),
                                  "a": inline(a.strip()), "part": part_id})
            parts.append({
                "id": part_id,
                "num": m.group(2),
                "title": m.group(3),
                "learn": blocks(section(lines, "Learn")),
                "questions": questions,
                "cards": cards,
            })
        chapters.append({"num": num, "title": title, "lecture": lecture,
                         "worksheet": f"files/source/{ws}" if ws else None, "parts": parts})

    sched = []
    for line in read(CHEM / "Schedule.md"):
        m = re.match(r"^\| (\d\d)/(\d\d) \| (\w+) \| (.*) \|$", line)
        if m:
            href = None
            wl = re.search(r"\[\[([^\]|]+)", m.group(4))
            if wl:
                href = LINKS.get(wl.group(1).split("/")[-1].strip())
            sched.append({"date": f"{YEAR}-{m.group(1)}-{m.group(2)}", "day": m.group(3),
                          "task": inline(m.group(4)), "href": href})

    formula_lines = read(CHEM / "Formula Sheet.md")
    if formula_lines and formula_lines[0].startswith("# "):
        formula_lines = formula_lines[1:]
    home = read(CHEM / "Chemistry Home.md")
    final = re.search(r"Final: \*\*(\d\d)/(\d\d)\*\*", "\n".join(home))
    exam = f"{YEAR}-{final.group(1)}-{final.group(2)}" if final else sched[-1]["date"]

    course = {"name": next(l for l in home if l.startswith("# ")).lstrip("# ").strip(),
              "exam": exam, "start": sched[0]["date"] if sched else None}
    payload = {"course": course, "chapters": chapters, "schedule": sched,
               "formula": formula_sheet.build()}

    src_out = HERE / "files" / "source"
    src_out.mkdir(parents=True, exist_ok=True)
    for pdf in (CHEM / "Source Files").glob("*.pdf"):
        shutil.copy2(pdf, src_out / pdf.name)

    text = "window.STUDY_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n"
    (HERE / "data.js").write_text(text.replace("</", "<\\/"), encoding="utf-8")

    nq = sum(len(p["questions"]) for c in chapters for p in c["parts"])
    nc = sum(len(p["cards"]) for c in chapters for p in c["parts"])
    print(f"chapters={len(chapters)} parts={sum(len(c['parts']) for c in chapters)} "
          f"questions={nq} cards={nc} schedule={len(sched)}")


if __name__ == "__main__":
    build()
