// CodeBox: a VS Code-style Python editor with Run, Stop, Reset, program input and optional auto-checks,
// running real Python (Pyodide) inside the student's own browser. Nothing is sent to a server.
// Ported from the CS Online worksheet editor.  Use:  CodeBox.build(textarea, starterCode, { key, lang })
(function () {
"use strict";
var css = document.createElement("style");
css.textContent = '.code{--bg:#1E1E1E;--ink:#D4D4D4;border:1px solid #333;border-radius:8px;overflow:hidden;margin-top:16px;background:var(--bg);box-shadow:0 6px 20px rgba(0,0,0,.18)}\n.code .bar{display:flex;flex-wrap:wrap;gap:10px;align-items:stretch;justify-content:space-between;background:#252526;border-bottom:1px solid #1A1A1A}\n.code .tab{display:flex;align-items:center;gap:8px;padding:10px 18px;background:var(--bg);color:#FFF;border-top:2px solid #3794FF;font:13px system-ui,sans-serif}\n.code .tab .ic{color:#9B6BDF;font:700 12px ui-monospace,Consolas,monospace}\n.code .btns{display:flex;gap:8px;flex-wrap:wrap;padding:8px 10px;align-items:center}\n.code .btns button{min-height:38px;padding:6px 16px;border-radius:6px;border:1px solid #3C3C3C;background:#333;color:#FFF;font:600 .9rem system-ui,sans-serif;cursor:pointer}\n.code .btns button:hover:not(:disabled){filter:brightness(1.15)}\n.code .btns button.run{background:#16825D;border-color:#16825D}\n.code .btns button.check{background:#0E639C;border-color:#0E639C}\n.code .btns button:disabled{opacity:.5;cursor:default}\n.code .btns button:focus-visible{outline:2px solid #fff;outline-offset:2px}\n.code .ed{display:flex;align-items:stretch;background:var(--bg);padding:14px 0}\n.code .gutter{flex:none;min-width:3.2em;padding:0 16px 0 14px;text-align:right;color:#858585;font:15px/1.65 ui-monospace,"Cascadia Code",Consolas,monospace;user-select:none;white-space:pre}\n.code .gutter .cur{color:#C6C6C6}\n.code .gutter .err{color:#F14C4C;font-weight:700}\n.code .edwrap{flex:1;min-width:0;overflow-x:auto;display:grid;padding-right:18px}\n.code .edwrap>*{grid-area:1/1;margin:0;padding:0 0 0 4px;border:0;font:15px/1.65 ui-monospace,"Cascadia Code",Consolas,monospace;tab-size:4;white-space:pre;letter-spacing:0;min-width:100%;box-sizing:border-box}\n.code .hl{color:var(--ink);pointer-events:none}\n.code .edwrap textarea{display:block;width:100%;height:auto;align-self:stretch;min-height:0;margin:0;padding:0 0 0 4px;border:0;border-radius:0;background:transparent!important;color:transparent!important;-webkit-text-fill-color:transparent;caret-color:#AEAFAD;overflow:hidden;resize:none;outline:none;box-shadow:none;font:15px/1.65 ui-monospace,"Cascadia Code",Consolas,monospace}\n.code .edwrap textarea::selection{background:rgba(58,110,170,.45);-webkit-text-fill-color:transparent}\n.code .ed:focus-within{box-shadow:inset 3px 0 0 #3794FF}\n.code .hl .curline{background:#2A2D2E}\n.code .errline{background:rgba(241,76,76,.12);box-shadow:inset 2px 0 #F14C4C}\n.tk-kw{color:#569CD6}.tk-ctl{color:#C586C0}.tk-type{color:#4EC9B0}.tk-fn{color:#DCDCAA}.tk-str{color:#CE9178}.tk-num{color:#B5CEA8}.tk-com{color:#6A9955;font-style:normal}.tk-var{color:#9CDCFE}.tk-pre{color:#9B9B9B}\n.code details{border-top:1px solid #333;color:#CCC;background:#252526}\n.code summary{cursor:pointer;padding:10px 16px;font:600 .85rem system-ui,sans-serif}\n.code details textarea{min-height:70px;margin:0;background:#1E1E1E;color:#D4D4D4;border:0;border-top:1px solid #333;border-radius:0;font:15px/1.6 ui-monospace,Consolas,monospace;padding:10px 16px;white-space:pre;resize:vertical}\n.code .termbar{display:flex;gap:18px;padding:8px 16px 0;background:#181818;border-top:1px solid #333;font:600 11px system-ui,sans-serif;color:#E7E7E7}\n.code .termbar span{padding-bottom:6px;border-bottom:1px solid #E7E7E7}\n.code .console{margin:0;padding:12px 16px 16px;min-height:120px;max-height:380px;overflow:auto;background:#181818;color:#CCC;font:14px/1.6 ui-monospace,"Cascadia Code",Consolas,monospace;white-space:pre-wrap;word-break:break-word;user-select:text}\n.code .console .sys{color:#8B8B8B}\n.code .console .bad{color:#F48771}\n.code .console .ok{color:#89D185}\n.code .console a{color:#F48771;cursor:pointer;font-weight:700}\n.code .tests{padding:12px 16px;background:#181818;border-top:1px solid #2B2B2B;color:#CCC;font-size:.95rem}\n.code .tests div{margin:6px 0}\n.code .tests .pass{color:#89D185}.code .tests .fail{color:#F48771}\n.code .tests pre{margin:6px 0 10px 22px;padding:8px 12px;background:#1E1E1E;border:1px solid #333;border-radius:6px;color:#D4D4D4;font:13px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap}\n.code .hint{padding:8px 16px;background:#007ACC;color:#fff;font:12px system-ui,sans-serif;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}\n.ws-q:has(.code){padding:24px 26px}\n.ws-stretch:has(.code) .code{margin-bottom:6px}';
document.head.appendChild(css);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
let KEY = "abity";
const LANGS = {
  cs:   { name: "C#",     file: "Program.cs", icon: "C#", iconColor: "#9B6BDF", foot: "C# · .NET",     input: "Console.ReadLine", comment: "//" },
  py:   { name: "Python", file: "main.py",    icon: "PY", iconColor: "#F2C94C", foot: "Python 3",      input: "input()",          comment: "#" },
  vb:   { name: "VB.NET", file: "Program.vb", icon: "VB", iconColor: "#5B9BF0", foot: "VB.NET · .NET", input: "Console.ReadLine", comment: "'" },
  java: { name: "Java",   file: "Main.java",  icon: "JV", iconColor: "#F0883E", foot: "Java 23",       input: "Scanner",          comment: "//" }
};
let LANG = "cs";
const SKELETON = {
  cs: "using System;\n\nclass Program\n{\n    static void Main(string[] args)\n    {\n        \n    }\n}",
  py: "",
  vb: "Module Program\n    Sub Main()\n        \n    End Sub\nEnd Module",
  java: "import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        \n    }\n}"
};

/* ---------- Syntax colouring (VS Code Dark+ colours) ---------- */
const words = s => new Set(s.split(" "));
const SYNTAX = {
  cs: {
    kw: words("abstract as base bool byte char checked class const decimal default delegate double enum event explicit extern false fixed float implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref sbyte sealed short sizeof stackalloc static string struct this true typeof uint ulong unchecked unsafe ushort using virtual void volatile var dynamic async await get set nameof record init"),
    ctl: words("if else for foreach while do switch case break continue return try catch finally throw yield goto when"),
    tok: /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|(\$?@"(?:[^"]|"")*"?|@?\$?"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(\b0[xXbB][\da-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[fFdDmMlLuU]*\b)|(^[ \t]*#[a-z]+[^\n]*)|([A-Za-z_][A-Za-z0-9_]*)/gm,
    typeAfter: /^(class|struct|enum|interface|new|record)$/
  },
  java: {
    kw: words("abstract assert boolean byte char class const default double enum extends final float implements import instanceof int interface long native new package private protected public short static strictfp super synchronized this throws transient void volatile var true false null record"),
    ctl: words("if else for while do switch case break continue return try catch finally throw yield"),
    tok: /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("""[\s\S]*?(?:"""|$)|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(\b0[xXbB][\da-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[fFdDlL]?\b)|(@[A-Za-z_]\w*)|([A-Za-z_$][A-Za-z0-9_$]*)/gm,
    typeAfter: /^(class|enum|interface|new|extends|implements|record)$/
  },
  py: {
    kw: words("False None True and as assert async await class def del from global import in is lambda nonlocal not or pass with"),
    ctl: words("if elif else for while break continue return try except finally raise yield match case"),
    builtins: words("print input int str float len range list dict set tuple open abs min max sum round sorted reversed enumerate zip type isinstance bool chr ord bin hex oct map filter any all format super"),
    tok: /(#[^\n]*)|((?:\b[rRbBuUfF]{1,2})?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?))|(\b0[xXbBoO][\da-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?j?\b)|(^[ \t]*@[\w.]+)|([A-Za-z_][A-Za-z0-9_]*)/gm,
    typeAfter: /^(class)$/
  },
  vb: {
    kw: words("dim as integer string boolean double single long decimal char date object byte short new sub function end module class structure public private protected friend shared static const readonly property get set return nothing true false and or not andalso orelse xor mod is isnot of byval byref optional imports inherits implements overrides overridable mustinherit notinheritable me mybase handles event raiseevent call redim preserve erase enum interface namespace using with like typeof gettype cint cstr cdbl cbool cchar cdate cdec clng csng ctype directcast trycast"),
    ctl: words("if then else elseif for each to step next while wend do loop until select case exit continue try catch finally throw goto when"),
    tok: /('[^\n]*|\bREM\b[^\n]*)|("(?:[^"\n]|"")*"?c?)|(&[HhOoBb][\dA-Fa-f_]+|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[DFRISL]?\b)|(^[ \t]*#\w+[^\n]*)|([A-Za-z_][A-Za-z0-9_]*)/gmi,
    typeAfter: /^(class|structure|module|new|as|inherits|enum|interface|of)$/i,
    caseless: true
  }
};
function highlightTokens(code, lang){
  const S = SYNTAX[lang] || SYNTAX.cs, re = new RegExp(S.tok.source, S.tok.flags);
  const out = []; let last = 0, m, prevWord = "";
  while ((m = re.exec(code))){
    if (m.index > last) out.push([null, code.slice(last, m.index)]);
    let cls = null;
    if (m[1]) cls = "tk-com";
    else if (m[2]) cls = "tk-str";
    else if (m[3]) cls = "tk-num";
    else if (m[4]) cls = "tk-pre";
    else {
      const w = m[5], k = S.caseless ? w.toLowerCase() : w;
      const after = code.slice(re.lastIndex).match(/^[ \t]*(\S)/);
      const next = after ? after[1] : "";
      if (S.kw.has(k)) cls = "tk-kw";
      else if (S.ctl.has(k)) cls = "tk-ctl";
      else if (S.builtins && S.builtins.has(k) && next === "(") cls = "tk-fn";
      else if (S.typeAfter.test(prevWord)) cls = "tk-type";
      else if (next === "(") cls = "tk-fn";
      else if (/^[A-Z]/.test(w) && lang !== "vb") cls = "tk-type";
      else cls = "tk-var";
      prevWord = w;
    }
    out.push([cls, m[0]]); last = re.lastIndex;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < code.length) out.push([null, code.slice(last)]);
  return out;
}
function highlightLines(code, lang){
  const lines = [[]];
  for (const [cls, text] of highlightTokens(code, lang)){
    const parts = text.split("\n");
    parts.forEach((p, i) => { if (i) lines.push([]); if (p) lines[lines.length - 1].push([cls, p]); });
  }
  return lines;
}
function highlightBlock(pre, lang){
  const code = pre.textContent; pre.textContent = "";
  for (const [cls, text] of highlightTokens(code, lang)) pre.append(cls ? el("span", cls, text) : document.createTextNode(text));
}
// Remove comments and the insides of strings, so "must use" checks only look at real code
function stripComments(code, lang){
  if (lang === "py") return code.replace(/("""[\s\S]*?"""|'''[\s\S]*?''')/g, '""').replace(/#.*$/gm, "").replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
  if (lang === "vb") return code.replace(/"(?:[^"\n]|"")*"/g, '""').replace(/('|\bREM\b).*$/gmi, "");
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}
// A check's "mustUse" can be one pattern, or one per language: {"cs":"…","py":"…","vb":"…","java":"…"}
function mustUseFor(t, lang){
  if (typeof t.mustUse === "string") return t.mustUse;
  if (t.mustUse && typeof t.mustUse === "object") return t.mustUse[lang] || null;
  return null;
}
const pick = (v, lang) => (v && typeof v === "object") ? (v[lang] != null ? v[lang] : v.cs) : v;
const codeRefresh = [];
const codeStatus = {};
let runLoad = null;
function loadRunner(){
  if (runLoad) return runLoad;
  runLoad = new Promise((res, rej) => {
    const sc = document.createElement("script"); sc.src = "/run/coderun.js";
    sc.onload = () => res(window.CodeRun);
    sc.onerror = () => { runLoad = null; rej(new Error("Couldn't load the code runner.")); };
    document.head.append(sc);
  });
  return runLoad;
}
function parseTests(raw){
  try { const t = JSON.parse(raw || "[]"); return Array.isArray(t) ? t.filter(x => x && typeof x === "object").slice(0, 12) : []; } catch(e){ return []; }
}
const normOut = (s, ic) => { let t = String(s || "").replace(/\r/g, "").split("\n").map(l => l.replace(/\s+$/, "")).join("\n").replace(/\n+$/, ""); return ic ? t.toLowerCase() : t; };
const codeKey = f => (f.dataset.widget === "code") ? f.name + "@" + LANG : f.name;   // code is saved separately for each language

function buildCode(ta, starter){
  const name = ta.name;
  const lang = ta.dataset.widget === "csharp" ? "cs" : LANG;
  const L = LANGS[lang];
  ta.dataset.lang = lang;
  const tests = parseTests(ta.getAttribute("data-tests"));
  ta.removeAttribute("rows"); ta.spellcheck = false; ta.setAttribute("autocapitalize", "off"); ta.setAttribute("autocomplete", "off"); ta.setAttribute("autocorrect", "off");
  ta.maxLength = 2600; ta.wrap = "off";
  ta.setAttribute("aria-label", (ta.getAttribute("data-label") || "Code") + ` (${L.name} code editor)`);

  const box = el("div", "code");
  const bar = el("div", "bar");
  const tab = el("div", "tab"); const ic = el("span", "ic", L.icon); ic.style.color = L.iconColor; tab.append(ic, document.createTextNode(L.file));
  bar.append(tab);
  const btns = el("div", "btns");
  const runB = el("button", "run", "▶ Run"); runB.type = "button";
  const chkB = el("button", "check", "✓ Check my code"); chkB.type = "button";
  const stopB = el("button", null, "■ Stop"); stopB.type = "button"; stopB.hidden = true;
  const resetB = el("button", null, "↺ Reset"); resetB.type = "button"; resetB.title = "Put the starting code back";
  btns.append(runB); if (tests.length) btns.append(chkB); btns.append(stopB, resetB);
  bar.append(btns);

  const ed = el("div", "ed");
  const gut = el("div", "gutter"); gut.setAttribute("aria-hidden", "true");
  const wrap = el("div", "edwrap");
  const hl = el("pre", "hl"); hl.setAttribute("aria-hidden", "true");
  ta.replaceWith(box);
  wrap.append(hl, ta);
  ed.append(gut, wrap);

  const inDet = el("details"); const sum = el("summary", null, `Program input (for ${L.input}, one line each)`);
  const inTa = el("textarea"); inTa.setAttribute("aria-label", "Program input, one line each time the program reads input"); inTa.spellcheck = false; inTa.maxLength = 2000;
  inDet.append(sum, inTa);
  const termbar = el("div", "termbar"); termbar.append(el("span", null, "Output"));
  const cons = el("pre", "console"); cons.setAttribute("aria-live", "polite"); cons.setAttribute("aria-label", "Program output");
  cons.append(el("span", "sys", "Press ▶ Run to compile and run your program."));
  const res = el("div", "tests"); res.hidden = true;
  const hint = el("div", "hint"); hint.append(el("span", null, L.foot), el("span", null, "Tab indents · Ctrl+Enter runs · Saves as you type"));
  box.append(bar, ed, inDet, termbar, cons, res, hint);
  if (/ReadLine|input\(|Scanner/.test(starter) || tests.some(t => t.input)) inDet.open = true;

  const MIN_LINES = 16;
  let errLines = new Set(), lineEls = [], gutEls = [], curLine = 0;
  const caretLine = () => ta.value.slice(0, ta.selectionStart).split("\n").length;
  const markCurrent = () => {
    const n = document.activeElement === ta ? caretLine() : 0;
    if (n === curLine) return;
    [lineEls[curLine - 1], gutEls[curLine - 1]].forEach(x => x && x.classList.remove("cur", "curline"));
    curLine = n;
    if (lineEls[n - 1]) lineEls[n - 1].classList.add("curline");
    if (gutEls[n - 1]) gutEls[n - 1].classList.add("cur");
  };
  const refresh = () => {
    const lines = highlightLines(ta.value, lang);
    const n = Math.max(lines.length, MIN_LINES);
    hl.textContent = ""; gut.textContent = ""; lineEls = []; gutEls = [];
    for (let i = 0; i < n; i++){
      const d = el("div", errLines.has(i + 1) ? "errline" : null);
      (lines[i] || []).forEach(([cls, text]) => d.append(cls ? el("span", cls, text) : document.createTextNode(text)));
      if (!d.childNodes.length) d.textContent = " ";
      hl.append(d); lineEls.push(d);
      const g = el("div", errLines.has(i + 1) ? "err" : null, i < lines.length ? String(i + 1) : " ");
      gut.append(g); gutEls.push(g);
    }
    curLine = 0; markCurrent();
  };
  codeRefresh.push(refresh);
  ta.addEventListener("input", () => { if (errLines.size){ errLines = new Set(); } refresh(); });
  ["keyup", "click", "focus", "blur", "select"].forEach(t => ta.addEventListener(t, () => setTimeout(markCurrent)));

  // Does this line open a block, so the next line should be indented?
  const VB_OPEN = /^(?:(?:public|private|friend|protected|shared|overrides|overridable|static)\s+)*(?:sub|function|module|class|structure|property|enum|interface|namespace|try|catch|finally|do|while|for|select\s+case|case|else|elseif|using|with|get|set)\b/i;
  const opensBlock = prev => {
    if (lang === "py") return /:\s*(#.*)?$/.test(prev);
    if (lang === "vb"){
      const t = prev.trim().replace(/'.*$/, "").trim();
      if (/^(end|next|loop|wend|exit)\b/i.test(t)) return false;
      if (/^(else\s*)?if\b.*\bthen$/i.test(t)) return true;               // block If (not a one-line If … Then x)
      if (/^(else\s*)?if\b/i.test(t)) return false;
      return VB_OPEN.test(t);
    }
    return /[{(]$/.test(prev);
  };
  // Editor keys: Tab indents, Enter keeps indentation, } un-indents, Ctrl+Enter runs
  ta.addEventListener("keydown", e => {
    if (ta.disabled) return;
    const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
    const put = (text, from, to, caretA, caretB) => {
      ta.setSelectionRange(from, to);
      if (!document.execCommand || !document.execCommand("insertText", false, text)) { ta.setRangeText(text, from, to, "end"); }
      if (caretA != null) ta.setSelectionRange(caretA, caretB != null ? caretB : caretA);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    };
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter"){ e.preventDefault(); runB.click(); return; }
    if (e.key === "Escape"){ ta.blur(); return; }       // keyboard users can always leave the editor
    if (e.key === "Tab"){
      e.preventDefault();
      const ls = v.lastIndexOf("\n", a - 1) + 1;
      if (a === b && !e.shiftKey){ put("    ", a, b); return; }
      const le = v.indexOf("\n", b - (b > a && v[b - 1] === "\n" ? 1 : 0)); const end = le < 0 ? v.length : le;
      const block = v.slice(ls, end);
      const lines = block.split("\n").map(l => e.shiftKey ? l.replace(/^ {1,4}|^\t/, "") : "    " + l).join("\n");
      put(lines, ls, end, ls, ls + lines.length);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey){
      e.preventDefault();
      const ls = v.lastIndexOf("\n", a - 1) + 1;
      const indent = (/^[ \t]*/.exec(v.slice(ls, a)) || [""])[0];
      const prev = v.slice(ls, a).trimEnd();
      const extra = opensBlock(prev) ? "    " : "";
      if ((lang === "cs" || lang === "java") && prev.endsWith("{") && v[b] === "}"){ put("\n" + indent + extra + "\n" + indent, a, b, a + 1 + indent.length + extra.length); return; }
      put("\n" + indent + extra, a, b);
      return;
    }
    if (e.key === "}" && a === b && (lang === "cs" || lang === "java")){
      const ls = v.lastIndexOf("\n", a - 1) + 1;
      if (/^[ \t]+$/.test(v.slice(ls, a)) && a - ls >= 4){ e.preventDefault(); put("}", a - 4, a); }
    }
  });

  const setBusy = busy => { runB.disabled = busy; chkB.disabled = busy; resetB.disabled = busy; stopB.hidden = !busy; };
  const line = (cls, text) => { cons.append(el("span", cls, text)); };
  const gotoLine = n => {
    const lines = ta.value.split("\n"); let pos = 0; for (let i = 0; i < n - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    ta.focus(); ta.setSelectionRange(pos, pos + (lines[n - 1] || "").length);
  };
  const showErrors = r => {
    errLines = new Set(r.errors.map(x => x.line).filter(Boolean)); refresh();
    line("bad", r.errors.length === 1 ? "Your code has 1 error, so it didn't run:\n" : `Your code has ${r.errors.length} errors, so it didn't run:\n`);
    r.errors.slice(0, 8).forEach(x => {
      if (x.line){ const a = el("a", null, "Line " + x.line); a.tabIndex = 0; a.onclick = () => gotoLine(x.line); a.onkeydown = ev => { if (ev.key === "Enter") gotoLine(x.line); }; cons.append(a); cons.append(document.createTextNode(": ")); }
      cons.append(el("span", "bad", x.message + (x.id && String(x.message).indexOf(x.id) !== 0 ? "  (" + x.id + ")" : "") + "\n"));
    });
  };
  async function ensure(){
    cons.textContent = "";
    let run;
    try { run = await loadRunner(); } catch(e){ line("bad", "Couldn't load the code runner. Check you're online and refresh the page."); return null; }
    if (run.state(lang) !== "ready"){
      line("sys", `Starting ${L.name}… (the first run takes a few seconds while it downloads)\n`);
      try { await run.boot(lang); } catch(e){ line("bad", `${L.name} couldn't start on this device. Try an up-to-date Chrome, Edge or Safari, and refresh the page.`); return null; }
      cons.textContent = "";
    }
    return run;
  }

  runB.onclick = async () => {
    setBusy(true); res.hidden = true;
    try {
      const run = await ensure(); if (!run) return;
      line("sys", "Running…\n");
      const r = await run.run(lang, ta.value, inTa.value);
      cons.textContent = "";
      if (r.errors && r.errors.length){ showErrors(r); return; }
      errLines = new Set(); refresh();
      if (r.output) line(null, r.output);
      if (r.runtimeError) line("bad", (r.output && !r.output.endsWith("\n") ? "\n" : "") + r.runtimeError + "\n");
      else if (!r.output) line("sys", "(Your program ran but didn't print anything.)\n");
      else line("sys", "\n✓ Finished");
    } finally { setBusy(false); }
  };
  stopB.onclick = () => { if (window.CodeRun) window.CodeRun.stop(lang); };
  resetB.onclick = () => {
    if (ta.disabled) return;
    if (ta.value.trim() !== starter.trim() && !confirm("Put the starting code back? Your changes in this box will be lost.")) return;
    ta.value = starter; ta.dispatchEvent(new Event("input", { bubbles: true })); cons.textContent = ""; line("sys", "Starting code restored."); res.hidden = true;
  };
  const statusKey = "ws-code-" + KEY + "-" + name + "@" + lang;
  chkB.onclick = async () => {
    setBusy(true); res.hidden = true; res.textContent = "";
    try {
      const run = await ensure(); if (!run) return;
      line("sys", "Checking…\n");
      let passed = 0, compiled = true;
      const rows = [];
      for (const t of tests){
        const label = String(pick(t.name, lang) || "Test");
        if (t.mustUse){
          const pat = mustUseFor(t, lang);
          let ok = true;
          if (pat){ ok = false; try { ok = new RegExp(pat, lang === "vb" ? "i" : "").test(stripComments(ta.value, lang)); } catch(e){} }
          rows.push({ ok, label, why: ok ? "" : String(pick(t.hint, lang) || "") });
          if (ok) passed++;
          continue;
        }
        const r = await run.run(lang, ta.value, t.input || "");
        if (r.errors && r.errors.length){ compiled = false; cons.textContent = ""; showErrors(r); break; }
        const want = pick(t.expect, lang);
        const got = normOut(r.output, t.ignoreCase), wantN = normOut(want, t.ignoreCase);
        const ok = !r.runtimeError && (t.contains ? got.includes(wantN) : got === wantN);
        rows.push({ ok, label, input: t.input, want, got: r.output, err: r.runtimeError, why: String(pick(t.hint, lang) || "") });
        if (ok) passed++;
      }
      if (!compiled){ codeStatus[name] = "The code did not compile when the checks were run."; return; }
      cons.textContent = "";
      line(passed === tests.length ? "ok" : "bad", passed === tests.length ? `All ${tests.length} checks passed. Nice work!\n` : `${passed} of ${tests.length} checks passed.\n`);
      rows.forEach(x => {
        const d = el("div", x.ok ? "pass" : "fail", (x.ok ? "✓ " : "✗ ") + x.label);
        res.append(d);
        if (!x.ok){
          if (x.err) res.append(el("pre", null, x.err));
          else if (x.want != null){
            res.append(el("pre", null, (x.input ? "Input:\n" + x.input.replace(/\n$/, "") + "\n\n" : "") + "Expected output:\n" + String(x.want).replace(/\n$/, "") + "\n\nYour output:\n" + (String(x.got || "").replace(/\n$/, "") || "(nothing)")));
          }
          if (x.why) res.append(el("pre", null, "Hint: " + x.why));
        }
      });
      res.hidden = false;
      codeStatus[name] = `${passed}/${tests.length} checks passed` + (passed < tests.length ? " (failed: " + rows.filter(x => !x.ok).map(x => x.label).join("; ") + ")" : "") + ".";
      try { store.set(statusKey, codeStatus[name] + "\u0001" + ta.value); } catch(e){}
    } finally { setBusy(false); }
  };
  // Remember the last check result, as long as the code hasn't changed since
  try {
    const saved = store.get(statusKey);
    if (saved){ const i = saved.indexOf("\u0001"); codeStatus.__pending = codeStatus.__pending || {}; codeStatus.__pending[name] = [saved.slice(0, i), saved.slice(i + 1)]; }
  } catch(e){}
  codeRefresh.push(() => {
    const p = codeStatus.__pending && codeStatus.__pending[name];
    if (p && p[1] === ta.value) codeStatus[name] = p[0];
  });
  ta.addEventListener("input", () => { delete codeStatus[name]; });
}

window.CodeBox = {
  build: function (ta, starter, opts) { opts = opts || {}; if (opts.key) KEY = opts.key; LANG = opts.lang || "py"; buildCode(ta, starter || ""); codeRefresh.forEach(f => f()); },
  status: function (name) { return codeStatus[name] || ""; },
  refresh: function () { codeRefresh.forEach(f => f()); }
};
})();
