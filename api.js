// Talks to the site's database (Supabase, London). It holds no personal data: only groups, their passwords,
// the lesson switches and random sign-in codes for devices.
// The student's name stays in this browser (localStorage) and is never sent anywhere.
(function () {
  "use strict";
  var BASE = "https://gnxgefgjsgtqgclyvblh.supabase.co/rest/v1/rpc/";
  var KEY = "sb_publishable_D5eUj-rOFB4cBzLX67hMfA_HlzSIHlu"; // publishable key: safe in a web page
  var ME = "abity-me", PASS = "abity-pass";

  function rpc(fn, args) {
    return fetch(BASE + fn, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      if (!r.ok) throw new Error("server " + r.status);
      return r.json();
    });
  }
  function read(store, k) { try { return JSON.parse(store.getItem(k) || "null"); } catch (e) { return null; } }
  function write(store, k, v) { try { v == null ? store.removeItem(k) : store.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // Capitalise a typed name: "sam o'neil-smith" → "Sam O'Neil-Smith"
  function nameCase(s) {
    return String(s || "").trim().replace(/\s+/g, " ").toLowerCase()
      .replace(/(^|[\s'’-])(\p{L})/gu, function (m, a, b) { return a + b.toUpperCase(); })
      .replace(/\bMc(\p{L})/gu, function (m, b) { return "Mc" + b.toUpperCase(); });
  }

  window.Abity = {
    rpc: rpc,
    nameCase: nameCase,
    me: function () { return read(localStorage, ME); },
    setMe: function (v) { write(localStorage, ME, v); },
    pass: function () { return read(sessionStorage, PASS); },
    setPass: function (v) { write(sessionStorage, PASS, v); },
    // The group's view: which workbooks and lessons are open. Null if this device isn't signed in (or the
    // teacher has changed the group password since).
    state: function () {
      var me = read(localStorage, ME);
      if (!me || !me.token) return Promise.resolve(null);
      return rpc("site_state", { p_token: me.token }).then(function (s) {
        if (!s || !s.ok) { write(localStorage, ME, null); return null; }
        s.name = me.name;
        return s;
      });
    },
    // A quiz answer for the anonymous class results: the question and the option picked, linked to this
    // device's group only. The database keeps the first answer per device and ignores later ones.
    answer: function (item, qid, choice) {
      var me = read(localStorage, ME);
      if (!me || !me.token) return;
      rpc("site_answer", { p_token: me.token, p_item: item, p_qid: qid, p_choice: choice }).catch(function () {});
    },
    // Exit ticket "How confident are you?" ratings (0 not yet, 1 getting there, 2 got it; -1 skipped), linked to the group only.
    confidence: function (item, lesson, levels) {
      var me = read(localStorage, ME);
      if (!me || !me.token) return Promise.reject(new Error("not signed in"));
      return rpc("site_confidence", { p_token: me.token, p_item: item, p_lesson: lesson, p_levels: levels });
    },
    // KS4/5 badges and class questions: linked to this device's sign-in code only, never a name.
    token: function () { var me = read(localStorage, ME); return me && me.token; },
    badges: function () {
      var me = read(localStorage, ME);
      if (!me || !me.token) return Promise.resolve(null);
      return rpc("site_badges", { p_token: me.token });
    },
    badge: function (id) {   // only the few badges a page can award itself (hello, curious, f404, easter)
      var me = read(localStorage, ME);
      if (!me || !me.token || (me.year && me.year < 10)) return Promise.resolve(null);
      return rpc("site_badge", { p_token: me.token, p_badge: id }).then(function (r) {
        if (r && r.new && window.AbityPanel) window.AbityPanel.check();
        return r;
      }).catch(function () { return null; });
    },
    signOut: function () {
      write(localStorage, ME, null);
      write(sessionStorage, PASS, null);
      location.href = "/";
    }
  };
})();
