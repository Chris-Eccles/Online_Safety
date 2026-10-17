/* Shared code for the chat pages: talking to the server, password boxes, pictures, and the chat itself. */
(function(){
  var API = "https://gnxgefgjsgtqgclyvblh.supabase.co/functions/v1/chat-api";

  async function api(path, body, headers){
    var opts = { method: body ? "POST" : "GET", headers: Object.assign({}, headers || {}) };
    if (body){ opts.headers["content-type"] = "application/json"; opts.body = JSON.stringify(body); }
    try {
      var res = await fetch(API + path, opts);
      var data = await res.json().catch(function(){ return {}; });
      return { ok: res.ok, status: res.status, data: data };
    } catch (e) {
      return { ok: false, status: 0, data: { error: "Couldn't reach the server. Check your connection." } };
    }
  }

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function linkify(s){
    return esc(s).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)"'\]]/g, function(u){ return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + "</a>"; });
  }
  function toast(msg){
    var t = document.createElement("div"); t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
    document.body.appendChild(t); setTimeout(function(){ t.remove(); }, 2600);
  }

  /* ---------- password boxes the browser won't offer to save ----------
     They are ordinary text boxes (browsers only offer to save "password" boxes), drawn as dots.
     Where a browser can't draw a text box as dots, the dots are drawn by hand and the real text is kept here. */
  var nativeDots = window.CSS && CSS.supports && CSS.supports("-webkit-text-security", "disc");
  function secretBox(el){
    el.type = "text";
    el.classList.add("secret");
    ["autocomplete", "off", "autocapitalize", "off", "autocorrect", "off", "spellcheck", "false",
     "data-lpignore", "true", "data-1p-ignore", "true", "data-bwignore", "true", "data-form-type", "other"]
      .forEach(function(v, i, a){ if (i % 2 === 0) el.setAttribute(v, a[i + 1]); });
    el.name = "f" + Math.random().toString(36).slice(2);
    el._real = "";
    if (nativeDots) return;
    el.addEventListener("beforeinput", function(e){
      var s = el.selectionStart, f = el.selectionEnd, r = el._real, add = "";
      if (e.inputType.indexOf("insert") === 0){
        add = e.data != null ? e.data : (e.dataTransfer ? e.dataTransfer.getData("text") : "");
        if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") return;
        r = r.slice(0, s) + add + r.slice(f);
      } else if (e.inputType === "deleteContentBackward"){
        if (s === f && s > 0) s--; r = r.slice(0, s) + r.slice(f);
      } else if (e.inputType === "deleteContentForward"){
        if (s === f) f++; r = r.slice(0, s) + r.slice(f);
      } else if (e.inputType.indexOf("delete") === 0){
        if (s === f) { r = ""; s = 0; } else r = r.slice(0, s) + r.slice(f);
      } else return;
      e.preventDefault();
      el._real = r; el.value = "•".repeat(r.length);
      var c = s + add.length; el.setSelectionRange(c, c);
    });
  }
  function secretValue(el){ return nativeDots ? el.value : el._real; }
  function clearSecret(el){ el.value = ""; el._real = ""; }

  /* ---------- pictures ---------- */
  function loadImage(file){
    return new Promise(function(ok, bad){
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){ ok({ img: img, url: url }); };
      img.onerror = function(){ URL.revokeObjectURL(url); bad(new Error("That file isn't a picture this browser can open.")); };
      img.src = url;
    });
  }
  // Shrinks a photo to at most 1600px on its longest side and saves it as a JPEG (GIFs are sent as they are, to keep them moving)
  async function preparePicture(file){
    var l = await loadImage(file), w = l.img.naturalWidth, h = l.img.naturalHeight;
    if (file.type === "image/gif" && file.size < 8e6){ return { blob: file, type: "image/gif", w: w, h: h, preview: l.url }; }
    var k = Math.min(1, 1600 / Math.max(w, h)), cw = Math.round(w * k), ch = Math.round(h * k);
    var c = document.createElement("canvas"); c.width = cw; c.height = ch;
    var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cw, ch); g.drawImage(l.img, 0, 0, cw, ch);
    var blob = await new Promise(function(r){ c.toBlob(r, "image/jpeg", 0.82); });
    if (!blob) throw new Error("Couldn't prepare that picture.");
    return { blob: blob, type: "image/jpeg", w: cw, h: ch, preview: l.url };
  }
  function putFile(url, blob){
    return new Promise(function(resolve, reject){
      var fd = new FormData(); fd.append("cacheControl", "3600"); fd.append("", blob);
      var x = new XMLHttpRequest(); x.open("PUT", url); x.setRequestHeader("x-upsert", "false");
      x.onload = function(){ x.status >= 200 && x.status < 300 ? resolve() : reject(new Error("The picture didn't upload. Try again.")); };
      x.onerror = function(){ reject(new Error("The picture didn't upload. Check your connection.")); };
      x.send(fd);
    });
  }
  function viewer(src){
    var v = document.createElement("div"); v.className = "viewer"; v.setAttribute("role", "dialog"); v.setAttribute("aria-label", "Picture");
    v.innerHTML = '<img alt=""><button class="icon" type="button" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
    v.querySelector("img").src = src;
    function close(){ v.remove(); document.removeEventListener("keydown", key); }
    function key(e){ if (e.key === "Escape") close(); }
    v.onclick = close; document.addEventListener("keydown", key);
    document.body.appendChild(v); v.querySelector("button").focus();
  }

  /* ---------- times ---------- */
  function dayLabel(d){
    var now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return "Today";
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    var opts = { weekday: "short", day: "numeric", month: "short" };
    if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
    return d.toLocaleDateString("en-GB", opts);
  }
  function clock(d){ return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
  function ago(iso){
    if (!iso) return "";
    var s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 90) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    var d = new Date(iso);
    return (dayLabel(d) === "Today" ? "today" : dayLabel(d)) + " at " + clock(d);
  }

  /* ---------- the chat itself ----------
     opts: feed, input, sendBtn, photoBtn, fileInput, attachBox,
           mine ("guest" or "owner"), load(query) → api result, send(payload), uploadUrl(type),
           canDelete, remove(id), onInfo(data), onSignedOut() */
  function Room(opts){
    var msgs = [], seenId = 0, more = false, timer = null, stopped = false, picked = null, tmp = 0, polling = false;
    var feed = opts.feed;

    function lastRealId(){ for (var i = msgs.length - 1; i >= 0; i--) if (typeof msgs[i].id === "number") return msgs[i].id; return 0; }
    function nearBottom(){ return feed.scrollHeight - feed.scrollTop - feed.clientHeight < 120; }
    function toBottom(){ feed.scrollTop = feed.scrollHeight; }
    function merge(list){
      var have = {}; msgs.forEach(function(m){ have[m.id] = true; });
      list.forEach(function(m){ if (!have[m.id]) { msgs.push(m); have[m.id] = true; } });
      msgs.sort(function(a, b){
        var ta = typeof a.id === "number", tb = typeof b.id === "number";
        if (ta && tb) return a.id - b.id; if (ta) return -1; if (tb) return 1; return a.n - b.n;
      });
    }
    function render(){
      if (!msgs.length){ feed.innerHTML = '<p class="empty">No messages yet. Say hello 👋</p>'; return; }
      var html = more ? '<button class="btn ghost small more" type="button" data-more>Show earlier messages</button>' : "";
      var lastDay = "", lastFrom = "", lastAt = 0, lastMine = null;
      msgs.forEach(function(m){ if (m.from === opts.mine) lastMine = m; });
      msgs.forEach(function(m){
        var d = new Date(m.at), day = d.toDateString();
        if (day !== lastDay){ html += '<div class="day">' + esc(dayLabel(d)) + "</div>"; lastDay = day; lastFrom = ""; }
        var mine = m.from === opts.mine, gap = m.from !== lastFrom || d - lastAt > 10 * 6e4;
        var cls = "msg " + (mine ? "mine" : "theirs") + (gap ? " gap" : "") + (m.sending ? " sending" : "") + (m.failed ? " failed" : "") + (picked === m.id ? " pick" : "");
        html += '<div class="' + cls + '" data-id="' + esc(m.id) + '">';
        if (opts.canDelete && typeof m.id === "number") html += '<button class="del" type="button" data-del="' + m.id + '" aria-label="Delete message" title="Delete message">✕</button>';
        if (m.image) {
          var ratio = m.image.w && m.image.h ? ' style="aspect-ratio:' + m.image.w + "/" + m.image.h + '"' : "";
          html += '<button class="pic" type="button" data-view="' + esc(m.image.url || m.image.local || "") + '"' + ratio + '><img alt="Picture" loading="lazy" src="' + esc(m.image.url || m.image.local || "") + '"></button>';
        }
        if (m.text) html += '<div class="bubble">' + linkify(m.text) + "</div>";
        var next = msgs[msgs.indexOf(m) + 1];
        var endOfRun = !next || next.from !== m.from || new Date(next.at) - d > 10 * 6e4 || new Date(next.at).toDateString() !== day;
        if (m.failed) html += '<div class="stamp">Not sent · <button class="btn ghost small" type="button" data-retry="' + esc(m.id) + '">Try again</button></div>';
        else if (m.sending) html += '<div class="stamp">Sending…</div>';
        else if (endOfRun) html += '<div class="stamp">' + clock(d) + "</div>";
        html += "</div>";
        if (m === lastMine && typeof m.id === "number" && m.id <= seenId) html += '<div class="seen">Seen</div>';
        lastFrom = m.from; lastAt = d;
      });
      feed.innerHTML = html;
    }
    function show(stick){ var b = stick || nearBottom(); render(); if (b) toBottom(); }

    async function first(){
      feed.innerHTML = '<p class="empty"><span class="spinner"></span></p>';
      var r = await opts.load("");
      if (!handle(r)) return;
      msgs = []; merge(r.data.messages || []); more = !!r.data.more; seenId = r.data.seen_id || 0;
      show(true);
      // pictures change height as they load, so keep to the bottom for the first moments
      var until = Date.now() + 2500;
      feed.addEventListener("load", function stick(){ if (Date.now() < until) toBottom(); else feed.removeEventListener("load", stick, true); }, true);
      schedule();
    }
    async function poll(){
      if (stopped || polling) return;
      polling = true;
      var r = await opts.load("after=" + lastRealId());
      polling = false;
      if (stopped) return;
      if (r.ok){
        var before = msgs.length, oldSeen = seenId;
        merge(r.data.messages || []); seenId = Math.max(seenId, r.data.seen_id || 0);
        if (msgs.length !== before || seenId !== oldSeen) show(msgs.length !== before && msgs[msgs.length - 1].from === opts.mine);
        if (opts.onInfo) opts.onInfo(r.data);
      } else if (r.status === 401 || r.status === 404) { stop(); opts.onSignedOut(r); return; }
      schedule();
    }
    function schedule(){ clearTimeout(timer); if (!stopped && !document.hidden) timer = setTimeout(poll, 3000); }
    function handle(r){
      if (r.ok){ if (opts.onInfo) opts.onInfo(r.data); return true; }
      if (r.status === 401 || r.status === 404){ stop(); opts.onSignedOut(r); return false; }
      feed.innerHTML = '<p class="empty">' + esc(r.data.error || "Couldn't load the messages.") + ' <button class="btn ghost small" type="button" data-reload>Try again</button></p>';
      return false;
    }
    async function older(){
      var firstId = msgs.length && typeof msgs[0].id === "number" ? msgs[0].id : 0;
      var h = feed.scrollHeight, top = feed.scrollTop;
      var r = await opts.load("before=" + firstId);
      if (!r.ok) return toast(r.data.error || "Couldn't load earlier messages.");
      merge(r.data.messages || []); more = !!r.data.more; render();
      feed.scrollTop = feed.scrollHeight - h + top;
    }

    /* ----- writing ----- */
    var pending = null; // picture waiting to be sent
    function updateSend(){ opts.sendBtn.disabled = !opts.input.value.trim() && !pending; }
    function grow(){ opts.input.style.height = "auto"; opts.input.style.height = Math.min(160, opts.input.scrollHeight + 4) + "px"; }
    function clearPicture(){ pending = null; opts.attachBox.hidden = true; opts.attachBox.innerHTML = ""; opts.fileInput.value = ""; updateSend(); }
    async function choosePicture(file){
      if (!file) return;
      if (!/^image\//.test(file.type)) return toast("Only pictures can be sent.");
      try {
        pending = await preparePicture(file);
        opts.attachBox.innerHTML = '<img alt="Picture to send" src="' + pending.preview + '"><span class="muted small" style="flex:1">Picture ready to send</span>' +
          '<button class="btn ghost small" type="button" data-unpick>Remove</button>';
        opts.attachBox.hidden = false; updateSend(); opts.input.focus();
      } catch (e) { toast(e.message); }
    }
    async function deliver(m){
      m.sending = true; m.failed = false; show(true);
      try {
        var payload = { text: m.text };
        if (m.pic){
          if (!m.picPath){
            var u = await opts.uploadUrl(m.pic.type);
            if (!u.ok) throw new Error(u.data.error || "The picture didn't upload.");
            await putFile(u.data.url, m.pic.blob);
            m.picPath = u.data.path;
          }
          payload.image_path = m.picPath; payload.w = m.pic.w; payload.h = m.pic.h;
        }
        var r = await opts.send(payload);
        if (r.status === 401) { stop(); opts.onSignedOut(r); return; }
        if (!r.ok) throw new Error(r.data.error || "Not sent.");
        msgs.splice(msgs.indexOf(m), 1);
        merge([r.data.message]);
        show(true);
      } catch (e) {
        m.sending = false; m.failed = true; show(true); toast(e.message);
      }
    }
    function sendNow(){
      var text = opts.input.value.trim();
      if (!text && !pending) return;
      var m = { id: "t" + (++tmp), n: tmp, from: opts.mine, text: text, at: new Date().toISOString(), sending: true,
        pic: pending, image: pending ? { local: pending.preview, w: pending.w, h: pending.h } : null };
      msgs.push(m);
      opts.input.value = ""; grow(); clearPicture();
      deliver(m);
      opts.input.focus();
    }

    opts.sendBtn.onclick = sendNow;
    opts.input.oninput = function(){ grow(); updateSend(); };
    opts.input.onkeydown = function(e){
      // Enter sends on a computer; on a phone it adds a new line and the send button sends
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !matchMedia("(pointer:coarse)").matches){ e.preventDefault(); sendNow(); }
    };
    opts.photoBtn.onclick = function(){ opts.fileInput.click(); };
    opts.fileInput.onchange = function(){ choosePicture(opts.fileInput.files[0]); };
    opts.input.onpaste = function(e){
      var f = [].find.call((e.clipboardData && e.clipboardData.files) || [], function(x){ return /^image\//.test(x.type); });
      if (f){ e.preventDefault(); choosePicture(f); }
    };
    opts.attachBox.onclick = function(e){ if (e.target.closest("[data-unpick]")) clearPicture(); };
    feed.onclick = async function(e){
      var t;
      if ((t = e.target.closest("[data-view]"))) return viewer(t.getAttribute("data-view"));
      if (e.target.closest("[data-more]")) return older();
      if (e.target.closest("[data-reload]")) return first();
      if ((t = e.target.closest("[data-retry]"))) { var m = msgs.find(function(x){ return String(x.id) === t.getAttribute("data-retry"); }); if (m) deliver(m); return; }
      if ((t = e.target.closest("[data-del]"))) {
        var id = Number(t.getAttribute("data-del"));
        if (!confirm("Delete this message for both of you?")) return;
        var r = await opts.remove(id);
        if (!r.ok) return toast(r.data.error || "Couldn't delete it.");
        msgs = msgs.filter(function(x){ return x.id !== id; }); picked = null; render(); return;
      }
      if (opts.canDelete && (t = e.target.closest(".msg"))) { var pid = Number(t.getAttribute("data-id")); picked = picked === pid ? null : pid; render(); }
    };
    function onVis(){ if (document.hidden) clearTimeout(timer); else if (!stopped) poll(); }
    document.addEventListener("visibilitychange", onVis);
    function stop(){ stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); }

    updateSend();
    first();
    return { stop: stop, refresh: poll };
  }

  window.Chat = { api: api, esc: esc, toast: toast, secretBox: secretBox, secretValue: secretValue, clearSecret: clearSecret, Room: Room, ago: ago, dayLabel: dayLabel, clock: clock };
})();
