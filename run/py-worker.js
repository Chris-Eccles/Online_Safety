// Runs Python (Pyodide: real CPython compiled to WebAssembly) off the main thread.
import { loadPyodide } from "/py/pyodide.mjs";

const OUT_LIMIT = 40000;
let py = null;
const ready = loadPyodide({ indexURL: "/py/" })
  .then(p => { py = p; postMessage({ type: "ready" }); })
  .catch(e => postMessage({ type: "fatal", message: String((e && e.message) || e) }));

self.onmessage = async e => {
  const m = e.data || {};
  if (m.type !== "run") return;
  await ready;
  if (!py) { postMessage({ type: "result", id: m.id, error: "Python failed to load" }); return; }
  let out = "", tooMuch = false;
  const lines = String(m.stdin || "").replace(/\r/g, "").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  let li = 0;
  const dec = new TextDecoder();
  const write = buf => {
    out += dec.decode(buf, { stream: true });
    if (out.length > OUT_LIMIT) { tooMuch = true; throw new Error("too much output"); }
    return buf.length;
  };
  py.setStdout({ write });
  py.setStderr({ write });
  py.setStdin({ stdin: () => (li < lines.length ? lines[li++] : null), autoEOF: true });
  try {
    const g = py.globals.get("dict")();
    g.set("__name__", "__main__");
    await py.runPythonAsync(String(m.code), { globals: g, filename: "main.py" });
    g.destroy();
    postMessage({ type: "result", id: m.id, ok: true, out });
  } catch (x) {
    postMessage({ type: "result", id: m.id, ok: false, out, tooMuch, traceback: String((x && x.message) || x) });
  }
};
