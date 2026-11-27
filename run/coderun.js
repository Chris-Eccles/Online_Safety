// CodeRun: compile and run student code in the browser, in C#, Python, VB.NET or Java.
//   CodeRun.run(lang, code, stdin) -> Promise<{ ok, output, errors:[{line,col,message,id}], runtimeError, timedOut, stopped, ms }>
//   CodeRun.boot(lang), CodeRun.stop(lang), CodeRun.onState(lang, fn), CodeRun.state(lang)
// Nothing is sent to a server: every language runs inside the student's own browser.
(function () {
  "use strict";
  var TIME_LIMIT = 8000;     // ms before a run is treated as an infinite loop
  var OUT_LIMIT = 40000;     // characters of output kept

  var LANGS = {
    cs:   { name: "C#",     file: "Program.cs" },
    py:   { name: "Python", file: "main.py" },
    vb:   { name: "VB.NET", file: "Program.vb" },
    java: { name: "Java",   file: "Main.java" }
  };

  var states = { cs: "idle", py: "idle", vb: "idle", java: "idle" };
  var listeners = { cs: [], py: [], vb: [], java: [] };
  function setState(lang, s) {
    states[lang] = s;
    listeners[lang].forEach(function (f) { try { f(s); } catch (e) {} });
  }

  var NOINPUT = "Your program asked for more input than you gave. Add another line in the Input box (one line for each time it reads input).";
  var TOOMUCH = "Your program printed too much output and was stopped. Check your loops.";
  var TIMEOUT = "Your program ran for more than " + (TIME_LIMIT / 1000) + " seconds and was stopped. Check for a loop that never ends.";

  // Friendly text for exceptions whose message is missing or is an internal resource key
  var EXC = {
    DivideByZeroException: "Attempted to divide by zero.",
    ArithmeticException: "Arithmetic error (for example dividing a whole number by zero).",
    IndexOutOfRangeException: "Index was outside the bounds of the array.",
    ArgumentOutOfRangeException: "Index was out of range. It must be non-negative and less than the size of the collection.",
    NullReferenceException: "Object reference not set to an instance of an object (something is Nothing / null).",
    FormatException: "The input string was not in a correct format (e.g. letters given where a number was expected).",
    InvalidCastException: "That conversion is not allowed (e.g. turning letters into a number).",
    OverflowException: "The value was too large or too small for that type.",
    KeyNotFoundException: "The given key was not present in the dictionary.",
    InvalidOperationException: "Operation is not valid (e.g. the collection was empty or was changed while looping).",
    StackOverflowException: "Stack overflow (probably recursion that never stops).",
    ArgumentNullException: "A value that cannot be null was null.",
    ArgumentException: "An argument was not valid.",
    InputMismatchException: "The input wasn't the type expected (e.g. letters given where a number was expected).",
    FileNotFoundException: "That file could not be found."
  };
  var looksLikeKey = function (s) { return /^[A-Z][A-Za-z]+_[A-Za-z_]+(,|$)/.test(String(s || "").trim()); };
  function friendly(type, msg) {
    msg = String(msg || "").trim();
    if (looksLikeKey(msg)) {
      var parts = msg.split(/,\s*/);
      if (parts[0] === "InvalidCast_FromStringTo" && parts.length >= 3) return 'Conversion from string "' + parts[1] + '" to type \'' + parts[2] + "' is not valid.";
      return EXC[type] || "";
    }
    return msg || EXC[type] || "";
  }
  function runtimeText(type, msg, line) {
    var m = friendly(type, msg);
    return "Runtime error" + (line ? " on line " + line : "") + ": " + type + (m ? " - " + m : "");
  }

  /* ---------- Worker-backed engines (Python, VB.NET) ---------- */
  function workerEngine(lang, url, opts) {
    var w = null, readyP = null, pending = {}, nextId = 1;
    function start() {
      if (readyP) return readyP;
      setState(lang, "loading");
      readyP = new Promise(function (res, rej) {
        try { w = opts ? new Worker(url, opts) : new Worker(url); }
        catch (e) { setState(lang, "failed"); readyP = null; rej(e); return; }
        w.onmessage = function (e) {
          var m = e.data || {};
          if (m.type === "ready") { setState(lang, "ready"); res(); }
          else if (m.type === "fatal") { setState(lang, "failed"); readyP = null; rej(new Error(m.message)); }
          else if (m.type === "result" && pending[m.id]) { var p = pending[m.id]; delete pending[m.id]; p(m); }
        };
        w.onerror = function () { if (states[lang] === "loading") { setState(lang, "failed"); readyP = null; rej(new Error("Could not start " + LANGS[lang].name)); } };
      });
      return readyP;
    }
    function restart(reason) {
      if (w) { try { w.terminate(); } catch (e) {} }
      w = null; readyP = null;
      Object.keys(pending).forEach(function (k) { pending[k]({ stopped: reason === "stop", timedOut: reason === "timeout" }); delete pending[k]; });
      setState(lang, "idle");
      start().catch(function () {});        // warm a fresh copy up in the background
    }
    function exec(code, stdin) {
      return start().then(function () {
        return new Promise(function (resolve) {
          var id = nextId++;
          var timer = setTimeout(function () { if (pending[id]) restart("timeout"); }, TIME_LIMIT);
          pending[id] = function (m) { clearTimeout(timer); resolve(m); };
          w.postMessage({ type: "run", id: id, code: code, stdin: stdin });
        });
      });
    }
    return { boot: start, exec: exec, stop: function () { if (Object.keys(pending).length) restart("stop"); } };
  }

  var py = workerEngine("py", "/run/py-worker.js", { type: "module" });
  var vb = workerEngine("vb", "/run/vb-worker.js");

  function normPy(m) {
    if (m.timedOut) return { ok: false, timedOut: true, output: "", errors: [], runtimeError: TIMEOUT };
    if (m.stopped) return { ok: false, stopped: true, output: "", errors: [], runtimeError: "Stopped." };
    if (m.error) return { ok: false, output: "", errors: [], runtimeError: "Something went wrong running the code: " + m.error };
    if (m.ok) return { ok: true, output: m.out || "", errors: [], runtimeError: null };
    if (m.tooMuch) return { ok: false, output: m.out || "", errors: [], runtimeError: TOOMUCH };
    var tb = String(m.traceback || ""), line = null, mm, re = /File "main\.py", line (\d+)/g;
    while ((mm = re.exec(tb))) line = Number(mm[1]);
    var tail = tb.split("\n").filter(function (l) { return l.trim(); }).pop() || "Error";
    var t = /^([A-Za-z_][\w.]*)(?::\s*(.*))?$/.exec(tail.trim()) || [];
    var type = t[1] || "Error", msg = t[2] || "";
    if (/^(SyntaxError|IndentationError|TabError)$/.test(type)) return { ok: false, output: "", errors: [{ line: line, message: type + ": " + msg, id: type }], runtimeError: null };
    if (type === "EOFError") return { ok: false, output: m.out || "", errors: [], runtimeError: NOINPUT };
    return { ok: false, output: m.out || "", errors: [], runtimeError: runtimeText(type, msg, line) };
  }

  function normVb(m) {
    if (m.timedOut) return { ok: false, timedOut: true, output: "", errors: [], runtimeError: TIMEOUT };
    if (m.stopped) return { ok: false, stopped: true, output: "", errors: [], runtimeError: "Stopped." };
    if (m.error) return { ok: false, output: "", errors: [], runtimeError: "Something went wrong running the code: " + m.error };
    var r = m.result || {}, errs = r.errors || [];
    var compile = errs.filter(function (e) { return /^BC\d+$/.test(e.id || "") || e.line > 0; });
    if (compile.length) return { ok: false, output: "", errors: compile.map(function (e) { return { line: e.line || null, col: e.column || null, message: e.message, id: e.id }; }), runtimeError: null };
    if (!r.ok && errs.length) {
      var e = errs[0], type = String(e.type || e.id || "Exception").split(".").pop();
      return { ok: false, output: r.output || "", errors: [], runtimeError: runtimeText(type, e.message, null) };
    }
    var out = r.output || "";
    if (out.length > OUT_LIMIT) return { ok: false, output: out.slice(0, OUT_LIMIT), errors: [], runtimeError: TOOMUCH };
    return { ok: true, output: out, errors: [], runtimeError: null };
  }

  /* ---------- Java (TraceJVM: OpenJDK javac + a real JVM, both in WebAssembly) ---------- */
  var java = (function () {
    var mod = null, compiler = null, runner = null, runnerP = null, readyP = null, current = null, stopRequested = false;
    var mkWorker = function () { return new Worker("/java/browser-worker.js", { type: "module" }); };
    function newRunner() {
      runner = new mod.TraceJVMWorkerClient({
        engine: { assets: { runtimeProfileBaseUrls: { core: "/java/profiles/core" }, wasmUrl: "/java/bjvm_main.wasm" } },
        createWorker: mkWorker
      });
      runnerP = runner.initialize();
      return runnerP;
    }
    function boot() {
      if (readyP) return readyP;
      setState("java", "loading");
      readyP = import("/java/browser-client.js").then(function (m) {
        mod = m;
        compiler = new m.TraceJVMCompilerWorkerClient({
          compiler: { assets: { baseUrl: "/java/compiler" }, platformArchiveUrl: "/java/profiles/core/jdk23.jar" },
          createWorker: mkWorker
        });
        return Promise.all([compiler.initialize(), newRunner()]);
      }).then(function () { setState("java", "ready"); }, function (e) { setState("java", "failed"); readyP = null; throw e; });
      return readyP;
    }
    function strip(code) { return code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ").replace(/"(?:[^"\\\n]|\\.)*"/g, '""'); }
    // Which class has main(), and what must the file be called
    function classes(code) {
      var s = strip(code), re = /\b(public\s+)?(?:(?:abstract|final|static)\s+)*class\s+([A-Za-z_]\w*)/g, m, list = [];
      while ((m = re.exec(s))) list.push({ name: m[2], pub: !!m[1], at: m.index });
      var mainAt = s.search(/\bstatic\s+(?:public\s+)?void\s+main\s*\(/);
      if (mainAt < 0) mainAt = s.search(/\bvoid\s+main\s*\(/);
      var mainCls = null;
      list.forEach(function (c) { if (mainAt >= 0 && c.at < mainAt) mainCls = c.name; });
      var pub = list.filter(function (c) { return c.pub; })[0];
      return { main: mainCls, file: (pub ? pub.name : (mainCls || "Main")) + ".java" };
    }
    var launcher = function (main) {
      return "public class HwLaunch__ {\n  public static void main(String[] a) throws Throwable {\n" +
        "    System.setIn(new java.io.ByteArrayInputStream(System.getProperty(\"hw.stdin\", \"\").getBytes(java.nio.charset.StandardCharsets.UTF_8)));\n" +
        "    " + main + ".main(new String[0]);\n  }\n}\n";
    };
    function exec(code, stdin) {
      return boot().then(function () { return runnerP; }).then(function () {
        var info = classes(code);
        if (!info.main) return { compileErrors: [{ line: null, message: "Couldn't find a main method. Your program needs: public static void main(String[] args) { ... } inside a class." }] };
        return compiler.compile({ sources: [{ path: info.file, content: code }, { path: "HwLaunch__.java", content: launcher(info.main) }] }).then(function (c) {
          if (c.status !== "completed") {
            var errs = (c.diagnostics || []).filter(function (d) { return d.severity === "error" && String(d.fileName || "").indexOf("HwLaunch__") < 0; })
              .map(function (d) { return { line: d.lineNumber || null, col: d.columnNumber || null, message: d.message }; });
            if (!errs.length) errs = [{ line: null, message: (c.stderr || "Your code didn't compile.").split("\n")[0] }];
            return { compileErrors: errs };
          }
          var ac = new AbortController(), out = "", tooMuch = false, timedOut = false;
          current = ac; stopRequested = false;
          var timer = setTimeout(function () { timedOut = true; ac.abort(); }, TIME_LIMIT);
          return runner.run({
            program: c.program, mainClass: "HwLaunch__", systemProperties: { "hw.stdin": stdin }, signal: ac.signal,
            onStdout: function (s) { out += s; if (out.length > OUT_LIMIT && !tooMuch) { tooMuch = true; ac.abort(); } }
          }).then(function (r) {
            clearTimeout(timer); current = null;
            if (r.retirementRecommended || (r.isolation && r.isolation.hardBoundaryRecommended)) { try { runner.terminate(); } catch (e) {} newRunner().catch(function () {}); }
            return { r: r, file: info.file };
          }, function (e) {
            clearTimeout(timer); current = null;
            try { runner.terminate(); } catch (x) {}
            newRunner().catch(function () {});          // the old JVM was stopped, so start a fresh one
            if (tooMuch) return { tooMuch: true, out: out };
            if (timedOut) return { timedOut: true };
            if (stopRequested) return { stopped: true };
            return { error: String((e && e.message) || e) };
          });
        });
      });
    }
    return { boot: boot, exec: exec, stop: function () { if (current) { stopRequested = true; current.abort(); } } };
  })();

  function normJava(m) {
    if (m.timedOut) return { ok: false, timedOut: true, output: "", errors: [], runtimeError: TIMEOUT };
    if (m.stopped) return { ok: false, stopped: true, output: "", errors: [], runtimeError: "Stopped." };
    if (m.tooMuch) return { ok: false, output: m.out.slice(0, OUT_LIMIT), errors: [], runtimeError: TOOMUCH };
    if (m.error) return { ok: false, output: "", errors: [], runtimeError: "Something went wrong running the code: " + m.error };
    if (m.compileErrors) return { ok: false, output: "", errors: m.compileErrors, runtimeError: null };
    var r = m.r || {};
    if (r.status === "completed" && !r.exitCode) return { ok: true, output: r.stdout || "", errors: [], runtimeError: null };
    var err = String(r.stderr || "");
    var first = err.split("\n")[0] || "", t = /^(?:Exception in thread "main" )?([\w.$]+)(?::\s*(.*))?$/.exec(first.trim()) || [];
    var type = String(t[1] || "").split(".").pop(), msg = t[2] || "";
    var lm = new RegExp("\\(" + m.file.replace(".", "\\.") + ":(\\d+)\\)").exec(err), line = lm ? Number(lm[1]) : null;
    if (type === "NoSuchElementException" && /Scanner/.test(err)) return { ok: false, output: r.stdout || "", errors: [], runtimeError: NOINPUT };
    if (!type) return { ok: r.exitCode === 0, output: r.stdout || "", errors: [], runtimeError: r.exitCode ? "Your program stopped with exit code " + r.exitCode + "." : null };
    return { ok: false, output: r.stdout || "", errors: [], runtimeError: runtimeText(type, msg, line) };
  }

  /* ---------- C# (Roslyn on .NET WebAssembly; see /cs/csharp.js) ---------- */
  var csLoad = null;
  function cs() {
    if (!csLoad) csLoad = new Promise(function (res, rej) {
      var sc = document.createElement("script"); sc.src = "/cs/csharp.js";
      sc.onload = function () { window.CSharp.onState(function (s) { setState("cs", s === "ready" ? "ready" : s === "failed" ? "failed" : s === "loading" ? "loading" : states.cs); }); res(window.CSharp); };
      sc.onerror = function () { csLoad = null; rej(new Error("Couldn't load the C# runner.")); };
      document.head.appendChild(sc);
    });
    return csLoad;
  }

  /* ---------- Public API ---------- */
  function boot(lang) {
    if (lang === "cs") return cs().then(function (c) { return c.boot(); });
    if (lang === "py") return py.boot();
    if (lang === "vb") return vb.boot();
    if (lang === "java") return java.boot();
    return Promise.reject(new Error("Unknown language"));
  }
  function run(lang, code, stdin) {
    var t0 = performance.now();
    code = String(code || ""); stdin = String(stdin || "").replace(/\r/g, "");
    var p;
    if (lang === "cs") p = cs().then(function (c) { return c.run(code, stdin, { echo: false }); });
    else if (lang === "py") p = py.exec(code, stdin).then(normPy);
    else if (lang === "vb") p = vb.exec(code, stdin).then(normVb);
    else if (lang === "java") p = java.exec(code, stdin).then(normJava);
    else p = Promise.reject(new Error("Unknown language"));
    return p.then(function (r) { r.ms = Math.round(performance.now() - t0); r.errors = r.errors || []; return r; });
  }
  function stop(lang) {
    if (lang === "cs" && window.CSharp) window.CSharp.stop();
    else if (lang === "py") py.stop();
    else if (lang === "vb") vb.stop();
    else if (lang === "java") java.stop();
  }
  window.CodeRun = {
    LANGS: LANGS,
    boot: boot,
    run: run,
    stop: stop,
    state: function (lang) { return states[lang]; },
    onState: function (lang, f) { if (listeners[lang]) { listeners[lang].push(f); f(states[lang]); } }
  };
})();
