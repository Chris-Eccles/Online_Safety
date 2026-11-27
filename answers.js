// Class question answer buttons (KS4/5) and "Badge unlocked" pop-ups.
// A small panel fixed at the top left of the page (a bar along the bottom on narrower screens). When the teacher
// starts a class question in admin, the buttons light up; the answer is linked to this device's sign-in code only.
(function () {
  "use strict";
  if (!window.Abity) return;
  var me = (function () { try { return JSON.parse(localStorage.getItem("abity-me") || "null"); } catch (e) { return null; } })();
  if (!me || !me.token || !(me.year >= 10)) return;
  var SEEN = "abity-badges-seen-" + me.token.slice(0, 12), names = null, poll = null, mine = null, busy = false, timer = null;

  var css = document.createElement("style");
  css.textContent =
    ".apanel{position:fixed;left:16px;top:88px;z-index:40;width:150px;background:#fff;border:1px solid var(--line);border-top:4px solid var(--navy);border-radius:12px;padding:10px;box-shadow:0 6px 20px rgba(15,23,42,.08);font-family:var(--body)}" +
    ".apanel h2{font-family:var(--body);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 8px;font-weight:800}" +
    ".apanel .abtns{display:grid;grid-template-columns:1fr 1fr;gap:6px}" +
    ".apanel .abtns.tf{grid-template-columns:1fr}" +
    ".apanel button{font-family:var(--head);font-weight:600;font-size:1.3rem;min-height:46px;border:2px solid var(--line);background:#fff;border-radius:10px;cursor:pointer;color:var(--ink)}" +
    ".apanel .abtns.tf button{font-size:1rem}" +
    ".apanel button:disabled{cursor:default;opacity:.45}" +
    ".apanel button.picked{border-color:var(--navy);background:var(--navy);color:#fff;opacity:1}" +
    ".apanel button.right{border-color:var(--ok);background:var(--ok-soft);color:#14532d;opacity:1}" +
    ".apanel button.picked.right{background:var(--ok);color:#fff}" +
    ".apanel button.picked.wrong{border-color:var(--bad);background:var(--bad);color:#fff}" +
    ".apanel .amsg{font-size:13px;color:var(--muted);margin:8px 0 0;line-height:1.35}" +
    ".apanel.live{border-top-color:#f59e0b;box-shadow:0 0 0 3px #fde68a,0 6px 20px rgba(15,23,42,.08)}" +
    ".apanel a{display:block;font-size:13px;margin-top:8px}" +
    "@media (min-width:900px) and (max-width:1459px){body.has-apanel main{padding-left:200px}}" +
    "@media (max-width:899px){.apanel{top:auto;bottom:0;left:0;right:0;width:auto;border-radius:12px 12px 0 0;display:flex;gap:10px;align-items:center;padding:8px 12px}" +
    ".apanel h2{margin:0;flex:0 0 auto}.apanel .abtns,.apanel .abtns.tf{flex:1;grid-template-columns:repeat(4,1fr)}.apanel .abtns.tf{grid-template-columns:1fr 1fr}" +
    ".apanel button{min-height:42px}.apanel .amsg{margin:0;flex:0 1 140px}.apanel a{margin:0}body{padding-bottom:70px}}" +
    ".btoast{position:fixed;right:20px;bottom:90px;z-index:60;display:flex;gap:12px;align-items:center;background:var(--navy);color:#fff;border-radius:14px;padding:12px 16px;box-shadow:0 10px 30px rgba(15,23,42,.25);animation:bt .35s ease-out;max-width:320px}" +
    ".btoast b{display:block;font-family:var(--head);font-weight:600;font-size:1.1rem}.btoast small{opacity:.85}" +
    ".btoast .hex{flex:0 0 auto}@keyframes bt{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}" +
    "@media (prefers-reduced-motion:reduce){.btoast{animation:none}}";
  document.head.appendChild(css);

  var box = document.createElement("aside");
  box.className = "apanel"; box.setAttribute("aria-label", "Class question");
  box.innerHTML = '<h2>Class question</h2><div class="abtns" id="abtns"></div><p class="amsg" id="amsg" aria-live="polite">Waiting for your teacher</p><a href="/badges">My badges</a>';
  document.body.appendChild(box); document.body.classList.add("has-apanel");
  var btns = box.querySelector("#abtns"), msg = box.querySelector("#amsg");

  function draw() {
    var kind = poll ? poll.kind : "abcd", labels = kind === "tf" ? ["True", "False"] : ["A", "B", "C", "D"];
    btns.className = "abtns" + (kind === "tf" ? " tf" : "");
    btns.innerHTML = labels.map(function (l, i) {
      var c = [];
      if (mine === i) c.push("picked");
      if (poll && poll.correct != null) { if (poll.correct === i) c.push("right"); else if (mine === i) c.push("wrong"); }
      return '<button type="button" data-a="' + i + '" class="' + c.join(" ") + '"' + (!poll || poll.closed ? " disabled" : "") +
        ' aria-pressed="' + (mine === i) + '">' + l + '</button>';
    }).join("");
    box.classList.toggle("live", !!(poll && !poll.closed));
    msg.textContent = !poll ? "Waiting for your teacher"
      : !poll.closed ? (mine == null ? "Pick your answer" : "Answer sent. You can change it until your teacher closes it.")
      : poll.correct == null ? (mine == null ? "Closed" : "Answers closed")
      : mine == null ? "Answer: " + labels[poll.correct] : mine === poll.correct ? "Correct!" : "Not this time. Answer: " + labels[poll.correct];
  }
  btns.addEventListener("click", function (e) {
    var b = e.target.closest("[data-a]"); if (!b || !poll || poll.closed || busy) return;
    var choice = Number(b.dataset.a), prev = mine; mine = choice; draw(); busy = true;
    Abity.rpc("site_poll_answer", { p_token: me.token, p_poll: poll.id, p_choice: choice }).then(function (r) {
      if (!r || !r.ok) { mine = prev; if (r && r.closed) poll.closed = true; draw(); }
      check();
    }).catch(function () { mine = prev; draw(); msg.textContent = "Not sent: check your connection"; }).then(function () { busy = false; });
  });

  function seen() { try { return JSON.parse(localStorage.getItem(SEEN) || "null"); } catch (e) { return null; } }
  function toastBadges(ids) {
    (names ? Promise.resolve(names) : Abity.badges().then(function (r) {
      names = {}; ((r && r.badges) || []).forEach(function (b) { names[b.id] = b; }); return names;
    })).then(function (n) {
      ids.forEach(function (id, i) {
        var b = n[id]; if (!b) return;
        setTimeout(function () {
          var t = document.createElement("div"); t.className = "btoast"; t.setAttribute("role", "status");
          t.innerHTML = hex(b.glyph, true, 46) + '<div><small>Badge unlocked</small><b></b></div>';
          t.querySelector("b").textContent = b.name;
          t.addEventListener("click", function () { location.href = "/badges"; });
          document.body.appendChild(t); setTimeout(function () { t.remove(); }, 4500);
        }, i * 1200);
      });
    });
  }
  function tick() {
    return Abity.rpc("site_poll", { p_token: me.token }).then(function (r) {
      if (!r || !r.ok) return;
      var changed = JSON.stringify(r.poll) !== JSON.stringify(poll);
      poll = r.poll; if (!busy) mine = r.mine == null ? null : r.mine;
      if (changed || !btns.children.length) draw(); else if (!busy) draw();
      var s = seen(), fresh = (r.earned || []).filter(function (id) { return s && s.indexOf(id) < 0; });
      try { localStorage.setItem(SEEN, JSON.stringify(r.earned || [])); } catch (e) {}
      if (fresh.length) { names = null; toastBadges(fresh); }
    }).catch(function () {});
  }
  function check() { return tick(); }
  function loop() { clearTimeout(timer); timer = setTimeout(function () { (document.hidden ? Promise.resolve() : tick()).then(loop); }, poll && !poll.closed ? 2500 : 5000); }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });

  // Hexagon badge icon (also used by the badges page)
  function hex(glyph, on, size) {
    var g = String(glyph || ""), fs = g.length > 3 ? 13 : g.length > 2 ? 16 : 22;
    return '<svg class="hex" width="' + size + '" height="' + size + '" viewBox="0 0 60 60" aria-hidden="true">' +
      '<polygon points="30,3 54,16.5 54,43.5 30,57 6,43.5 6,16.5" fill="' + (on ? "#1E3A5F" : "#e2e8f0") + '" stroke="' + (on ? "#3B6FA8" : "#cbd5e1") + '" stroke-width="3"/>' +
      '<text x="30" y="31" text-anchor="middle" dominant-baseline="central" font-family="Fredoka,Nunito,sans-serif" font-weight="600" font-size="' + fs + '" fill="' + (on ? "#fff" : "#94a3b8") + '">' +
      g.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }) + '</text></svg>';
  }
  window.AbityPanel = { check: check, hex: hex };
  draw(); tick().then(loop);
})();
