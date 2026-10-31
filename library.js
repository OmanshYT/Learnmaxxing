"use strict";
/*
  Upload library: file -> text, text -> flashcards + questions, and a local store.
  Everything runs in the browser. Nothing is uploaded to a server, so a student's
  notes never leave their machine.
*/
window.Library = (() => {
  const DB_NAME = "chem-uploads";
  const STORE = "materials";
  const PDF_BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38";
  const ACCEPT = ".pdf,.docx,.pptx,.md,.markdown,.txt,.csv";
  const MAX_TEXT = 400000; // characters kept per upload, so storage cannot fill up

  const dec = new TextDecoder("utf-8");
  const escHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- storage ---------- */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("This browser blocks local storage, so uploads cannot be saved."));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Could not open the upload store."));
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(
      (d) =>
        new Promise((resolve, reject) => {
          const t = d.transaction(STORE, mode);
          let out;
          try {
            out = fn(t.objectStore(STORE));
          } catch (e) {
            reject(e);
            return;
          }
          t.oncomplete = () => resolve(out && "result" in out ? out.result : out);
          t.onerror = () => reject(t.error || new Error("Storage failed."));
          t.onabort = () => reject(t.error || new Error("Storage ran out of room."));
        })
    );
  }
  const list = () => tx("readonly", (s) => s.getAll()).then((rows) => rows.sort((a, b) => b.addedAt - a.addedAt));
  const get = (id) => tx("readonly", (s) => s.get(id));
  const remove = (id) => tx("readwrite", (s) => s.delete(id));

  function save({ title, kind, text, size }) {
    const body = String(text || "").slice(0, MAX_TEXT);
    const row = {
      id: "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: (title || "Untitled upload").slice(0, 90),
      kind,
      size: size || body.length,
      text: body,
      addedAt: Date.now(),
    };
    return tx("readwrite", (s) => s.put(row)).then(() => row);
  }

  /* ---------- zip (docx / pptx) ---------- */
  async function inflateRaw(data) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error("That file is not a readable Office document.");
    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const entries = new Map();
    for (let n = 0; n < count; n++) {
      if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) break;
      const method = view.getUint16(p + 10, true);
      const compSize = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const local = view.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (!name || name.endsWith("/")) continue;
      if (local + 30 > bytes.length) continue;
      const lNameLen = view.getUint16(local + 26, true);
      const lExtraLen = view.getUint16(local + 28, true);
      const start = local + 30 + lNameLen + lExtraLen;
      entries.set(name, { method, data: bytes.subarray(start, start + compSize) });
    }
    return entries;
  }

  async function zipText(entries, name) {
    const e = entries.get(name);
    if (!e) return "";
    if (e.method === 0) return dec.decode(e.data);
    if (e.method === 8) return dec.decode(await inflateRaw(e.data));
    return "";
  }

  /* Untrimmed variant: run boundaries are meaningful, so spacing has to survive
     long enough for bold runs to be marked. */
  function xmlToClean(xml) {
    return xml
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<w:tab\b[^>]*\/>/g, " ")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      .replace(/<a:br\b[^>]*\/>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
      .replace(/&amp;/g, "&")
      .replace(/[ \t]+/g, " ");
  }
  const xmlToText = (xml) => xmlToClean(xml).trim();

  const slideNum = (name) => Number((name.match(/slide(\d+)\.xml$/i) || [])[1] || 0);

  /*
    Bold means "this is a term": Word and PowerPoint keep that in run properties,
    so turn bold runs into **term** and one parser handles every format.
    A bold run followed by plain text is a term with its definition attached.
  */
  const RUN = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
  const BOLD_ON = /<w:b(?![^>]*w:val="(?:0|false|none)")[^>]*>/;
  const ARUN = /<a:r>[\s\S]*?<\/a:r>/g;
  const ABOLD_ON = /<a:rPr[^>]*\bb="(?:1|true)"/;
  const foldRuns = (xml, runRe, isBold) =>
    xml.replace(runRe, (run) => {
      const text = xmlToClean(run);
      if (!text.trim()) return text;
      if (!isBold(run)) return text;
      // keep the whitespace that separated the term from what follows it
      const lead = /^\s/.test(text) ? " " : "";
      const trail = /\s$/.test(text) ? " " : "";
      return `${lead}**${text.trim()}**${trail}`;
    });

  async function docxText(input) {
    const entries = await unzip(input);
    const xml = await zipText(entries, "word/document.xml");
    if (!xml) throw new Error("That .docx has no readable text inside.");
    return xml
      .split(/<\/w:p>/)
      .map((p) => xmlToText(foldRuns(p, RUN, (r) => BOLD_ON.test(r))))
      .filter(Boolean)
      .join("\n");
  }

  async function pptxText(input) {
    const entries = await unzip(input);
    const slides = [...entries.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => slideNum(a) - slideNum(b));
    if (!slides.length) throw new Error("That .pptx has no slides I can read.");
    const out = [];
    for (const name of slides) {
      const n = slideNum(name);
      const body = await zipText(entries, name);
      const notes = await zipText(entries, `ppt/notesSlides/notesSlide${n}.xml`);
      const lines = body
        .split(/<\/a:p>/)
        .map((p) => xmlToText(foldRuns(p, ARUN, (r) => ABOLD_ON.test(r))))
        .filter(Boolean);
      const notesLines = notes.split(/<\/a:p>/).map(xmlToText).filter(Boolean);
      out.push(`## Slide ${n}\n${lines.join("\n")}${notesLines.length ? `\n> Notes: ${notesLines.join(" ")}` : ""}`);
    }
    return out.join("\n\n");
  }

  /* ---------- pdf ---------- */
  let pdfLibPromise = null;
  function pdfLib() {
    if (!pdfLibPromise) {
      pdfLibPromise = import(`${PDF_BASE}/build/pdf.min.mjs`)
        .then((lib) => {
          lib.GlobalWorkerOptions.workerSrc = `${PDF_BASE}/build/pdf.worker.min.mjs`;
          return lib;
        })
        .catch(() => {
          pdfLibPromise = null;
          throw new Error("The PDF reader could not be loaded (offline, or a network blocker). Try again or paste the text instead.");
        });
    }
    return pdfLibPromise;
  }

  async function pdfText(file) {
    const lib = await pdfLib();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const rows = new Map();
      content.items.forEach((it) => {
        if (!it.str || !it.str.trim()) return;
        const y = Math.round(it.transform[5]);
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push({ x: it.transform[4], s: it.str });
      });
      const lines = [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, items]) =>
          items
            .sort((a, b) => a.x - b.x)
            .map((o) => o.s)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter(Boolean);
      if (lines.length) pages.push(lines.join("\n"));
    }
    try {
      doc.destroy();
    } catch (e) {
      /* nothing to clean up */
    }
    return pages.join("\n\n");
  }

  /* ---------- one entry point: file -> text ---------- */
  const KINDS = { pdf: "pdf", docx: "docx", pptx: "pptx", md: "md", markdown: "md", txt: "text", csv: "text" };

  function kindOf(name) {
    const ext = String(name).split(".").pop().toLowerCase();
    return KINDS[ext] || null;
  }

  async function extract(file) {
    const kind = kindOf(file.name);
    const title = file.name.replace(/\.[^.]+$/, "");
    if (!kind) {
      throw new Error(`.${String(file.name).split(".").pop()} files are not supported yet. Use PDF, Word (.docx), PowerPoint (.pptx), Markdown or plain text.`);
    }
    if (kind === "pdf") return { title, kind, text: await pdfText(file) };
    if (kind === "docx") return { title, kind, text: await docxText(await file.arrayBuffer()) };
    if (kind === "pptx") return { title, kind, text: await pptxText(await file.arrayBuffer()) };
    return { title, kind, text: await file.text() };
  }

  /* ---------- rendering extracted text ---------- */
  function inlineMd(text) {
    let s = escHtml(text);
    s = s.replace(/!\[\[.*?\]\]/g, "");
    s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, target, label) => label || target);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(?<![*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, "<em>$1</em>");
    return s;
  }

  function mdToHtml(text) {
    const out = [];
    let para = [];
    let items = [];
    let table = [];
    const flushPara = () => {
      if (para.length) {
        out.push("<p>" + inlineMd(para.join(" ")) + "</p>");
        para = [];
      }
    };
    const flushItems = () => {
      if (items.length) {
        out.push("<ul>" + items.map((li) => "<li>" + inlineMd(li) + "</li>").join("") + "</ul>");
        items = [];
      }
    };
    const flushTable = () => {
      if (!table.length) return;
      const rows = table.filter((r) => !/^\|[\s:|-]+\|$/.test(r.trim()));
      const cells = rows.map((r) =>
        r
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim())
      );
      const head = cells[0] || [];
      const body = cells.slice(1);
      out.push(
        '<div class="table-wrap"><table><thead><tr>' +
          head.map((c) => "<th>" + inlineMd(c) + "</th>").join("") +
          "</tr></thead><tbody>" +
          body.map((r) => "<tr>" + r.map((c) => "<td>" + inlineMd(c) + "</td>").join("") + "</tr>").join("") +
          "</tbody></table></div>"
      );
      table = [];
    };
    String(text)
      .split(/\r?\n/)
      .forEach((raw) => {
        const line = raw.replace(/\s+$/, "");
        if (table.length && !line.trim().startsWith("|")) flushTable();
        if (!line.trim()) {
          flushPara();
          flushItems();
          return;
        }
        if (/^\s*[-*+] /.test(line)) {
          flushPara();
          items.push(line.replace(/^\s*[-*+] /, ""));
          return;
        }
        if (line.trim().startsWith("|")) {
          flushPara();
          flushItems();
          table.push(line);
          return;
        }
        const h = line.match(/^(#{1,6}) (.*)$/);
        if (h) {
          flushPara();
          flushItems();
          const lvl = Math.min(h[1].length + 1, 6);
          out.push(`<h${lvl}>${inlineMd(h[2])}</h${lvl}>`);
          return;
        }
        flushItems();
        para.push(line.trim());
      });
    flushPara();
    flushItems();
    flushTable();
    return out.join("\n");
  }

  function plainToHtml(text) {
    const out = [];
    let buf = [];
    const flush = () => {
      if (buf.length) {
        out.push("<p>" + escHtml(buf.join(" ")) + "</p>");
        buf = [];
      }
    };
    String(text)
      .split(/\r?\n/)
      .forEach((raw) => {
        const line = raw.trim();
        if (!line) {
          flush();
          return;
        }
        if (/^## Slide \d+$/.test(line)) {
          flush();
          out.push(`<h3>${escHtml(line.slice(3))}</h3>`);
          return;
        }
        if (/^> /.test(line)) {
          flush();
          out.push(`<p class="muted">${escHtml(line.replace(/^> /, ""))}</p>`);
          return;
        }
        buf.push(line);
      });
    flush();
    return out.join("");
  }

  const toHtml = (text, kind) => (kind === "md" ? mdToHtml(text) : plainToHtml(text));

  /*
    Pasting from Google Docs or Slides brings HTML, not text. Keep the bold by
    turning bold runs into **term** and paragraphs into lines, so a pasted
    document follows the same format as an uploaded one.
  */
  function fromHtmlPaste(html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const walk = (node, bold) => {
      let text = "";
      node.childNodes.forEach((ch) => {
        if (ch.nodeType === 3) {
          text += ch.nodeValue;
          return;
        }
        if (ch.nodeType !== 1) return;
        const tag = ch.tagName.toLowerCase();
        if (tag === "br") {
          text += "\n";
          return;
        }
        if (tag === "style" || tag === "script") return;
        const style = ch.getAttribute("style") || "";
        const isBold = bold || tag === "b" || tag === "strong" || /font-weight:\s*(?:bold|[6-9]00)/i.test(style);
        const inner = walk(ch, isBold);
        if (/^(p|div|h[1-6]|li|tr)$/.test(tag)) text += `\n${tag === "li" ? "- " : ""}${inner}\n`;
        else text += inner;
      });
      if (!bold) return text;
      const body = text.trim();
      if (!body || /\*\*/.test(body)) return text;
      return `${/^\s/.test(text) ? " " : ""}**${body}**${/\s$/.test(text) ? " " : ""}`;
    };
    return walk(doc.body, false)
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /* ---------- text -> study material ---------- */
  const ABBREV = /(?:e\.g|i\.e|vs|cf|etc|approx|fig|eq|no|dr|mr|ms)\.$/i;

  function sentences(text) {
    const lines = String(text)
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.trim());
    const blocks = [];
    let cur = [];
    const flush = () => {
      if (cur.length) {
        blocks.push(cur.join(" "));
        cur = [];
      }
    };
    lines.forEach((line) => {
      if (!line || /^## Slide \d+$/.test(line) || /^#{1,6}\s/.test(line)) return flush();
      const clean = line.replace(/^>\s?/, "").replace(/^[-*+•·]\s+/, "").replace(/\*\*/g, "").trim();
      if (!clean) return flush();
      // short line with no end punctuation: a heading or a label, not prose
      if (clean.length < 60 && !/[.!?:;)]$/.test(clean)) return flush();
      cur.push(clean);
    });
    flush();
    const out = [];
    blocks.forEach((block) => {
      let start = 0;
      for (let i = 0; i < block.length; i++) {
        const ch = block[i];
        if ((ch === "." || ch === "!" || ch === "?") && (i + 1 >= block.length || block[i + 1] === " ")) {
          const s = block.slice(start, i + 1).trim();
          if (!ABBREV.test(s)) {
            out.push(s);
            start = i + 1;
          }
        }
      }
      const tail = block.slice(start).trim();
      if (tail) out.push(tail);
    });
    return out.filter((s) => s.length >= 30 && s.length <= 300);
  }

  const DEF_LINE = /^([A-Za-z0-9][^:—–]{1,58}?)\s*(?:::|\s(?:\u2014|\u2013|-)\s|:)\s*(.{12,})$/;
  // "Term — definition" / "Term: definition" / "Term :: definition", already defined
  // above as a term, so prose cloze must not blank it a second time.
  const DEF_LIKE = /^[A-Za-z0-9][^\n]{0,58}?(?:::|:|=|\s(?:\u2014|\u2013|-)\s)\s*\S/;

  /*
    The documented upload format: bold the term, then its definition on the same
    line — `**Enthalpy** — the heat content of a system at constant pressure.`
    Bold terms win; the line heuristics below only fill the gaps for material that
    was typed without bold-in-the-way that a plain text file can carry.
  */
  const BOLD = /\*\*([^*\n]{2,60})\*\*/g;

  function boldTerms(text) {
    const out = [];
    const seen = new Set();
    String(text)
      .split(/\r?\n/)
      .forEach((raw) => {
        const line = raw
          .replace(/^\s*(?:[-*+•·]|\d+[.)])\s+/, "")
          .replace(/^\s*>\s?/, "")
          .trim();
        BOLD.lastIndex = 0;
        const m = BOLD.exec(line);
        if (!m) return;
        const term = m[1].trim().replace(/[.,;:]+$/, "");
        const def = line
          .slice(m.index + m[0].length)
          .replace(/^\s*(?:::|[—–-]|:|=|→)\s*/, "")
          .replace(/^\s*\(([\s\S]+)\)\s*$/, "$1")
          .trim();
        if (term.length < 2 || term.length > 60 || term.split(/\s+/).length > 8) return;
        if (def.length < 10 || /^[.,;:]/.test(def) || /\*\*/.test(def)) return;
        const key = term.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ term, def });
      });
    return out;
  }

  function definitions(text) {
    // A document that bolds its terms says exactly what its terms are, so trust it
    // and stop guessing. The line heuristics below are only for notes with no bold
    // at all, where there is nothing better to go on.
    const bold = boldTerms(text);
    if (bold.length) return bold;
    const out = [];
    const seen = new Set();
    String(text)
      .split(/\r?\n/)
      .forEach((raw) => {
        const line = raw
          .replace(/^[\s>*•·–—]+/, "")
          .replace(/\s+/g, " ")
          .trim();
        if (line.length < 30 || line.length > 400) return;
        const m = line.match(DEF_LINE);
        if (!m) return;
        const term = m[1].trim().replace(/[.,;]$/, "");
        const def = m[2].trim();
        if (!term || term.length > 60 || term.split(" ").length > 6) return;
        if (/[.!?]$/.test(term) || /\s(is|are|was|were|means)\s/i.test(term)) return;
        const key = term.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ term, def });
      });
    return out;
  }

  const UNITS = /\b\d+(?:\.\d+)?(?:\s*[×x]\s*10[⁻⁺]?\d*)?\s*(?:kJ|J|mol|g|kg|mg|mL|L|nm|pm|K|°C|M|atm|kPa|Pa|mmHg|s|min|h|%)\b/;

  function clozeItems(text, defs) {
    const terms = [...new Set(defs.map((d) => d.term))].filter((t) => t.length >= 3);
    const out = [];
    const used = new Set();
    sentences(text).forEach((s) => {
      // a definition line already became its own card, so do not blank it again
      if (DEF_LIKE.test(s)) return;
      const hit = terms.find((t) => t.length >= 4 && s.toLowerCase().includes(t.toLowerCase()));
      if (hit) {
        const blanked = s.replace(new RegExp(hit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "____");
        if (blanked === s) return;
        const key = blanked.toLowerCase();
        if (used.has(key)) return;
        used.add(key);
        out.push({ q: `Fill in the blank: ${blanked}`, a: hit });
        return;
      }
      const num = s.match(UNITS);
      if (!num) return;
      const blanked = s.replace(num[0], "____");
      const key = blanked.toLowerCase();
      if (used.has(key)) return;
      used.add(key);
      out.push({ q: `Fill in the blank: ${blanked}`, a: num[0].trim() });
    });
    return out;
  }

  function fnv(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rnd) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sample(list, n, rnd) {
    return shuffle(list, rnd).slice(0, n);
  }

  function makeCards(text) {
    const defs = definitions(text);
    const cards = defs.map((d) => ({ q: d.term, a: d.def }));
    const seen = new Set(cards.map((c) => c.q.toLowerCase()));
    clozeItems(text, defs).forEach((c) => {
      const key = c.q.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      cards.push(c);
    });
    return cards.slice(0, 60);
  }

  const cut = (s, n = 130) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /*
    Quiz design: every question is about the terms, but never the same shape twice
    in a row — name the term from its definition, pick the definition from the term,
    and recall a term by filling the blank inside its own definition. Numbers get
    their own number-shaped options so a kJ answer is never paired with a term.
  */
  function makeQuiz(text) {
    const defs = definitions(text);
    const terms = [...new Set(defs.map((d) => d.term))];
    const rnd = mulberry32(fnv(text));
    const out = [];
    const others = (term) => terms.filter((t) => t !== term);

    if (terms.length >= 4) {
      defs.forEach((d, i) => {
        const picks = sample(others(d.term), 3, rnd);
        if (picks.length === 3) {
          const options = shuffle([d.term, ...picks], rnd);
          out.push({
            type: "Definition → term",
            q: `Which term matches this description?\n\n“${cut(d.def)}”`,
            options,
            answer: options.indexOf(d.term),
            explain: `${d.term}: ${d.def}`,
          });
        }
        if (i % 2 === 1) {
          const right = cut(d.def);
          const dpicks = sample(
            defs.filter((x) => x.term !== d.term).map((x) => cut(x.def)).filter((x) => x !== right),
            3,
            rnd
          );
          if (dpicks.length === 3) {
            const options = shuffle([right, ...dpicks], rnd);
            out.push({
              type: "Term → definition",
              q: `Which description matches “${d.term}”?`,
              options,
              answer: options.indexOf(right),
              explain: `${d.term}: ${d.def}`,
            });
          }
        }
        const re = new RegExp(`\\b${escRe(d.term)}\\b`, "i");
        if (re.test(d.def)) {
          const blanked = d.def.replace(re, "____");
          const picks2 = sample(others(d.term), 3, rnd);
          if (blanked !== d.def && picks2.length === 3) {
            const options = shuffle([d.term, ...picks2], rnd);
            out.push({
              type: "Fill in the blank",
              q: `Fill in the blank.\n\n“${cut(blanked)}”`,
              options,
              answer: options.indexOf(d.term),
              explain: `${d.term}: ${d.def}`,
            });
          }
        }
      });
    }

    const nums = [...new Set((String(text).match(new RegExp(UNITS.source, "g")) || []).map((s) => s.trim()))];
    clozeItems(text, defs).forEach((c) => {
      const isTerm = terms.includes(c.a);
      const pool = isTerm ? others(c.a) : nums.filter((n) => n !== c.a);
      const picks = sample(pool, 3, rnd);
      if (picks.length < 3) return;
      const options = shuffle([c.a, ...picks], rnd);
      out.push({
        type: isTerm ? "Fill in the blank" : "Numbers & units",
        q: c.q,
        options,
        answer: options.indexOf(c.a),
        explain: isTerm ? "" : `Answer: ${c.a}`,
      });
    });
    return shuffle(out, rnd).slice(0, 40);
  }

  function summary(text) {
    const defs = definitions(text);
    return { terms: defs.length, cards: makeCards(text).length, questions: makeQuiz(text).length };
  }

  return {
    ACCEPT,
    KIND_EXT: KINDS,
    list,
    get,
    remove,
    save,
    extract,
    kindOf,
    toHtml,
    fromHtmlPaste,
    mdToHtml,
    plainToHtml,
    definitions,
    boldTerms,
    sentences,
    makeCards,
    makeQuiz,
    summary,
    _internal: { unzip, zipText, docxText, pptxText, xmlToText, inflateRaw },
  };
})();
