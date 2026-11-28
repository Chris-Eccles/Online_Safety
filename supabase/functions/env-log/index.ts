// env-log: anonymous activity log for the Env Sci site (env.abity.co.uk) and its admin page.
//   POST /log    Public (from env.abity.co.uk). {uid, kind, page, detail} -> stored in public.env_activity.
//                uid is a random 8-character browser ID; no names, emails or IP addresses are stored.
//                Only small, known fields are kept: page path, marks/max for AI marking, skill + result for maths.
//   POST /admin  {pw} -> the last 30 days of activity. Only a SHA-256 hash of the admin password is kept here.
//                To change it: printf 'env-admin:NEWPASSWORD' | sha256sum  and paste the hash into ADMIN_HASH.
// Records older than 30 days are deleted automatically.
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS = ["https://env.abity.co.uk"];
const KEEP_DAYS = 30;
const ADMIN_HASH = "fdbf04e55d5e561f06ca7dcd229234eb867479ed23c6f02d621b464b7cc91304";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("Origin") || "";
  const ok = ORIGINS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  return { "Access-Control-Allow-Origin": ok ? o : ORIGINS[0], "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
}
const json = (body: unknown, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n * 10) / 10)) : 0; };
async function sha(t: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function prune() { await db.from("env_activity").delete().lt("at", new Date(Date.now() - KEEP_DAYS * 864e5).toISOString()); }

// A simple per-browser limit so a stuck page cannot flood the table (per running instance)
const seen = new Map<string, number[]>();
function tooMany(uid: string) {
  const now = Date.now(), list = (seen.get(uid) || []).filter(t => now - t < 60000);
  list.push(now); seen.set(uid, list); if (seen.size > 5000) seen.clear();
  return list.length > 40;
}

async function log(req: Request, h: Record<string, string>) {
  const o = req.headers.get("Origin") || "";
  if (o && !ORIGINS.includes(o) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return json({ error: "Not allowed." }, 403, h);
  let b: any; try { const raw = await req.text(); if (raw.length > 2000) return json({ error: "Too big." }, 413, h); b = JSON.parse(raw); } catch { return json({ error: "Bad request." }, 400, h); }
  const uid = String(b?.uid || ""), kind = String(b?.kind || "");
  if (!/^[0-9a-f]{8}$/.test(uid) || !["page", "mark", "maths"].includes(kind)) return json({ error: "Bad request." }, 400, h);
  if (tooMany(uid)) return json({ ok: true }, 200, h);
  const page = String(b?.page || "").slice(0, 120);
  if (!/^\/[\w\-./]*$/.test(page)) return json({ error: "Bad page." }, 400, h);
  const d = b?.detail || {};
  let detail: Record<string, unknown> = {};
  if (kind === "mark") detail = { n: num(d.n, 0, 50), marks: num(d.marks, 0, 500), max: num(d.max, 0, 500) };
  if (kind === "maths") {
    const r = String(d.r || ""), skill = String(d.skill || "");
    if (!["right", "wrong", "new"].includes(r) || !/^[a-z]{2,20}$/.test(skill)) return json({ error: "Bad request." }, 400, h);
    detail = { skill, r };
  }
  const { error } = await db.from("env_activity").insert({ uid, kind, page, detail });
  if (error) { console.error(error); return json({ error: "Not saved." }, 500, h); }
  if (Math.random() < 0.05) await prune();
  return json({ ok: true }, 200, h);
}

async function admin(req: Request, h: Record<string, string>) {
  let b: any; try { b = JSON.parse(await req.text()); } catch { return json({ error: "Bad request." }, 400, h); }
  if ((await sha("env-admin:" + String(b?.pw || ""))) !== ADMIN_HASH) {
    await new Promise(r => setTimeout(r, 1200));   // slows down guessing
    return json({ error: "Wrong password." }, 401, h);
  }
  await prune();
  const rows: unknown[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db.from("env_activity").select("uid,at,kind,page,detail").order("at", { ascending: false }).range(from, from + 999);
    if (error) { console.error(error); return json({ error: "Could not read the log." }, 500, h); }
    rows.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return json({ rows, keepDays: KEEP_DAYS }, 200, h);
}

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const path = new URL(req.url).pathname.replace(/^.*\/env-log/, "").replace(/\/+$/, "") || "/";
  try {
    if (req.method !== "POST") return json({ ok: true, service: "env-log" }, 200, h);
    if (path === "/log") return await log(req, h);
    if (path === "/admin") return await admin(req, h);
    return json({ error: "Not found" }, 404, h);
  } catch (e) { console.error(e); return json({ error: "Server error" }, 500, h); }
});
