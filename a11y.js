/* Accessibility panel, shared by the student pages (ported from the earlier CS Online site, in MGS navy).
   Settings are saved in each student's own browser only.
   Include on a page with:  <script src="/a11y.js" defer></script> */
(function () {
  const KEY = "abity-a11y";
  const DEFAULTS = { size: 100, line: 0, letter: 0, font: "default", bg: "default", motion: false, assist: false };

  const FONTS = {
    default:  { label: "Default", css: null, url: null },
    dyslexic: { label: "OpenDyslexic", css: "'OpenDyslexic', sans-serif", url: "/fonts/opendyslexic.css" },
    lexend:   { label: "Lexend", css: "'Lexend', sans-serif", url: "/fonts/lexend.css" },
    atkinson: { label: "Atkinson Hyperlegible", css: "'Atkinson Hyperlegible', sans-serif", url: "/fonts/atkinson.css" },
    comic:    { label: "Comic Neue", css: "'Comic Neue', sans-serif", url: "/fonts/comic-neue.css" },
    verdana:  { label: "Verdana", css: "Verdana, Geneva, sans-serif", url: null },
    arial:    { label: "Arial", css: "Arial, Helvetica, sans-serif", url: null }
  };

  // Warm and pastel tints chosen from readability research (BDA guidance:
  // dark, not black, text on off-white or tinted backgrounds).
  const BGS = {
    default:   { label: "Default",       bg: null,      card: null,      ink: null,      muted: null,      line: null },
    cream:     { label: "Cream",         bg: "#FBF5E6", card: "#FFFCF3", ink: "#2A2215", muted: "#6B5F48", line: "#E8DFC8" },
    peach:     { label: "Peach",         bg: "#FCE8DA", card: "#FFF3EB", ink: "#2E1F16", muted: "#755C4C", line: "#EED3C2" },
    yellow:    { label: "Soft yellow",   bg: "#FCF6C9", card: "#FFFCE6", ink: "#2A2610", muted: "#6B6440", line: "#ECE3A6" },
    orange:    { label: "Light orange",  bg: "#FDE3C4", card: "#FFF1E0", ink: "#2E1F0E", muted: "#7A5C38", line: "#F0CFA4" },
    turquoise: { label: "Turquoise",     bg: "#D6F2EF", card: "#ECFAF8", ink: "#13302D", muted: "#4D6E6A", line: "#B5DFDA" },
    blue:      { label: "Light blue",    bg: "#DCEBF7", card: "#EEF5FC", ink: "#152636", muted: "#4E6478", line: "#BDD4E8" },
    lilac:     { label: "Lilac",         bg: "#ECE4F7", card: "#F6F1FC", ink: "#241A33", muted: "#62557A", line: "#D6C9EA" },
    grey:      { label: "Soft grey",     bg: "#EDEDED", card: "#F7F7F7", ink: "#222222", muted: "#5E5E5E", line: "#D4D4D4" },
    dark:      { label: "Dark",          bg: "#1A1B22", card: "#262833", ink: "#ECECF1", muted: "#A6A8B5", line: "#3A3D4B" },
    contrast:  { label: "High contrast", bg: "#000000", card: "#111111", ink: "#FFFFFF", muted: "#DDDDDD", line: "#777777" }
  };

  const LINES = [null, 1.8, 2.1, 2.4];               // Normal, Loose, Looser, Very loose
  const LINE_LABELS = ["Normal", "Loose", "Looser", "Very loose"];
  const LETTERS = [null, "0.03em", "0.06em", "0.1em"];
  const LETTER_LABELS = ["Normal", "Wide", "Wider", "Widest"];

  let s;
  try { s = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch (e) { s = Object.assign({}, DEFAULTS); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };

  // ---------- Styles for the button and panel ----------
  const css = document.createElement("style");
  css.textContent = `
  #a11y-btn{position:fixed;right:18px;bottom:18px;z-index:9998;width:54px;height:54px;border-radius:50%;
    border:none;background:var(--navy,#1E3A5F);color:#fff;font-size:26px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.25);
    touch-action:manipulation;display:flex;align-items:center;justify-content:center}
  #a11y-btn:focus-visible{outline:3px solid #FBBF24;outline-offset:3px}
  #a11y-back{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:9998}
  #a11y-panel{position:fixed;right:18px;bottom:84px;z-index:9999;width:340px;max-width:calc(100vw - 32px);
    max-height:calc(100vh - 110px);overflow:auto;background:#fff;color:#1F2937;border-radius:16px;
    box-shadow:0 20px 50px rgba(0,0,0,.3);padding:20px;font:16px/1.5 system-ui,sans-serif;letter-spacing:normal;word-spacing:normal}
  #a11y-panel h2{font:700 1.15rem system-ui,sans-serif;margin:0 0 4px;color:#1F2937}
  #a11y-panel .sub{color:#6B7280;font-size:.9rem;margin:0 0 14px}
  #a11y-panel .grp{margin:0 0 16px}
  #a11y-panel .lbl{font-weight:600;margin:0 0 6px;display:flex;justify-content:space-between}
  #a11y-panel .lbl span{font-weight:400;color:#6B7280}
  #a11y-panel .row{display:flex;gap:8px}
  #a11y-panel button.opt{flex:1;padding:9px 6px;border:2px solid #E5E7EB;border-radius:10px;background:#fff;color:#1F2937;
    cursor:pointer;font:600 15px system-ui,sans-serif;touch-action:manipulation}
  #a11y-panel button.opt:hover{border-color:var(--navy,#1E3A5F)}
  #a11y-panel button.opt[aria-pressed=true]{border-color:var(--navy,#1E3A5F);background:var(--navy-soft,#EDF2F8)}
  #a11y-panel .fonts{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  #a11y-panel .swatches{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
  #a11y-panel .sw{border:2px solid #D1D5DB;border-radius:10px;height:46px;cursor:pointer;font:600 11px system-ui,sans-serif;
    display:flex;align-items:flex-end;justify-content:center;padding:3px;touch-action:manipulation}
  #a11y-panel .sw[aria-pressed=true]{outline:3px solid var(--navy,#1E3A5F);outline-offset:2px}
  #a11y-panel .toggle{display:flex;align-items:center;justify-content:space-between;gap:12px}
  #a11y-panel .toggle input{width:22px;height:22px;accent-color:var(--navy,#1E3A5F)}
  #a11y-panel .foot{display:flex;gap:8px;margin-top:6px}
  #a11y-panel .foot button{flex:1;padding:11px;border-radius:10px;border:none;cursor:pointer;font:600 15px system-ui,sans-serif}
  #a11y-panel .reset{background:#F3F4F6;color:#1F2937}
  #a11y-panel .close{background:var(--navy,#1E3A5F);color:#fff}
  .a11y-hidden{display:none!important}
  @media (max-width:520px){#a11y-panel{right:16px;left:16px;width:auto}}
  @media (max-width:899px){body.has-apanel #a11y-btn{bottom:78px}body.has-apanel #a11y-panel{bottom:144px}body.has-apanel .totop{bottom:80px}}
  `;
  document.head.appendChild(css);

  const live = document.createElement("style");   // the student's chosen settings
  live.id = "a11y-live";
  document.head.appendChild(live);

  const loaded = {};
  function loadFont(k) {
    const f = FONTS[k];
    if (!f || !f.url || loaded[k]) return;
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = f.url;
    document.head.appendChild(l);
    loaded[k] = true;
  }

  // ---------- Apply settings to the page ----------
  function apply() {
    const out = [];
    const notPanel = ":not(#a11y-panel):not(#a11y-panel *)";
    document.documentElement.style.fontSize = s.size === 100 ? "" : s.size + "%";
    if (s.size !== 100) out.push(`body{font-size:${(17 * s.size) / 100}px!important}`);
    if (LINES[s.line]) out.push(`body *${notPanel}{line-height:${LINES[s.line]}!important}`);
    if (LETTERS[s.letter]) out.push(`body *${notPanel}{letter-spacing:${LETTERS[s.letter]}!important;word-spacing:0.12em!important}`);
    const f = FONTS[s.font];
    if (f && f.css) {
      loadFont(s.font);
      out.push(`body, body *${notPanel}{font-family:${f.css}!important}`);
    }
    const b = BGS[s.bg];
    if (b && b.bg) {
      out.push(`:root{--bg:${b.bg}!important;--card:${b.card}!important;--ink:${b.ink}!important;--muted:${b.muted}!important;--line:${b.line}!important}`);
      out.push(`body{background:${b.bg}!important;color:${b.ink}!important}`);
      out.push(`input,select,textarea,.card,.tile,.term,.lesson,.q,.opt,.badge,.apanel,.apanel button,.groups button,.hw-progress,.fu-res{background:${b.card}!important;color:${b.ink}!important}`);
    }
    if (s.motion) out.push(`*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}`);
    live.textContent = out.join("\n");
    // Assistive tools mode: homework pages allow pasting and text selection, and tell the teacher
    document.documentElement.classList.toggle("a11y-assist", !!s.assist);
    window.hwAssist = !!s.assist;
    try { document.dispatchEvent(new CustomEvent("a11y-change", { detail: { assist: !!s.assist } })); } catch (e) {}
  }

  // ---------- Build the panel ----------
  function build() {
    const btn = document.createElement("button");
    btn.id = "a11y-btn";
    btn.setAttribute("aria-label", "Accessibility settings");
    btn.setAttribute("aria-expanded", "false");
    btn.textContent = "♿";

    const back = document.createElement("div");
    back.id = "a11y-back"; back.className = "a11y-hidden";

    const p = document.createElement("div");
    p.id = "a11y-panel"; p.className = "a11y-hidden";
    p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Accessibility settings");
    document.body.append(back, p, btn);

    function render() {
      const pressed = c => (c ? "true" : "false");
      p.innerHTML = `
        <h2>Make it easier to read</h2>
        <p class="sub">Your choices are saved on this device.</p>

        <div class="grp"><div class="lbl">Text size <span>${s.size}%</span></div>
          <div class="row"><button class="opt" data-act="size" data-v="-10" aria-label="Smaller text">A−</button>
          <button class="opt" data-act="size" data-v="10" aria-label="Bigger text">A+</button></div></div>

        <div class="grp"><div class="lbl">Line spacing <span>${LINE_LABELS[s.line]}</span></div>
          <div class="row">${LINE_LABELS.map((l, i) => `<button class="opt" data-act="line" data-v="${i}" aria-pressed="${pressed(s.line === i)}" title="${l}">${["≡", "☰", "⁝", "⋮"][i]}</button>`).join("")}</div></div>

        <div class="grp"><div class="lbl">Letter spacing <span>${LETTER_LABELS[s.letter]}</span></div>
          <div class="row">${LETTER_LABELS.map((l, i) => `<button class="opt" data-act="letter" data-v="${i}" aria-pressed="${pressed(s.letter === i)}" title="${l}" style="letter-spacing:${LETTERS[i] || "normal"}">abc</button>`).join("")}</div></div>

        <div class="grp"><div class="lbl">Font</div>
          <div class="fonts">${Object.entries(FONTS).map(([k, f]) => `<button class="opt" data-act="font" data-v="${k}" aria-pressed="${pressed(s.font === k)}" style="${f.css ? "font-family:" + f.css.replace(/"/g, "'") : ""}">${f.label}</button>`).join("")}</div></div>

        <div class="grp"><div class="lbl">Background <span>${BGS[s.bg].label}</span></div>
          <div class="swatches">${Object.entries(BGS).map(([k, b]) => `<button class="sw" data-act="bg" data-v="${k}" aria-pressed="${pressed(s.bg === k)}" aria-label="${b.label}" title="${b.label}"
            style="background:${b.bg || "#F8F7FC"};color:${b.ink || "#1F2937"}">${k === "default" ? "Default" : "Aa"}</button>`).join("")}</div></div>

        <div class="grp toggle"><label for="a11y-motion"><strong>Reduce motion</strong><br><span style="color:#6B7280;font-size:.9rem">Turns off animations</span></label>
          <input type="checkbox" id="a11y-motion" ${s.motion ? "checked" : ""}></div>

        <div class="grp toggle"><label for="a11y-assist"><strong>Assistive tools</strong><br><span style="color:#6B7280;font-size:.9rem">For dictation or text-to-speech. Allows pasting and selecting text. Your teacher will be told it was on.</span></label>
          <input type="checkbox" id="a11y-assist" ${s.assist ? "checked" : ""}></div>

        <div class="foot"><button class="reset" data-act="reset">Reset</button><button class="close" data-act="close">Done</button></div>`;
      for (const k in FONTS) loadFont(k === "default" ? null : k);   // preview fonts on their buttons
    }

    function open() {
      render();
      p.classList.remove("a11y-hidden"); back.classList.remove("a11y-hidden");
      btn.setAttribute("aria-expanded", "true");
      const first = p.querySelector("button"); if (first) first.focus();
    }
    function close() {
      p.classList.add("a11y-hidden"); back.classList.add("a11y-hidden");
      btn.setAttribute("aria-expanded", "false"); btn.focus();
    }

    btn.onclick = () => (p.classList.contains("a11y-hidden") ? open() : close());
    back.onclick = close;
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !p.classList.contains("a11y-hidden")) close(); });

    p.addEventListener("click", e => {
      const t = e.target.closest("[data-act]"); if (!t) return;
      const act = t.dataset.act, v = t.dataset.v;
      if (act === "close") return close();
      if (act === "reset") s = Object.assign({}, DEFAULTS);
      if (act === "size") s.size = Math.min(150, Math.max(70, s.size + Number(v)));
      if (act === "line") s.line = Number(v);
      if (act === "letter") s.letter = Number(v);
      if (act === "font") s.font = v;
      if (act === "bg") s.bg = v;
      save(); apply(); render();
      const again = p.querySelector(`[data-act="${act}"][data-v="${v}"]`) || p.querySelector(`[data-act="${act}"]`);
      if (again) again.focus();
    });
    p.addEventListener("change", e => {
      if (e.target.id === "a11y-motion") { s.motion = e.target.checked; save(); apply(); }
      if (e.target.id === "a11y-assist") { s.assist = e.target.checked; save(); apply(); }
    });
  }

  apply();   // apply straight away so the page doesn't flash
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
