"use strict";
/*
  Look & layout. Which tabs exist and in what order, which dashboard widgets show,
  the colour palette, the font, and a personal picture/quote. This file holds the
  model and the defaults only; app.js saves the choice and renders the settings
  screen, so the site's chrome can change without touching the quiz engine.
*/
window.HubUI = (() => {
  /* Home is locked so there is always a landing page, and Look & layout is locked
     so a student can never hide the screen that unhides things. Both still move. */
  const TABS = [
    { id: "home", label: "Home", href: "#/", locked: true },
    { id: "chapters", label: "Chapters", href: "#/chapters" },
    { id: "upload", label: "Upload", href: "#/upload" },
    { id: "quiz", label: "Quiz", href: "#/quiz" },
    { id: "cards", label: "Flashcards", href: "#/cards" },
    { id: "schedule", label: "Schedule", href: "#/schedule" },
    { id: "reference", label: "Formulas", href: "#/reference" },
    { id: "stats", label: "Stats", href: "#/stats" },
    { id: "settings", label: "Look & layout", href: "#/settings", locked: true },
  ];

  const WIDGETS = [
    { id: "countdown", label: "Final countdown & today's task", locked: true },
    { id: "tiles", label: "Stat tiles (due, weak, cards, answered)" },
    { id: "chapters", label: "Chapter progress" },
    { id: "uploads", label: "Recent uploads" },
    { id: "schedule", label: "Next up on the schedule" },
    { id: "quick", label: "Jump back in (quick actions)" },
    { id: "photo", label: "Your picture & quote" },
  ];

  const PALETTES = [
    { id: "indigo", label: "Indigo", swatch: ["#4b5cf0", "#eef2f9"] },
    { id: "ocean", label: "Ocean", swatch: ["#0e7490", "#e8f6fa"] },
    { id: "forest", label: "Forest", swatch: ["#16794f", "#eaf6ef"] },
    { id: "sunset", label: "Sunset", swatch: ["#c2410c", "#fdf0e7"] },
    { id: "plum", label: "Plum", swatch: ["#7e22ce", "#f5ecfd"] },
    { id: "slate", label: "Slate", swatch: ["#334155", "#eef1f5"] },
  ];

  /* Stacks avoid loading anything: only the Google families add a stylesheet,
     and only when that font is actually picked. */
  const FONTS = [
    { id: "system", label: "System sans", stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    { id: "inter", label: "Inter", stack: '"Inter", system-ui, sans-serif', google: "Inter:wght@400;500;600;700" },
    { id: "poppins", label: "Poppins", stack: '"Poppins", system-ui, sans-serif', google: "Poppins:wght@400;500;600;700" },
    { id: "lato", label: "Lato", stack: '"Lato", system-ui, sans-serif', google: "Lato:wght@400;700" },
    { id: "nunito", label: "Nunito", stack: '"Nunito", system-ui, sans-serif', google: "Nunito:wght@400;600;700" },
    { id: "merriweather", label: "Merriweather", stack: '"Merriweather", Georgia, serif', google: "Merriweather:wght@400;700" },
    { id: "source-serif", label: "Source Serif", stack: '"Source Serif 4", Georgia, serif', google: "Source+Serif+4:wght@400;600;700" },
    { id: "playfair", label: "Playfair Display", stack: '"Playfair Display", Georgia, serif', google: "Playfair+Display:wght@400;600;700" },
    { id: "jetbrains", label: "JetBrains Mono", stack: '"JetBrains Mono", ui-monospace, monospace', google: "JetBrains+Mono:wght@400;600;700" },
    { id: "georgia", label: "Georgia (no download)", stack: 'Georgia, "Times New Roman", serif' },
  ];

  const DEFAULT = {
    tabs: TABS.map((t) => t.id),
    hidden: [],
    widgets: WIDGETS.map((w) => w.id),
    hiddenWidgets: ["photo"],
    palette: "indigo",
    font: "system",
    scale: 1,
    photo: "",
    photoCaption: "",
  };

  const tabById = (id) => TABS.find((t) => t.id === id) || null;
  const widgetById = (id) => WIDGETS.find((w) => w.id === id) || null;
  const paletteById = (id) => PALETTES.find((p) => p.id === id) || PALETTES[0];
  const fontById = (id) => FONTS.find((f) => f.id === id) || FONTS[0];

  const uniq = (arr, known) => arr.filter((x, i) => known.includes(x) && arr.indexOf(x) === i);

  /* Unknown ids are dropped, items added by a later update are appended rather
     than silently lost, and locked items can never end up hidden. */
  function normalize(ui) {
    const raw = ui && typeof ui === "object" ? ui : {};
    const tabIds = TABS.map((t) => t.id);
    const widgetIds = WIDGETS.map((w) => w.id);

    let tabs = Array.isArray(raw.tabs) ? uniq(raw.tabs, tabIds) : DEFAULT.tabs.slice();
    let hidden = Array.isArray(raw.hidden) ? uniq(raw.hidden, tabIds) : [];
    tabIds.forEach((id) => {
      if (!tabs.includes(id) && !hidden.includes(id)) tabs.push(id);
    });
    tabs = tabs.filter((id) => !hidden.includes(id));
    hidden = hidden.filter((id) => !tabs.includes(id) && !(tabById(id) || {}).locked);
    TABS.forEach((t) => {
      if (t.locked && !tabs.includes(t.id)) tabs.unshift(t.id);
    });

    let widgets = Array.isArray(raw.widgets) ? uniq(raw.widgets, widgetIds) : DEFAULT.widgets.slice();
    let hiddenWidgets = Array.isArray(raw.hiddenWidgets) ? uniq(raw.hiddenWidgets, widgetIds) : DEFAULT.hiddenWidgets.slice();
    widgetIds.forEach((id) => {
      if (!widgets.includes(id) && !hiddenWidgets.includes(id)) widgets.push(id);
    });
    widgets = widgets.filter((id) => !hiddenWidgets.includes(id));
    hiddenWidgets = hiddenWidgets.filter((id) => !widgets.includes(id) && !(widgetById(id) || {}).locked);
    WIDGETS.forEach((w) => {
      if (w.locked && !widgets.includes(w.id)) widgets.unshift(w.id);
    });

    return {
      tabs,
      hidden,
      widgets,
      hiddenWidgets,
      palette: paletteById(raw.palette).id,
      font: fontById(raw.font).id,
      /* 0.85–1.35 keeps the extremes readable; percentage font-size, so the
         browser's own text-size preference still counts. */
      scale: Math.min(1.35, Math.max(0.85, Number(raw.scale) || 1)),
      photo: typeof raw.photo === "string" ? raw.photo : "",
      photoCaption: typeof raw.photoCaption === "string" ? raw.photoCaption.slice(0, 160) : "",
    };
  }

  const moveItem = (list, id, dir) => {
    const i = list.indexOf(id);
    if (i < 0) return list.slice();
    const j = i + dir;
    if (j < 0 || j >= list.length) return list.slice();
    const out = list.slice();
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  };

  function applyTheme(ui) {
    const root = document.documentElement;
    const font = fontById(ui.font);
    root.dataset.palette = paletteById(ui.palette).id;
    root.style.setProperty("--font", font.stack);
    root.style.fontSize = Math.round((Number(ui.scale) || 1) * 100) + "%";
    if (font.google && !document.getElementById("gfont-" + font.id)) {
      const link = document.createElement("link");
      link.id = "gfont-" + font.id;
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=" + font.google + "&display=swap";
      document.head.appendChild(link);
    }
  }

  /* Shrunk to a small JPEG so a dashboard picture still fits in localStorage. */
  function photoFromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type || "")) return reject(new Error("Pick an image file (PNG, JPG or WebP)."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("That picture could not be read."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("That picture could not be read."));
        img.onload = () => {
          const max = 720;
          const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round((img.width || max) * scale));
          c.height = Math.max(1, Math.round((img.height || max) * scale));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          try {
            resolve(c.toDataURL("image/jpeg", 0.72));
          } catch (e) {
            reject(new Error("That picture could not be saved."));
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  return {
    TABS,
    WIDGETS,
    PALETTES,
    FONTS,
    DEFAULT,
    tabById,
    widgetById,
    paletteById,
    fontById,
    normalize,
    moveItem,
    applyTheme,
    photoFromFile,
  };
})();
