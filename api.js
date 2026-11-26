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
    signOut: function () {
      write(localStorage, ME, null);
      write(sessionStorage, PASS, null);
      location.href = "/";
    }
  };
})();
