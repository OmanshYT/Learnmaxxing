"use strict";
(() => {
  const D = window.STUDY_DATA;
  const DAY = 864e5;
  const KEY = "chem-study-hub.v1";
  const app = document.getElementById("app");
  const $ = (sel, root = document) => root.querySelector(sel);
  const pad = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => Math.round(x * 100) + "%";

  /* ---------- storage (every access guarded: private mode can throw) ---------- */
  let S = { q: {}, cards: {}, log: [], sched: {}, settings: {} };
  try {
    S = { ...S, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch (e) {
    /* storage blocked or corrupt: start fresh */
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) {
      toast("Progress could not be saved in this browser.");
    }
  }

  /* ---------- index the course data ---------- */
  const PARTS = {};
  const QS = [];
  const QMAP = {};
  const CARDS = [];
  const CMAP = {};
  const CHAPS = {};
  D.chapters.forEach((c) => {
    CHAPS[c.num] = c;
    c.parts.forEach((p) => {
      PARTS[p.id] = { ...p, ch: c.num };
      p.questions.forEach((q) => {
        const row = { ...q, part: p.id, ch: c.num, partTitle: p.title };
        QS.push(row);
        QMAP[q.id] = row;
      });
      p.cards.forEach((k) => {
        const row = { ...k, ch: c.num, partTitle: p.title };
        CARDS.push(row);
        CMAP[k.id] = row;
      });
    });
  });

  /* ---------- dates ---------- */
  const startToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const endToday = () => startToday() + DAY - 1;
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = () => isoOf(new Date());
  const daysUntil = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Math.round((new Date(y, m - 1, d) - startToday()) / DAY);
  };
  const fmtDate = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const fmtTime = (s) => `${Math.floor(s / 60)}:${pad(s % 60)}`;

  /* ---------- question + card state ---------- */
  const scoreOf = (last) => (last === "got" ? 1 : last === "partial" ? 0.5 : 0);
  const isWeak = (id) => S.q[id] && (S.q[id].last === "missed" || S.q[id].last === "partial");
  const isDue = (id) => S.q[id] && S.q[id].n > 0 && S.q[id].due <= endToday();
  const isCardDue = (id) => S.cards[id] && S.cards[id].due <= endToday();

  function gradeQuestion(id, res) {
    const r = S.q[id] || (S.q[id] = { n: 0, ivl: 0, ease: 2.5, due: 0, last: null, flag: false });
    r.n += 1;
    r.last = res;
    r.at = Date.now();
    if (res === "missed") {
      r.ivl = 1;
      r.ease = Math.max(1.3, r.ease - 0.2);
    } else if (res === "partial") {
      r.ivl = Math.max(1, Math.round(Math.max(r.ivl, 1) * 1.2));
    } else {
      r.ivl = r.ivl < 1 ? 1 : r.ivl < 3 ? 3 : Math.round(r.ivl * r.ease);
      r.ease = Math.min(3, r.ease + 0.1);
    }
    r.due = startToday() + r.ivl * DAY;
    S.log.push({ t: Date.now(), id, res });
    if (S.log.length > 5000) S.log.splice(0, S.log.length - 5000);
    save();
  }

  function gradeCard(id, rating) {
    const r = S.cards[id] || (S.cards[id] = { n: 0, ivl: 0, ease: 2.5, due: 0 });
    r.n += 1;
    if (rating === "again") {
      r.ivl = 0;
      r.ease = Math.max(1.3, r.ease - 0.2);
      r.due = Date.now() + 10 * 60e3;
    } else {
      if (rating === "hard") {
        r.ivl = Math.max(1, Math.round(Math.max(r.ivl, 1) * 1.2));
        r.ease = Math.max(1.3, r.ease - 0.15);
      } else if (rating === "good") {
        r.ivl = r.ivl < 1 ? 1 : r.ivl < 3 ? 3 : Math.round(r.ivl * r.ease);
      } else {
        r.ivl = r.ivl < 1 ? 4 : Math.round(r.ivl * r.ease * 1.3);
        r.ease = Math.min(3, r.ease + 0.15);
      }
      r.due = startToday() + r.ivl * DAY;
    }
    save();
  }

  function flagQuestion(id) {
    const r = S.q[id] || (S.q[id] = { n: 0, ivl: 0, ease: 2.5, due: 0, last: null, flag: false });
    r.flag = !r.flag;
    save();
  }

  function masteryOf(ids) {
    let sum = 0;
    let n = 0;
    ids.forEach((id) => {
      const r = S.q[id];
      if (r && r.last) {
        n += 1;
        sum += scoreOf(r.last);
      }
    });
    return { mastery: n ? sum / n : null, answered: n, total: ids.length };
  }

  const chapterIds = (num) => QS.filter((q) => q.ch === num).map((q) => q.id);
  const partIds = (id) => QS.filter((q) => q.part === id).map((q) => q.id);

  function poolFor(source, chapters) {
    let list = QS.filter((q) => !chapters || chapters.includes(q.ch));
    switch (source) {
      case "unseen":
        list = list.filter((q) => !(S.q[q.id] && S.q[q.id].n));
        break;
      case "weak":
        list = list.filter((q) => isWeak(q.id)).sort((a, b) => scoreOf(S.q[a.id].last) - scoreOf(S.q[b.id].last));
        break;
      case "due":
        list = list.filter((q) => isDue(q.id)).sort((a, b) => S.q[a.id].due - S.q[b.id].due);
        break;
      case "flagged":
        list = list.filter((q) => S.q[q.id] && S.q[q.id].flag);
        break;
      case "practice":
        list = list.filter((q) => q.kind === "practice");
        break;
      case "extra":
        list = list.filter((q) => q.kind === "extra");
        break;
      default:
        break;
    }
    return list.map((q) => q.id);
  }

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /* ---------- helpers ---------- */
  const plainOf = (html) => {
    const d = document.createElement("div");
    d.innerHTML = html;
    return d.textContent.replace(/\s+/g, " ").trim();
  };
  const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹⁻";
  const supToPlain = (s) => [...s].map((c) => (SUP.includes(c) ? (c === "⁻" ? "-" : String(SUP.indexOf(c))) : c)).join("");
  // First number typed by the user, in plain form (handles 2.00 x 10^-19, 2.00e-19, 2.00 × 10⁻¹⁹).
  function parseTyped(text) {
    const s = text
      .replace(/−/g, "-")
      .replace(/,/g, "")
      .replace(/\s*[×x*]\s*10\s*\^?\s*([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+|-?\d+)/g, (m, e) => "e" + supToPlain(e));
    const m = s.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/);
    return m ? Number(m[0]) : NaN;
  }
  const hintOf = (html) => {
    const words = plainOf(html).split(" ");
    return words.slice(0, 10).join(" ") + (words.length > 10 ? " …" : "");
  };

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  /* ---------- session state (in memory; progress itself is in S) ---------- */
  let sess = null;
  let timerHandle = null;
  function stopTimer() {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }

  function startSession({ ids, title, shuffleIt = false, count = 0, exam = false, minutes = 0 }) {
    if (!ids.length) {
      toast("No questions match that filter yet.");
      return;
    }
    stopTimer();
    let list = shuffleIt ? shuffle(ids) : ids.slice();
    if (count && count < list.length) list = list.slice(0, count);
    sess = {
      kind: "q",
      title,
      exam,
      ids: list,
      i: 0,
      res: {},
      typed: {},
      cur: { picked: null, revealed: false, hint: false, check: null },
      phase: "take",
      t0: Date.now(),
      left: minutes * 60,
    };
    go("#/session");
  }

  function startCards() {
    const due = CARDS.filter((c) => isCardDue(c.id)).sort((a, b) => S.cards[a.id].due - S.cards[b.id].due);
    const fresh = CARDS.filter((c) => !S.cards[c.id]).slice(0, 15);
    const queue = [...due, ...fresh].map((c) => c.id);
    if (!queue.length) {
      toast("No flashcards due. Nice.");
      return;
    }
    stopTimer();
    sess = { kind: "cards", queue, i: 0, flipped: false, total: queue.length, done: 0 };
    go("#/review");
  }

  /* ---------- router ---------- */
  let current = { name: "", arg: "", params: new URLSearchParams() };
  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }
  function route() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, query = ""] = raw.split("?");
    const [name = "", arg = ""] = path.split("/");
    if (!/^(session|review)$/.test(name)) stopTimer();
    current = { name, arg: decodeURIComponent(arg), params: new URLSearchParams(query) };
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const on = a.dataset.nav === (["chapter", "part"].includes(name) ? "chapters" : name === "review" ? "cards" : name === "session" ? "quiz" : name);
      a.classList.toggle("active", on);
    });
    paint();
    window.scrollTo(0, 0);
  }
  function paint() {
    const views = {
      "": viewHome,
      chapters: viewChapters,
      chapter: viewChapter,
      part: viewPart,
      quiz: viewQuizSetup,
      session: viewSession,
      review: viewSession,
      cards: viewCardsHome,
      schedule: viewSchedule,
      reference: viewReference,
      stats: viewStats,
      search: viewSearch,
    };
    (views[current.name] || viewHome)();
  }

  const bar = (p) => `<div class="bar"><span style="width:${Math.round((p || 0) * 100)}%"></span></div>`;
  const badge = (last) =>
    last === "got" ? '<span class="badge good">Got it</span>'
    : last === "partial" ? '<span class="badge mid">Partial</span>'
    : last === "missed" ? '<span class="badge bad">Missed</span>'
    : '<span class="badge">New</span>';

  /* ---------- views ---------- */
  function viewHome() {
    const today = todayIso();
    const days = daysUntil(D.course.exam);
    const todayTask = D.schedule.find((s) => s.date === today);
    const overall = masteryOf(QS.map((q) => q.id));
    const dueQ = poolFor("due").length;
    const weakQ = poolFor("weak").length;
    const dueC = CARDS.filter((c) => isCardDue(c.id)).length;
    const ring = overall.mastery == null ? 0 : overall.mastery;
    app.innerHTML = `
      <section class="hero panel">
        <div>
          <p class="eyebrow">${esc(D.course.name)}</p>
          <h1>${days > 0 ? `${days} days to final` : days === 0 ? "Final is today" : "Final has passed"}</h1>
          <p class="sub">Final exam ${fmtDate(D.course.exam)}. Study one part a day, then drill what you missed.</p>
          <div class="today">
            <span class="label">Today, ${fmtDate(today)}</span>
            ${todayTask
              ? `<p>${todayTask.task}</p>${todayTask.href ? `<a class="btn primary" href="${todayTask.href}">Open today's part</a>` : ""}`
              : `<p class="muted">${today < D.course.start ? "Study starts " + fmtDate(D.course.start) + "." : "No scheduled task today."}</p>`}
          </div>
        </div>
        <div class="ring" style="--p:${Math.round(ring * 100)}">
          <div><b>${overall.mastery == null ? "–" : pct(ring)}</b><span>mastery</span></div>
        </div>
      </section>

      <section class="tiles">
        <a class="tile" href="#/quiz?due"><b>${dueQ}</b><span>questions due</span></a>
        <a class="tile" href="#/quiz?weak"><b>${weakQ}</b><span>weak spots</span></a>
        <a class="tile" href="#/cards"><b>${dueC}</b><span>cards due</span></a>
        <a class="tile" href="#/stats"><b>${overall.answered}</b><span>of ${overall.total} answered</span></a>
      </section>

      <section class="grid-cards">
        ${D.chapters.map((c) => {
          const m = masteryOf(chapterIds(c.num));
          return `<a class="card-link" href="#/chapter/${c.num}">
            <span class="num">Ch ${c.num}</span>
            <h3>${esc(c.title)}</h3>
            ${bar(m.mastery)}
            <small>${m.mastery == null ? "Not started" : pct(m.mastery) + " mastery"}</small>
          </a>`;
        }).join("")}
      </section>`;
  }

  function viewChapters() {
    app.innerHTML = `
      <header class="page-head"><h1>Chapters</h1><p class="sub">${D.chapters.length} chapters, ${QS.length} questions, ${CARDS.length} flashcards.</p></header>
      <section class="grid-cards">
        ${D.chapters.map((c) => {
          const m = masteryOf(chapterIds(c.num));
          return `<div class="panel chapter-card">
            <span class="num">Ch ${c.num}</span>
            <h3><a href="#/chapter/${c.num}">${esc(c.title)}</a></h3>
            ${bar(m.mastery)}
            <small>${m.mastery == null ? "Not started" : pct(m.mastery) + " mastery"} · ${m.answered}/${m.total} answered</small>
            <div class="row">
              <a class="btn ghost" href="#/chapter/${c.num}">Open</a>
              <button class="btn ghost" data-act="quiz-ch" data-ch="${c.num}">Quiz chapter</button>
            </div>
          </div>`;
        }).join("")}
      </section>`;
  }

  function viewChapter() {
    const c = CHAPS[current.arg];
    if (!c) return go("#/chapters");
    const m = masteryOf(chapterIds(c.num));
    app.innerHTML = `
      <p class="crumbs"><a href="#/chapters">Chapters</a> / Ch ${c.num}</p>
      <header class="page-head">
        <h1>Ch ${c.num}: ${esc(c.title)}</h1>
        <p class="sub">${c.lecture ? c.lecture : ""}</p>
      </header>
      <div class="row wrap-row">
        <button class="btn primary" data-act="quiz-ch" data-ch="${c.num}">Quiz this chapter (${m.total})</button>
        ${c.worksheet ? `<a class="btn ghost" href="${encodeURI(c.worksheet)}" target="_blank" rel="noopener">Worksheet PDF</a>` : ""}
        <a class="btn ghost" href="#/cards">Flashcards</a>
      </div>
      <section class="part-list">
        ${c.parts.map((p) => {
          const pm = masteryOf(partIds(p.id));
          return `<a class="panel part-row" href="#/part/${p.id}">
            <span class="num">${p.id}</span>
            <div><h3>${esc(p.title)}</h3>${bar(pm.mastery)}</div>
            <small>${pm.answered}/${pm.total}</small>
          </a>`;
        }).join("")}
      </section>`;
  }

  function viewPart() {
    const p = PARTS[current.arg];
    if (!p) return go("#/chapters");
    const ids = partIds(p.id);
    const order = Object.keys(PARTS);
    const i = order.indexOf(p.id);
    const prev = order[i - 1];
    const next = order[i + 1];
    app.innerHTML = `
      <p class="crumbs"><a href="#/chapters">Chapters</a> / <a href="#/chapter/${p.ch}">Ch ${p.ch}</a> / ${p.id}</p>
      <header class="page-head"><h1>${p.id} ${esc(p.title)}</h1></header>
      <div class="row wrap-row">
        <button class="btn primary" data-act="quiz-part" data-part="${p.id}">Quiz this part (${ids.length})</button>
        <button class="btn ghost" data-act="quiz-part-exam" data-part="${p.id}">Timed mini-exam</button>
      </div>
      <article class="panel prose">${p.learn || "<p class='muted'>No notes for this part.</p>"}</article>
      <section>
        <h2>Practice questions</h2>
        ${p.questions.map((q) => `
          <details class="panel qrow">
            <summary>${badge(S.q[q.id] && S.q[q.id].last)} <span class="qlabel">${q.label}${q.kind === "extra" ? " · extra" : ""}</span> ${q.q}</summary>
            <div class="answer">${q.answer}</div>
          </details>`).join("")}
      </section>
      ${p.cards.length ? `<section><h2>Flashcards</h2><div class="panel">
        ${p.cards.map((k) => `<p class="cardline"><b>${k.q}</b><br><span class="muted">${k.a}</span></p>`).join("")}
      </div></section>` : ""}
      <nav class="pager">
        ${prev ? `<a class="btn ghost" href="#/part/${prev}">← ${prev}</a>` : "<span></span>"}
        ${next ? `<a class="btn ghost" href="#/part/${next}">${next} →</a>` : "<span></span>"}
      </nav>`;
  }

  function viewQuizSetup() {
    const chips = D.chapters.map((c) => `<label class="chip"><input type="checkbox" name="ch" value="${c.num}" checked><span>Ch ${c.num}</span></label>`).join("");
    const preset = (src, label, n) => `<button class="panel preset" data-act="preset" data-src="${src}">
        <b>${n}</b><span>${label}</span></button>`;
    const pre = current.params;
    app.innerHTML = `
      <header class="page-head"><h1>Quiz</h1><p class="sub">Practice grades as you go. Exam mode hides answers until the end and runs on a timer.</p></header>
      <div class="presets">
        ${preset("due", "Due today (SRS)", poolFor("due").length)}
        ${preset("weak", "Weak spots", poolFor("weak").length)}
        ${preset("flagged", "Flagged", poolFor("flagged").length)}
        ${preset("unseen", "Not seen yet", poolFor("unseen").length)}
        <button class="panel preset exam" data-act="preset-exam"><b>Exam</b><span>25 random, timed</span></button>
      </div>
      <form id="quiz-form" class="panel">
        <fieldset>
          <legend>Chapters</legend>
          <div class="chips">${chips}</div>
          <p class="row"><button type="button" class="link" data-act="ch-all">All</button><button type="button" class="link" data-act="ch-none">None</button></p>
        </fieldset>
        <div class="grid2">
          <label>Question set
            <select name="source">
              <option value="all">All questions</option>
              <option value="unseen">Not seen yet</option>
              <option value="weak"${pre.has("weak") ? " selected" : ""}>Weak (missed or partial)</option>
              <option value="due"${pre.has("due") ? " selected" : ""}>Due today</option>
              <option value="flagged">Flagged</option>
              <option value="practice">Practice questions only</option>
              <option value="extra">Extra practice only</option>
            </select></label>
          <label>How many
            <select name="count">
              <option value="5">5</option><option value="10" selected>10</option><option value="20">20</option><option value="40">40</option><option value="0">All in set</option>
            </select></label>
          <label>Order
            <select name="order"><option value="shuffle">Shuffled</option><option value="book">Book order</option></select></label>
          <label>Mode
            <select name="mode"><option value="practice">Practice: grade as you go</option><option value="exam">Exam: timed, grade at end</option></select></label>
          <label>Minutes (exam only)
            <input type="number" name="minutes" min="1" max="180" value="15"></label>
        </div>
        <div class="row"><button class="btn primary" type="submit">Start quiz</button></div>
      </form>`;
  }

  /* ---------- session: practice + exam + results ---------- */
  function viewSession() {
    if (!sess) return go("#/quiz");
    if (sess.kind === "cards") return paintCard();
    if (sess.phase === "done") return paintResults();
    if (sess.phase === "grade") return paintGrade();
    if (sess.exam) {
      if (!timerHandle) timerHandle = setInterval(tick, 1000);
      return paintExam();
    }
    paintPractice();
  }

  function tick() {
    sess.left -= 1;
    const el = $("#timer");
    if (el) el.textContent = fmtTime(Math.max(0, sess.left));
    if (sess.left <= 0) {
      stopTimer();
      sess.phase = "grade";
      toast("Time is up. Grade your answers.");
      paint();
    }
  }

  const qProgress = () => `<div class="sess-top">
      <span class="muted">${esc(sess.title)} · ${sess.i + 1} / ${sess.ids.length}</span>
      ${sess.exam ? `<span class="timer" id="timer">${fmtTime(Math.max(0, sess.left))}</span>` : ""}
      <button class="link" data-act="exit">Exit</button>
    </div>${bar((sess.i + (sess.res[sess.ids[sess.i]] ? 1 : 0)) / sess.ids.length)}`;

  function paintPractice() {
    const id = sess.ids[sess.i];
    const q = QMAP[id];
    const cur = sess.cur;
    const graded = sess.res[id];
    let body = "";
    if (q.options) {
      body += `<div class="opts">${q.options.map((o) => {
        let cls = "opt";
        if (cur.picked) {
          if (q.letter && o.letter === q.letter) cls += " right";
          else if (o.letter === cur.picked) cls += " wrong";
        }
        return `<button class="${cls}" data-act="pick" data-letter="${o.letter}"${cur.picked ? " disabled" : ""}>
          <span class="ol">${o.letter}</span><span>${o.html}</span></button>`;
      }).join("")}</div>`;
    } else {
      body += `<label class="typed"><span>Your working (optional)</span>
        <textarea id="typed" rows="3" placeholder="Work it out here first">${esc(sess.typed[id] || "")}</textarea></label>
        <div class="row">
          ${q.key ? `<button class="btn ghost" data-act="check">Check number</button>` : ""}
          <button class="btn ghost" data-act="hint">${cur.hint ? "Hint shown" : "Hint"}</button>
          ${cur.revealed ? "" : `<button class="btn primary" data-act="reveal">Show answer</button>`}
        </div>
        ${cur.check ? `<p class="check ${cur.check.ok ? "ok" : "no"}">${cur.check.msg}</p>` : ""}
        ${cur.hint ? `<p class="hint">${hintOf(q.answer)}</p>` : ""}`;
    }
    if (cur.revealed || cur.picked) {
      body += `<div class="answer"><div class="ans-label">Answer</div>${q.answer}</div>`;
    }
    let actions = "";
    if (graded) {
      actions = `<span class="muted">Recorded: ${graded === "got" ? "Got it" : graded === "partial" ? "Partial" : "Missed"}</span>
        <button class="btn primary" data-act="next">Next →</button>`;
    } else if (cur.revealed) {
      actions = `<button class="btn bad" data-act="grade" data-res="missed">Missed <kbd>1</kbd></button>
        <button class="btn mid" data-act="grade" data-res="partial">Partial <kbd>2</kbd></button>
        <button class="btn good" data-act="grade" data-res="got">Got it <kbd>3</kbd></button>
        <button class="link" data-act="next">Skip</button>`;
    } else if (!q.options) {
      actions = `<button class="link" data-act="next">Skip</button>`;
    } else {
      actions = `<button class="link" data-act="next">Skip</button>`;
    }
    app.innerHTML = `<section class="session">
      ${qProgress()}
      <article class="panel qcard">
        <div class="qmeta">
          <span class="badge">Ch ${q.ch} · ${q.part}</span>
          ${q.kind === "extra" ? '<span class="badge">Extra</span>' : ""}
          ${badge(S.q[id] && S.q[id].last)}
          <button class="flag${S.q[id] && S.q[id].flag ? " on" : ""}" data-act="flag" title="Flag (F)">★ ${S.q[id] && S.q[id].flag ? "Flagged" : "Flag"}</button>
        </div>
        <h2 class="qtext">${q.q}</h2>
        ${body}
      </article>
      <div class="actions">${actions}</div>
      <p class="keys">Keys: Space show · 1 Missed · 2 Partial · 3 Got it · Enter next · F flag</p>
    </section>`;
  }

  function paintExam() {
    const id = sess.ids[sess.i];
    const q = QMAP[id];
    const answered = sess.ids.filter((x) => sess.typed[x] && sess.typed[x].trim()).length;
    app.innerHTML = `<section class="session">
      ${qProgress()}
      <div class="navdots">${sess.ids.map((x, n) => `<button class="dot${n === sess.i ? " on" : ""}${sess.typed[x] ? " done" : ""}" data-act="goto" data-n="${n}">${n + 1}</button>`).join("")}</div>
      <article class="panel qcard">
        <div class="qmeta"><span class="badge">Ch ${q.ch} · ${q.part}</span></div>
        <h2 class="qtext">${q.q}</h2>
        ${q.options ? `<ol class="mc-list">${q.options.map((o) => `<li><b>${o.letter})</b> ${o.html}</li>`).join("")}</ol>` : ""}
        <label class="typed"><span>Your answer</span>
          <textarea id="typed" rows="4" placeholder="Write your answer">${esc(sess.typed[id] || "")}</textarea></label>
      </article>
      <div class="actions">
        <button class="btn ghost" data-act="prev"${sess.i === 0 ? " disabled" : ""}>← Prev</button>
        <button class="btn ghost" data-act="next">Next →</button>
        <span class="grow"></span>
        <span class="muted">${answered}/${sess.ids.length} written</span>
        <button class="btn primary" data-act="finish-exam">Finish exam</button>
      </div>
    </section>`;
  }

  function paintGrade() {
    app.innerHTML = `<section class="session">
      <header class="page-head"><h1>Grade your exam</h1>
        <p class="sub">Open each answer, compare it with your writing, then grade it honestly. Ungraded items are not recorded.</p></header>
      ${sess.ids.map((id, n) => {
        const q = QMAP[id];
        const g = sess.res[id];
        return `<article class="panel qcard">
          <div class="qmeta"><span class="badge">${n + 1}. Ch ${q.ch} · ${q.part}</span>${badge(g)}</div>
          <h2 class="qtext">${q.q}</h2>
          ${sess.typed[id] ? `<p class="yours"><b>You wrote:</b> ${esc(sess.typed[id])}</p>` : '<p class="muted">No answer written.</p>'}
          <details><summary>Show answer</summary><div class="answer">${q.answer}</div></details>
          <div class="row">
            <button class="btn bad${g === "missed" ? " on" : ""}" data-act="exam-grade" data-id="${id}" data-res="missed">Missed</button>
            <button class="btn mid${g === "partial" ? " on" : ""}" data-act="exam-grade" data-id="${id}" data-res="partial">Partial</button>
            <button class="btn good${g === "got" ? " on" : ""}" data-act="exam-grade" data-id="${id}" data-res="got">Got it</button>
          </div>
        </article>`;
      }).join("")}
      <div class="actions"><button class="btn primary" data-act="submit-exam">See results</button></div>
    </section>`;
  }

  function paintResults() {
    const n = sess.ids.length;
    let got = 0;
    let partial = 0;
    let missed = 0;
    const byPart = {};
    sess.ids.forEach((id) => {
      const q = QMAP[id];
      const row = (byPart[q.part] ||= { title: q.partTitle, got: 0, partial: 0, missed: 0, n: 0 });
      row.n += 1;
      const g = sess.res[id];
      if (g === "got") { got++; row.got++; }
      else if (g === "partial") { partial++; row.partial++; }
      else if (g === "missed") { missed++; row.missed++; }
    });
    const score = n ? (got + partial * 0.5) / n : 0;
    const secs = Math.round((Date.now() - sess.t0) / 1000);
    const retry = sess.ids.filter((id) => sess.res[id] === "missed" || sess.res[id] === "partial");
    const msg = score === 1 ? "Perfect run." : score >= 0.8 ? "Strong." : score >= 0.5 ? "Getting there." : "Needs another pass.";
    app.innerHTML = `<section class="results panel">
      <div class="ring big" style="--p:${Math.round(score * 100)}"><div><b>${pct(score)}</b><span>score</span></div></div>
      <h1>${msg}</h1>
      <p class="sub">${esc(sess.title)} · ${n} questions · ${fmtTime(secs)}</p>
      <div class="tiles small">
        <div class="tile good"><b>${got}</b><span>got it</span></div>
        <div class="tile mid"><b>${partial}</b><span>partial</span></div>
        <div class="tile bad"><b>${missed}</b><span>missed</span></div>
        <div class="tile"><b>${n - got - partial - missed}</b><span>ungraded</span></div>
      </div>
      <table class="tbl"><thead><tr><th>Part</th><th>Got</th><th>Partial</th><th>Missed</th><th>Score</th></tr></thead><tbody>
        ${Object.entries(byPart).map(([id, r]) => `<tr><td>${id} ${esc(r.title)}</td><td>${r.got}</td><td>${r.partial}</td><td>${r.missed}</td><td>${pct(r.n ? (r.got + r.partial * 0.5) / r.n : 0)}</td></tr>`).join("")}
      </tbody></table>
      <div class="row wrap-row">
        ${retry.length ? `<button class="btn primary" data-act="retry" data-ids="${retry.join(",")}">Retry ${retry.length} missed</button>` : ""}
        <a class="btn ghost" href="#/quiz">New quiz</a>
        <a class="btn ghost" href="#/stats">Stats</a>
      </div>
    </section>`;
  }

  /* ---------- flashcards ---------- */
  function viewCardsHome() {
    const due = CARDS.filter((c) => isCardDue(c.id)).length;
    const fresh = CARDS.filter((c) => !S.cards[c.id]).length;
    const learned = CARDS.length - fresh;
    app.innerHTML = `
      <header class="page-head"><h1>Flashcards</h1><p class="sub">Spaced repetition: cards you miss come back sooner.</p></header>
      <section class="tiles">
        <div class="tile"><b>${due}</b><span>due</span></div>
        <div class="tile"><b>${Math.min(fresh, 15)}</b><span>new today (max 15)</span></div>
        <div class="tile"><b>${learned}</b><span>started</span></div>
        <div class="tile"><b>${CARDS.length}</b><span>total</span></div>
      </section>
      <div class="row"><button class="btn primary" data-act="cards-start">Start review</button></div>
      <section class="panel">
        <h2>By chapter</h2>
        ${D.chapters.map((c) => {
          const ks = CARDS.filter((k) => k.ch === c.num);
          const started = ks.filter((k) => S.cards[k.id]).length;
          return `<p class="cardline">Ch ${c.num} ${esc(c.title)}: <span class="muted">${started}/${ks.length} started</span></p>`;
        }).join("")}
      </section>`;
  }

  function paintCard() {
    if (sess.i >= sess.queue.length) {
      app.innerHTML = `<section class="results panel">
        <h1>Review done</h1>
        <p class="sub">${sess.done} cards reviewed.</p>
        <div class="row"><a class="btn primary" href="#/cards">Back to flashcards</a></div></section>`;
      sess = null;
      return;
    }
    const c = CMAP[sess.queue[sess.i]];
    app.innerHTML = `<section class="session">
      <div class="sess-top"><span class="muted">${sess.i + 1} / ${sess.queue.length} · Ch ${c.ch} · ${esc(c.partTitle)}</span>
        <button class="link" data-act="exit-cards">Exit</button></div>
      ${bar(sess.i / sess.queue.length)}
      <article class="panel flashcard${sess.flipped ? " flipped" : ""}" data-act="flip">
        <span class="label">${sess.flipped ? "Answer" : "Question (click or Space)"}</span>
        <h2>${sess.flipped ? c.a : c.q}</h2>
      </article>
      ${sess.flipped
        ? `<div class="actions">
            <button class="btn bad" data-act="rate" data-r="again">Again <kbd>1</kbd></button>
            <button class="btn mid" data-act="rate" data-r="hard">Hard <kbd>2</kbd></button>
            <button class="btn good" data-act="rate" data-r="good">Good <kbd>3</kbd></button>
            <button class="btn" data-act="rate" data-r="easy">Easy <kbd>4</kbd></button>
          </div>`
        : ""}
    </section>`;
  }

  /* ---------- schedule, reference, stats, search ---------- */
  function viewSchedule() {
    const today = todayIso();
    const done = D.schedule.filter((s) => S.sched[s.date]).length;
    app.innerHTML = `
      <header class="page-head"><h1>Schedule</h1><p class="sub">${done} of ${D.schedule.length} days ticked off. Tick a day when you finish it.</p></header>
      <div class="panel table-wrap"><table class="tbl sched">
        <thead><tr><th></th><th>Date</th><th>Day</th><th>Task</th></tr></thead>
        <tbody>${D.schedule.map((s) => `<tr class="${s.date === today ? "today" : ""}">
          <td><input type="checkbox" data-act="sched" data-date="${s.date}" ${S.sched[s.date] ? "checked" : ""} aria-label="Done ${s.date}"></td>
          <td>${fmtDate(s.date)}</td><td>${s.day}</td><td>${s.task}</td></tr>`).join("")}
        </tbody></table></div>`;
  }

  function viewReference() {
    app.innerHTML = `
      <header class="page-head"><h1>Formula sheet</h1><div class="row"><button class="btn ghost" data-act="print">Print</button></div></header>
      <article class="panel prose">${D.formula}</article>`;
  }

  function viewStats() {
    const log = S.log;
    const got = log.filter((l) => l.res === "got").length;
    const partial = log.filter((l) => l.res === "partial").length;
    const acc = log.length ? (got + partial * 0.5) / log.length : null;
    const dayKey = (t) => isoOf(new Date(t));
    const counts = {};
    log.forEach((l) => (counts[dayKey(l.t)] = (counts[dayKey(l.t)] || 0) + 1));
    let streak = 0;
    const d = new Date();
    if (!counts[isoOf(d)]) d.setDate(d.getDate() - 1);
    while (counts[isoOf(d)]) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    const cells = [];
    for (let k = 83; k >= 0; k--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - k);
      const key = isoOf(dt);
      const n = counts[key] || 0;
      const lvl = n === 0 ? 0 : n < 5 ? 1 : n < 10 ? 2 : n < 20 ? 3 : 4;
      cells.push(`<i class="hm l${lvl}" title="${key}: ${n} answers"></i>`);
    }
    const cards = Object.keys(S.cards).length;
    app.innerHTML = `
      <header class="page-head"><h1>Stats</h1><p class="sub">All progress is stored in this browser only. Export it to back it up.</p></header>
      <section class="tiles">
        <div class="tile"><b>${log.length}</b><span>answers graded</span></div>
        <div class="tile"><b>${acc == null ? "–" : pct(acc)}</b><span>accuracy</span></div>
        <div class="tile"><b>${streak}</b><span>day streak</span></div>
        <div class="tile"><b>${cards}</b><span>cards started</span></div>
      </section>
      <section class="panel">
        <h2>Mastery by chapter</h2>
        ${D.chapters.map((c) => {
          const m = masteryOf(chapterIds(c.num));
          return `<div class="barrow"><span>Ch ${c.num} ${esc(c.title)}</span>${bar(m.mastery)}<b>${m.mastery == null ? "–" : pct(m.mastery)}</b></div>`;
        }).join("")}
      </section>
      <section class="panel">
        <h2>Last 12 weeks</h2>
        <div class="heat">${cells.join("")}</div>
      </section>
      <section class="panel row wrap-row">
        <button class="btn ghost" data-act="export">Export progress</button>
        <label class="btn ghost file">Import progress<input type="file" id="import" accept="application/json"></label>
        <button class="btn bad" data-act="reset">Reset progress</button>
      </section>`;
  }

  function viewSearch() {
    const term = (current.params.get("q") || "").trim().toLowerCase();
    const hits = [];
    if (term) {
      QS.forEach((q) => {
        const t = plainOf(q.q + " " + q.answer);
        if (t.toLowerCase().includes(term)) hits.push({ href: `#/part/${q.part}`, title: `${q.part} ${q.partTitle}`, text: plainOf(q.q) });
      });
      CARDS.forEach((k) => {
        const t = plainOf(k.q + " " + k.a);
        if (t.toLowerCase().includes(term)) hits.push({ href: `#/part/${k.part}`, title: `Flashcard · ${k.partTitle}`, text: plainOf(k.q) });
      });
      Object.values(PARTS).forEach((p) => {
        if (plainOf(p.learn).toLowerCase().includes(term)) hits.push({ href: `#/part/${p.id}`, title: `${p.id} ${p.title}`, text: "Notes" });
      });
    }
    const seen = new Set();
    const list = hits.filter((h) => (seen.has(h.href + h.text) ? false : seen.add(h.href + h.text)));
    app.innerHTML = `
      <header class="page-head"><h1>Search</h1><p class="sub">${term ? `${list.length} results for “${esc(term)}”` : "Type in the search box above."}</p></header>
      <section class="part-list">
        ${list.slice(0, 80).map((h) => `<a class="panel part-row" href="${h.href}"><div><h3>${esc(h.title)}</h3><small>${esc(h.text.slice(0, 160))}</small></div></a>`).join("")}
      </section>`;
  }

  /* ---------- actions (event delegation) ---------- */
  function pick(letter) {
    const id = sess.ids[sess.i];
    const q = QMAP[id];
    if (sess.cur.picked) return;
    sess.cur.picked = letter;
    sess.cur.revealed = true;
    if (q.letter) grade(q.letter === letter ? "got" : "missed");
    else paint();
  }

  function grade(res) {
    const id = sess.ids[sess.i];
    if (sess.res[id]) return;
    sess.res[id] = res;
    gradeQuestion(id, res);
    sess.cur.revealed = true;
    paint();
  }

  function next() {
    sess.i += 1;
    sess.cur = { picked: null, revealed: false, hint: false, check: null };
    if (sess.i >= sess.ids.length) {
      sess.phase = "done";
      if (sess.exam) stopTimer();
    }
    paint();
  }

  // count 0 means every question in the set
  function startExam(ids, minutes, title, count = 25) {
    startSession({ ids, title, shuffleIt: true, count, exam: true, minutes });
  }

  const ACTIONS = {
    theme() {
      const cur = document.documentElement.dataset.theme;
      const next = cur === "dark" || (!cur && matchMedia("(prefers-color-scheme: dark)").matches) ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      S.settings.theme = next;
      save();
    },
    "ch-all": () => document.querySelectorAll('input[name="ch"]').forEach((i) => (i.checked = true)),
    "ch-none": () => document.querySelectorAll('input[name="ch"]').forEach((i) => (i.checked = false)),
    preset(el) {
      const src = el.dataset.src;
      const all = D.chapters.map((c) => c.num);
      const ordered = src === "due" || src === "weak";
      startSession({
        ids: poolFor(src, all),
        title: { due: "Due today", weak: "Weak spots", flagged: "Flagged", unseen: "Not seen yet" }[src],
        shuffleIt: !ordered,
        count: 20,
      });
    },
    "preset-exam"() {
      startExam(poolFor("all", D.chapters.map((c) => c.num)), 30, "Exam");
    },
    "quiz-ch"(el) {
      const n = Number(el.dataset.ch);
      startSession({ ids: chapterIds(n), title: `Ch ${n}`, shuffleIt: true });
    },
    "quiz-part"(el) {
      startSession({ ids: partIds(el.dataset.part), title: el.dataset.part, shuffleIt: true });
    },
    "quiz-part-exam"(el) {
      startExam(partIds(el.dataset.part), 15, `Exam ${el.dataset.part}`, 0);
    },
    pick(el) {
      pick(el.dataset.letter);
    },
    reveal() {
      sess.cur.revealed = true;
      paint();
    },
    grade(el) {
      grade(el.dataset.res);
    },
    next() {
      next();
    },
    hint() {
      sess.cur.hint = true;
      paint();
    },
    check() {
      const id = sess.ids[sess.i];
      const q = QMAP[id];
      const v = parseTyped($("#typed").value || "");
      if (Number.isNaN(v)) sess.cur.check = { ok: false, msg: "Type your number first." };
      else {
        const ok = Math.abs(v - Number(q.key)) <= Math.abs(Number(q.key)) * 0.01;
        sess.cur.check = ok
          ? { ok: true, msg: "✓ Your number matches the key number. Grade yourself below." }
          : { ok: false, msg: "✗ Not the key number yet. Check your working." };
      }
      paint();
    },
    flag() {
      flagQuestion(sess.ids[sess.i]);
      paint();
    },
    exit() {
      stopTimer();
      sess = null;
      go("#/quiz");
    },
    "exit-cards"() {
      sess = null;
      go("#/cards");
    },
    prev() {
      saveTyped();
      sess.i = Math.max(0, sess.i - 1);
      paint();
    },
    goto(el) {
      saveTyped();
      sess.i = Number(el.dataset.n);
      paint();
    },
    "finish-exam"() {
      saveTyped();
      if (!confirm("Finish the exam now? You will grade each answer next.")) return;
      stopTimer();
      sess.phase = "grade";
      paint();
    },
    "exam-grade"(el) {
      const id = el.dataset.id;
      if (sess.res[id] === el.dataset.res) delete sess.res[id];
      else sess.res[id] = el.dataset.res;
      paint();
    },
    "submit-exam"() {
      const ungraded = sess.ids.filter((id) => !sess.res[id]).length;
      if (ungraded && !confirm(`${ungraded} questions are not graded and will not be recorded. Continue?`)) return;
      sess.ids.forEach((id) => sess.res[id] && gradeQuestion(id, sess.res[id]));
      sess.phase = "done";
      paint();
    },
    retry(el) {
      startSession({ ids: el.dataset.ids.split(","), title: "Retry missed" });
    },
    "cards-start"() {
      startCards();
    },
    flip() {
      sess.flipped = !sess.flipped;
      paint();
    },
    rate(el) {
      const id = sess.queue[sess.i];
      const r = el.dataset.r;
      gradeCard(id, r);
      sess.done += 1;
      if (r === "again") sess.queue.push(id);
      sess.i += 1;
      sess.flipped = false;
      paint();
    },
    sched() {},
    print() {
      window.print();
    },
    export() {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "chem-study-progress.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    reset() {
      if (!confirm("Erase all progress in this browser? This cannot be undone.")) return;
      S = { q: {}, cards: {}, log: [], sched: {}, settings: S.settings };
      save();
      toast("Progress reset.");
      paint();
    },
  };

  function saveTyped() {
    if (!sess || sess.kind !== "q") return;
    const el = $("#typed");
    if (el) sess.typed[sess.ids[sess.i]] = el.value;
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.tagName === "INPUT" || el.tagName === "LABEL") return;
    if (el.hasAttribute("disabled")) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) {
      e.preventDefault();
      fn(el, e);
    }
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches('[data-act="sched"]')) {
      const d = t.dataset.date;
      S.sched[d] = t.checked;
      save();
      paint();
    }
    if (t.id === "import" && t.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          S = { q: {}, cards: {}, log: [], sched: {}, settings: {}, ...data };
          save();
          toast("Progress imported.");
          paint();
        } catch (err) {
          toast("That file is not a valid progress export.");
        }
      };
      reader.readAsText(t.files[0]);
    }
  });

  document.addEventListener("submit", (e) => {
    if (e.target.id === "quiz-form") {
      e.preventDefault();
      const fd = new FormData(e.target);
      const chapters = fd.getAll("ch").map(Number);
      if (!chapters.length) return toast("Pick at least one chapter.");
      const source = fd.get("source");
      const ids = poolFor(source, chapters);
      const count = Number(fd.get("count"));
      const exam = fd.get("mode") === "exam";
      const minutes = Math.max(1, Number(fd.get("minutes")) || 15);
      const label = e.target.querySelector('[name="source"] option:checked').textContent;
      if (exam) return startExam(ids, minutes, "Exam", count);
      startSession({ ids, title: label, shuffleIt: fd.get("order") === "shuffle", count });
    }
    if (e.target.id === "search-form") {
      e.preventDefault();
      const v = $("#search-input").value.trim();
      go("#/search?q=" + encodeURIComponent(v));
    }
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "typed" && sess && sess.kind === "q") {
      sess.typed[sess.ids[sess.i]] = e.target.value;
    }
  });

  /* keyboard shortcuts for practice, exam and flashcards */
  document.addEventListener("keydown", (e) => {
    if (!sess || e.target.matches?.("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (sess.kind === "cards") {
      if (k === " " || k === "Enter") { e.preventDefault(); ACTIONS.flip(); }
      else if (sess.flipped && "1234".includes(k)) ACTIONS.rate({ dataset: { r: ["again", "hard", "good", "easy"][Number(k) - 1] } });
      return;
    }
    if (sess.phase !== "take" || sess.phase === "done") return;
    if (sess.exam) {
      if (k === "ArrowRight") ACTIONS.next();
      else if (k === "ArrowLeft") ACTIONS.prev();
      return;
    }
    const id = sess.ids[sess.i];
    const q = QMAP[id];
    if (k === " " && !q.options && !sess.cur.revealed) { e.preventDefault(); ACTIONS.reveal(); }
    else if (k === "Enter" || k === "ArrowRight") { e.preventDefault(); ACTIONS.next(); }
    else if (k === "f" || k === "F") ACTIONS.flag();
    else if (sess.cur.revealed && !sess.res[id] && "123".includes(k)) {
      ACTIONS.grade({ dataset: { res: ["missed", "partial", "got"][Number(k) - 1] } });
    }
  });

  /* ---------- boot ---------- */
  if (S.settings.theme) document.documentElement.dataset.theme = S.settings.theme;
  const sForm = document.getElementById("search-form");
  if (sForm) sForm.setAttribute("autocomplete", "off");
  window.addEventListener("hashchange", route);
  route();
})();
