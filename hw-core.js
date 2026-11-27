// Homework format shared by the admin page (preview) and the marking function.
// Ported unchanged from the CS Online Worker so files made with the hw-homework-builder skill still work.
const BLOOM = ["remember", "understand", "apply", "analyse", "analyze", "evaluate", "create"];
const norm = s => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
/* Quick answers ("what is this number?") are marked right or wrong here, never by the AI.
   Accepted answers are separated by "|". Spaces, case and a trailing full stop are ignored; numbers match
   in any equivalent form (0.75, .75, 3/4); a binary pattern with leading zeros or a point must match exactly. */
const splitAccepted = v => (Array.isArray(v) ? v : String(v ?? "").split("|")).map(x => String(x).trim()).filter(Boolean).slice(0, 12);
const quickNorm = s => String(s ?? "").normalize("NFKC").replace(/[\u2212\u2012\u2013\u2014]/g, "-").replace(/\s+/g, "").replace(/\.$/, "").toLowerCase();
function quickNum(s) {
  let m;
  if ((m = s.match(/^([+-]?)(\d+)\/(\d+)$/))) { const d = Number(m[3]); return d ? (m[1] === "-" ? -1 : 1) * Number(m[2]) / d : NaN; }
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
}
function quickMatch(given, accepted) {
  const g = quickNorm(given);
  if (!g) return false;
  return splitAccepted(accepted).some(a0 => {
    const a = quickNorm(a0);
    if (!a) return false;
    if (g === a) return true;
    if (/^[01]+(\.[01]+)?$/.test(a) && (a.includes(".") || /^0\d/.test(a))) return false;   // binary pattern: exact digits only
    const hex = x => x.replace(/^(0x|&h|#)/, "");
    if (/[a-f]/.test(a) && hex(g) === hex(a)) return true;
    const x = quickNum(a), y = quickNum(g);
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 1e-9;
  });
}

function parseHomework(text) {
  const lines = String(text || "").replace(/\r/g, "").replace(/\u00a0/g, " ").replace(/\t/g, "    ").split("\n");
  const hw = { title: "", spec: "", intro: "", sections: [] };
  const warnings = [];
  let section = null, q = null, fu = null, fuMode = "", blk = "", inAnswer = false, prevBlank = true, lastNum = 0, afterRule = false;

  const isRule = l => /^[─━—–\-=_*~·•.┄┈═]{3,}$/.test(l.replace(/\s/g, ""));
  const newSection = name => { section = { name: name || "", questions: [] }; hw.sections.push(section); };
  const finishQ = () => { q = null; fu = null; fuMode = ""; blk = ""; inAnswer = false; };
  const addLine = (str, line) => str + (str && !str.endsWith("\n") ? "\n" : "") + line;

  for (const raw of lines) {
    const line = raw.trim();
    if (q && blk && (blk === "starter" || blk === "candidate") && !/^(test|mark\s*scheme|answer|shown\s*scheme|examiner\s*(mark|comment)|original|follow[\s-]*up)\b[^:]{0,12}:/i.test(line)) {
      q[blk] = (q[blk] || "") + raw.replace(/^ {0,4}/, "") + "\n"; prevBlank = !line; continue;
    }
    if (!line) { prevBlank = true; if (q && blk) { q[blk] += "\n"; continue; } if (fu) { if (fuMode === "answer") fu.answer += "\n"; else fu.text += "\n"; } else if (q && !inAnswer && q.text) q.text += "\n"; else if (inAnswer && q) q.answer += "\n"; continue; }
    const afterBlank = prevBlank; prevBlank = false;
    let m;

    // Divider lines (─────, -----, =====) end the current question; the line after one is a section heading
    if (isRule(line)) { finishQ(); afterRule = true; continue; }
    const wasAfterRule = afterRule; afterRule = false;

    if (!q && (m = line.match(/^title\s*:\s*(.+)$/i))) { hw.title = m[1].trim(); continue; }
    if (!q && (m = line.match(/^spec(?:ification)?\s*:\s*(.+)$/i))) { hw.spec = m[1].trim(); continue; }
    if (!q && (m = line.match(/^(?:intro|instructions?)\s*:\s*(.+)$/i))) { hw.intro = addLine(hw.intro, m[1].trim()); continue; }

    const qMatch = line.match(/^(?:q(?:uestion)?\s*)?(\d{1,2})\s*[.):]\s*(.*)$/i);

    // Section heading: "## Apply", "Section: Apply", a lone Bloom word, or a line between dividers
    if ((m = line.match(/^#{1,3}\s*(.+)$/)) || (m = line.match(/^section\s*:\s*(.+)$/i)) ||
        (BLOOM.includes(norm(line).replace(/:$/, "")) && (m = [line, line.replace(/:$/, "")])) ||
        (wasAfterRule && !qMatch && (m = [line, line]))) {
      finishQ(); newSection(m[1].trim()); continue;
    }

    // New question: "1." "1)" "Q1." "Question 1:"
    // Inside a mark scheme, a numbered line only starts the next question if it
    // follows a blank line and is the next number (so numbered mark schemes work).
    if (qMatch && (!inAnswer || (afterBlank && Number(qMatch[1]) === lastNum + 1) || /^q/i.test(line))) {
      finishQ();
      lastNum = Number(qMatch[1]);
      if (!section) newSection("");
      q = { num: lastNum, id: "", text: qMatch[2], marks: 0, options: [], answer: "", type: "", tag: "" };
      section.questions.push(q);
      continue;
    }

    if (!q) {
      if (!hw.title) hw.title = line; else hw.intro = addLine(hw.intro, line);
      continue;
    }

    // Question type tag: "Type: quick" (marked right or wrong) or "Type: written" (AI feedback)
    if ((m = line.match(/^(?:type|marking)\s*:\s*(quick|written|code|examiner)\b/i))) { q.tag = m[1].toLowerCase(); continue; }

    // Code questions: "Starter:" (indented code) and "Test: input -> expected output" (inputs split with ;)
    // Be-the-examiner questions: "Original:", "Candidate:", "Shown scheme:", "Examiner mark:", "Examiner comment:"
    if ((m = line.match(/^starter(?:\s*code)?\s*:\s*(.*)$/i))) { blk = "starter"; inAnswer = true; q.starter = m[1] ? m[1] + "\n" : ""; continue; }
    if ((m = line.match(/^test\s*:\s*(.*?)\s*->\s*(.*)$/i))) {
      blk = ""; inAnswer = true; (q.tests = q.tests || []).push({ input: m[1].split(/\s*;\s*/).filter(x => x !== "").join("\n"), expect: m[2].trim() }); continue;
    }
    if ((m = line.match(/^original(?:\s*question)?\s*:\s*(.+)$/i))) { blk = ""; inAnswer = true; q.original = m[1]; continue; }
    if ((m = line.match(/^candidate(?:\s*answer)?\s*:\s*(.*)$/i))) { blk = "candidate"; inAnswer = true; q.candidate = m[1] ? m[1] + "\n" : ""; continue; }
    if ((m = line.match(/^shown\s*scheme\s*:\s*(.*)$/i))) { blk = "shown"; inAnswer = true; q.shown = m[1] ? m[1] + "\n" : ""; continue; }
    if ((m = line.match(/^examiner\s*mark\s*:\s*(\d{1,2})/i))) { blk = ""; inAnswer = true; q.exMark = Number(m[1]); continue; }
    if ((m = line.match(/^examiner\s*comment\s*:\s*(.*)$/i))) { blk = "exComment"; inAnswer = true; q.exComment = m[1] ? m[1] + "\n" : ""; continue; }
    if (blk && !/^(?:answer|answers|mark\s*scheme|ms|model answer)\s*:/i.test(line)) { q[blk] = (q[blk] || "") + line + "\n"; continue; }

    // Follow-up task, set after hand-in if the student drops marks on this question:
    // "Follow-up: Explain why... [2]" then "Follow-up answer: ..." (a question can have more than one)
    if ((m = line.match(/^follow[\s-]*up\s*(answer|mark\s*scheme|ms)?\s*:\s*(.*)$/i))) {
      inAnswer = true;
      if (m[1]) { if (fu) { fuMode = "answer"; fu.answer = addLine(fu.answer, m[2]); } }
      else { fu = { text: m[2], answer: "", marks: 0 }; (q.followups = q.followups || []).push(fu); fuMode = "text"; }
      continue;
    }
    if (fu) { if (fuMode === "answer") fu.answer = addLine(fu.answer, line); else fu.text = addLine(fu.text, line); continue; }

    // Answer / mark scheme
    if ((m = line.match(/^(?:answer|answers|mark\s*scheme|ms|model answer)\s*:\s*(.*)$/i))) {
      inAnswer = true; blk = ""; q.answer = addLine(q.answer, m[1]); continue;
    }
    if (inAnswer) { q.answer = addLine(q.answer, line); continue; }

    // Multiple choice option: "A) text", "A. text", "(A) text"  (capital letters only)
    if ((m = line.match(/^\(?([A-H])[).]\s+(.+)$/))) { q.options.push({ key: m[1].toUpperCase(), text: m[2].trim() }); continue; }

    q.text = addLine(q.text, line);
  }

  // Tidy each question: marks, essay label, type
  let n = 0;
  const noMarks = [], noAnswer = [];
  for (const s of hw.sections) for (const q of s.questions) {
    n++;
    q.id = "q" + n;
    q.text = q.text.replace(/\n{3,}/g, "\n\n").trim();
    q.answer = q.answer.replace(/\n{3,}/g, "\n\n").trim();

    // "[quick]" or "[written]" anywhere in the question also sets the type
    const tg = q.text.match(/\s*\[\s*(quick|written)\s*\]/i);
    if (tg) { q.tag = q.tag || tg[1].toLowerCase(); q.text = (q.text.slice(0, tg.index) + q.text.slice(tg.index + tg[0].length)).trim(); }

    // "ESSAY" label at the start of the question
    let essay = false;
    const es = q.text.match(/^essay\b\s*[:\-–—]?\s*/i);
    if (es) { essay = true; q.text = q.text.slice(es[0].length).trim(); }

    // Marks: "[3]", "[3 marks]" or "(3 marks)" anywhere
    const mk = q.text.match(/\s*\[\s*(\d{1,2})\s*(?:marks?)?\s*\]/i) || q.text.match(/\s*\(\s*(\d{1,2})\s*marks?\s*\)/i);
    if (mk) { q.marks = Number(mk[1]); q.text = (q.text.slice(0, mk.index) + q.text.slice(mk.index + mk[0].length)).trim(); }
    if (!q.marks) { q.marks = 1; noMarks.push(q.num); }

    if (q.options.length) {
      q.type = "mcq";
      const letter = (q.answer.match(/^\(?([A-H])\)?(?:[).:\s]|$)/i) || [])[1];
      if (letter) q.correct = letter.toUpperCase();
      else {
        const hit = q.options.find(o => norm(o.text) === norm(q.answer));
        if (hit) q.correct = hit.key;
        else warnings.push(`Question ${q.num}: it has options but the answer isn't a letter (e.g. "Answer: B").`);
      }
    } else if (/^(true|false)\.?$/i.test(q.answer)) {
      q.type = "tf"; q.correct = q.answer.toLowerCase().replace(".", "");
    } else if (q.tag === "quick") {
      q.type = "quick"; q.accepted = splitAccepted(q.answer);
      if (!q.accepted.length) warnings.push(`Question ${q.num} is tagged quick but has no "Answer:", so it can't be marked. Add e.g. "Answer: 0.375 | 3/8".`);
    } else if (q.tag === "written") {
      q.type = "long";
    } else if (q.tag === "code") {
      q.type = "code";
      q.starter = (q.starter || "").replace(/\s+$/, "");
      q.tests = (q.tests || []).slice(0, 8);
    } else if (q.tag === "examiner") {
      q.type = "examiner";
      const om = String(q.original || "").match(/\s*\[\s*(\d{1,2})\s*(?:marks?)?\s*\]/i);
      q.origMarks = om ? Number(om[1]) : 0;
      if (om) q.original = (q.original.slice(0, om.index) + q.original.slice(om.index + om[0].length)).trim();
      q.candidate = (q.candidate || "").replace(/\s+$/, ""); q.shown = (q.shown || "").trim(); q.exComment = (q.exComment || "").trim();
      if (!q.original || !q.candidate || !q.origMarks) warnings.push(`Question ${q.num} (be the examiner) needs "Original: question [marks]" and a "Candidate:" answer.`);
      if (q.exMark == null || q.exMark > q.origMarks) warnings.push(`Question ${q.num} (be the examiner) needs "Examiner mark: n" (0 to ${q.origMarks || "the original's marks"}).`);
      if (!q.answer) q.answer = `The examiner gave ${q.exMark}/${q.origMarks}. ${q.exComment}`;
    } else {
      // One-line box only for short 1-mark questions; anything else gets a big box
      q.type = (!essay && !noMarks.includes(q.num) && q.marks === 1 && !q.text.includes("\n")) ? "short" : "long";
    }
    if (!q.answer && q.type !== "mcq" && q.type !== "examiner") noAnswer.push(q.num);
    q.followups = (q.followups || []).map(f => {
      let t = f.text.replace(/\n{3,}/g, "\n\n").trim(), marks = 2;
      const fm = t.match(/\s*\[\s*(\d{1,2})\s*(?:marks?)?\s*\]/i);
      if (fm) { marks = Number(fm[1]); t = (t.slice(0, fm.index) + t.slice(fm.index + fm[0].length)).trim(); }
      if (!f.answer.trim()) warnings.push(`Question ${q.num}: a follow-up has no "Follow-up answer:", so the AI will mark it from its own knowledge.`);
      return { text: t, answer: f.answer.replace(/\n{3,}/g, "\n\n").trim(), marks };
    }).filter(f => f.text);
    if (!q.text) warnings.push(`Question ${q.num}: the question text is empty.`);
  }
  hw.sections = hw.sections.filter(s => s.questions.length);

  const list = a => a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : String(a[0]);
  if (noMarks.length) warnings.push(`No marks given for question${noMarks.length > 1 ? "s" : ""} ${list(noMarks)}, so ${noMarks.length > 1 ? "each counts" : "it counts"} as 1 mark. Put [3] after a question to set its marks.`);
  if (noAnswer.length) warnings.push(`No "Answer:" or "Mark scheme:" for question${noAnswer.length > 1 ? "s" : ""} ${list(noAnswer)}. The AI will mark ${noAnswer.length > 1 ? "them" : "it"} from its own knowledge, which is less reliable.`);
  if (!hw.title) warnings.push('No title found. Add a first line like "Title: Binary addition".');
  if (!n) warnings.push("No questions found. Number each question like \"1. What is…\".");
  hw.intro = hw.intro.trim();
  hw.totalMarks = hw.sections.reduce((t, s) => t + s.questions.reduce((a, q) => a + q.marks, 0), 0);
  return { homework: hw, warnings };
}

// What students may see: no answers or mark schemes.
function studentView(hw) {
  return {
    title: hw.title, spec: hw.spec, intro: hw.intro, totalMarks: hw.totalMarks,
    sections: hw.sections.map(s => ({ name: s.name,
      questions: s.questions.map(q => {
        const v = { id: q.id, num: q.num, text: q.text, marks: q.marks, type: q.type, options: q.options };
        if (q.type === "code") { v.starter = q.starter || ""; v.tests = (q.tests || []).map((t, i) => ({ name: "Check " + (i + 1), input: t.input, expect: t.expect, contains: true, ignoreCase: true })); }
        if (q.type === "examiner") { v.original = q.original; v.origMarks = q.origMarks; v.candidate = q.candidate; v.shown = q.shown; }
        return v;
      }) }))
  };
}

export { BLOOM, norm, splitAccepted, quickMatch, parseHomework, studentView };
