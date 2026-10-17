// chat-api: the server for chat.abity.co.uk
// Runs as a Supabase Edge Function with the service role. The chat tables and the image store are
// locked (row level security on, no policies), so nothing can be read except through here.
//
// Guest (needs the chat pass from /unlock):  POST /unlock  GET /messages  POST /send  POST /upload-url
// Owner (needs the admin pass, the same one the CPD admin uses):  POST /admin/login  /admin/...
//
// Decoy: a chat's password with an extra "2" on the end opens a made-up, harmless conversation between the
// same two names. Its pass looks exactly like a real one and it is served by the same endpoints, so nothing
// in the page or its traffic gives it away. Anything typed into it is kept apart and the owner is alerted.
// (Real chat passwords can never end in 2, so the two can't clash.)
import { createClient } from "npm:@supabase/supabase-js@2";
import { decoyScript } from "./decoy.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const STORE = "chat-images";
const URL_LIFE = 60 * 60 * 24; // links to pictures last a day; the page asks again after that
const PAGE = 200; // how many earlier messages load when a chat opens

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-chat-pass, x-admin-pass, authorization, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } });
const fail = (error: string, status = 400) => json({ error }, status);

// ---------- secrets and passes ----------
let secretCache: Record<string, string> | null = null, secretAt = 0;
async function secrets() {
  if (secretCache && Date.now() - secretAt < 60000) return secretCache;
  const { data, error } = await db.from("app_secrets").select("name,value");
  if (error) throw error;
  secretCache = Object.fromEntries((data || []).map((r) => [r.name, r.value]));
  secretAt = Date.now();
  return secretCache;
}
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function hmac(msg: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode((await secrets()).token_key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
// Admin pass: identical format to the CPD admin, so one sign-in works for both
async function makeAdminPass() {
  const exp = String(Date.now() + 864e5);
  return `admin.${exp}.${await hmac(`admin.${exp}`)}`;
}
async function isAdmin(pass: string | null) {
  if (!pass) return false;
  const [r, exp, sig] = pass.split(".");
  if (r !== "admin" || !exp || !sig || Number(exp) < Date.now()) return false;
  return same(sig, await hmac(`admin.${exp}`));
}
// Chat pass: tied to that chat's current password, so changing the password signs the guest out
type Room = { id: string; name: string; password: string; password_sha256: string; is_open: boolean; owner_seen_id: number; guest_seen_id: number; guest_last_seen: string | null; decoy_opened_at: string | null; decoy_alert: boolean; created_at: string; updated_at: string };
const chatSig = (room: Room, exp: string, decoy: boolean) =>
  hmac(`chat.${room.id}.${exp}.${room.password_sha256.slice(0, 16)}${decoy ? ".d" : ""}`);
async function makeChatPass(room: Room, decoy: boolean) {
  const exp = String(Date.now() + 864e5);
  return `chat.${room.id}.${exp}.${await chatSig(room, exp, decoy)}`;
}
async function roomFromPass(pass: string | null): Promise<{ room: Room; decoy: boolean } | null> {
  if (!pass) return null;
  const [r, id, exp, sig] = pass.split(".");
  if (r !== "chat" || !id || !exp || !sig || Number(exp) < Date.now()) return null;
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const room = await getRoom(id);
  if (!room || !room.is_open) return null;
  if (same(sig, await chatSig(room, exp, false))) return { room, decoy: false };
  if (same(sig, await chatSig(room, exp, true))) return { room, decoy: true };
  return null;
}
async function getRoom(id: string): Promise<Room | null> {
  const { data } = await db.from("chat_rooms").select("*").eq("id", id).maybeSingle();
  return data as Room | null;
}

// ---------- messages ----------
type Msg = { id: number; room_id: string; sender: string; body: string; image_path: string | null; image_w: number | null; image_h: number | null; created_at: string };
async function shape(rows: Msg[]) {
  const paths = rows.map((r) => r.image_path).filter(Boolean) as string[];
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await db.storage.from(STORE).createSignedUrls(paths, URL_LIFE);
    (data || []).forEach((d) => d.signedUrl && d.path && urls.set(d.path, d.signedUrl));
  }
  return rows.map((r) => ({
    id: r.id, from: r.sender, text: r.body, at: r.created_at,
    image: r.image_path ? { url: urls.get(r.image_path) || null, w: r.image_w, h: r.image_h } : null,
  }));
}
async function messages(roomId: string, after: number | null, before: number, decoy = false) {
  let q = db.from("chat_messages").select("*").eq("room_id", roomId).eq("decoy", decoy);
  if (after !== null) q = q.gt("id", after).order("id", { ascending: true }).limit(500);
  else {
    if (before > 0) q = q.lt("id", before);
    q = q.order("id", { ascending: false }).limit(PAGE);
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data || []) as Msg[];
  if (after === null) rows.reverse();
  return { rows, more: after === null && rows.length === PAGE };
}
async function lastId(roomId: string) {
  const { data } = await db.from("chat_messages").select("id").eq("room_id", roomId).eq("decoy", false).order("id", { ascending: false }).limit(1);
  return data?.[0]?.id || 0;
}
async function markSeen(room: Room, who: "owner" | "guest", upTo: number) {
  const col = who === "owner" ? "owner_seen_id" : "guest_seen_id";
  const patch: Record<string, unknown> = {};
  if (upTo > (room as any)[col]) patch[col] = upTo;
  if (who === "guest") patch.guest_last_seen = new Date().toISOString();
  // keep the "last seen" write to at most once a minute
  if (who === "guest" && !patch.guest_seen_id && room.guest_last_seen && Date.now() - Date.parse(room.guest_last_seen) < 60000) return;
  if (Object.keys(patch).length) await db.from("chat_rooms").update(patch).eq("id", room.id);
}
function cleanText(t: unknown) {
  return String(t ?? "").replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, 5000);
}
async function send(room: Room, who: "owner" | "guest", body: Record<string, unknown>, decoy = false) {
  const text = cleanText(body.text);
  let image_path: string | null = null, image_w: number | null = null, image_h: number | null = null;
  if (body.image_path) {
    image_path = String(body.image_path);
    if (!image_path.startsWith(`${room.id}/`) || image_path.includes("..")) return fail("That picture didn't upload properly.");
    const folder = room.id, file = image_path.slice(room.id.length + 1);
    const { data } = await db.storage.from(STORE).list(folder, { search: file, limit: 1 });
    if (!data?.length) return fail("That picture didn't upload properly. Try again.");
    image_w = Math.min(10000, Math.max(0, Number(body.w) || 0)) || null;
    image_h = Math.min(10000, Math.max(0, Number(body.h) || 0)) || null;
  }
  if (!text && !image_path) return fail("Type a message or add a picture.");
  const { data, error } = await db.from("chat_messages")
    .insert({ room_id: room.id, sender: who, body: text, image_path, image_w, image_h, decoy }).select("*").single();
  if (error) throw error;
  if (decoy) {
    await db.from("chat_rooms").update({ decoy_alert: true }).eq("id", room.id);
    const m = (await shape([data as Msg]))[0];
    return json({ message: { ...m, id: m.id + DECOY_OFFSET } });
  }
  await db.from("chat_rooms").update({ updated_at: new Date().toISOString(), [who === "owner" ? "owner_seen_id" : "guest_seen_id"]: data.id }).eq("id", room.id);
  return json({ message: (await shape([data as Msg]))[0] });
}
async function uploadUrl(room: Room, body: Record<string, unknown>) {
  const type = String(body.type || "");
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[type];
  if (!ext) return fail("Only pictures can be sent (JPEG, PNG, WebP or GIF).");
  const path = `${room.id}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await db.storage.from(STORE).createSignedUploadUrl(path);
  if (error) throw error;
  return json({ path, token: data.token, url: data.signedUrl });
}

// Things typed into the decoy are numbered after the made-up ones
const DECOY_OFFSET = 1_000_000;

// ---------- requests ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/chat-api/, "") || "/";
  let body: Record<string, unknown> = {};
  if (req.method === "POST") body = await req.json().catch(() => ({}));
  const num = (k: string) => Number(url.searchParams.get(k) || body[k] || 0) || 0;
  const after = url.searchParams.has("after") ? num("after") : null; // present = only what's new

  try {
    // ----- guest -----
    if (path === "/unlock" && req.method === "POST") {
      const pw = String(body.password || "").trim();
      await new Promise((r) => setTimeout(r, 400)); // slows down anyone guessing
      if (!pw) return fail("Enter your password.");
      const decoy = pw.endsWith("2");
      const { data } = await db.from("chat_rooms").select("*").eq("password_sha256", await sha256(decoy ? pw.slice(0, -1) : pw)).maybeSingle();
      const room = data as Room | null;
      if (!room || !room.is_open) return fail("That password isn't right.", 401);
      if (decoy) await db.from("chat_rooms").update({ decoy_opened_at: new Date().toISOString(), decoy_alert: true }).eq("id", room.id);
      return json({ pass: await makeChatPass(room, decoy) });
    }
    if (["/messages", "/send", "/upload-url"].includes(path)) {
      const got = await roomFromPass(req.headers.get("x-chat-pass"));
      if (!got) return fail("Please sign in again.", 401);
      const { room, decoy } = got;
      const them = (await secrets()).chat_owner_name || "Chris";
      if (path === "/messages" && decoy) {
        // the made-up conversation, plus anything typed into it
        const typed = await messages(room.id, after === null ? null : Math.max(0, after - DECOY_OFFSET), 0, true);
        const extra = (await shape(typed.rows)).map((m) => ({ ...m, id: m.id + DECOY_OFFSET }));
        const script = after === null && !num("before") ? decoyScript(room.id, room.created_at) : [];
        return json({ me: room.name, them, more: false, messages: num("before") ? [] : [...script, ...extra], seen_id: script.length });
      }
      if (path === "/messages") {
        const { rows, more } = await messages(room.id, after, num("before"));
        const latest = rows.length ? rows[rows.length - 1].id : 0;
        if (!num("before")) await markSeen(room, "guest", latest);
        return json({ me: room.name, them, more, messages: await shape(rows), seen_id: room.owner_seen_id });
      }
      if (path === "/send" && req.method === "POST") return await send(room, "guest", body, decoy);
      if (path === "/upload-url" && req.method === "POST") return await uploadUrl(room, body);
    }

    // ----- owner -----
    if (path === "/admin/login" && req.method === "POST") {
      await new Promise((r) => setTimeout(r, 400));
      const ok = same(await sha256(String(body.password || "").trim()), (await secrets()).admin_password_sha256);
      return ok ? json({ pass: await makeAdminPass() }) : fail("That password isn't right.", 401);
    }
    if (path.startsWith("/admin/")) {
      if (!(await isAdmin(req.headers.get("x-admin-pass")))) return fail("Please sign in again.", 401);

      if (path === "/admin/rooms") {
        const { data, error } = await db.from("chat_rooms").select("*").order("updated_at", { ascending: false });
        if (error) throw error;
        const rooms = data as Room[];
        const out = [];
        for (const r of rooms) {
          const { data: last } = await db.from("chat_messages").select("id,sender,body,image_path,created_at")
            .eq("room_id", r.id).eq("decoy", false).order("id", { ascending: false }).limit(1);
          const { count } = await db.from("chat_messages").select("id", { count: "exact", head: true })
            .eq("room_id", r.id).eq("decoy", false).eq("sender", "guest").gt("id", r.owner_seen_id);
          const l = last?.[0];
          out.push({
            id: r.id, name: r.name, password: r.password, open: r.is_open, created_at: r.created_at,
            guest_last_seen: r.guest_last_seen, unread: count || 0,
            decoy_opened_at: r.decoy_opened_at, decoy_alert: r.decoy_alert,
            last: l ? { from: l.sender, text: l.body || (l.image_path ? "📷 Picture" : ""), at: l.created_at } : null,
          });
        }
        const s = await secrets();
        return json({ rooms: out, owner_name: s.chat_owner_name || "Chris" });
      }
      if (path === "/admin/room/save" && req.method === "POST") {
        const name = cleanText(body.name).slice(0, 60);
        const pw = String(body.password || "").trim();
        if (!name) return fail("Give the chat a name.");
        if (pw.length < 6) return fail("Use a password of at least 6 characters.");
        if (pw.length > 100) return fail("That password is too long.");
        if (pw.endsWith("2")) return fail("Chat passwords can't end in 2, because a 2 on the end opens the decoy chat.");
        const hash = await sha256(pw);
        const { data: clash } = await db.from("chat_rooms").select("id").eq("password_sha256", hash).maybeSingle();
        if (clash && clash.id !== body.id) return fail("Another chat already uses that password. Each chat needs its own.");
        const row: Record<string, unknown> = { name, password: pw, password_sha256: hash };
        if (typeof body.open === "boolean") row.is_open = body.open;
        if (body.id) {
          const { error } = await db.from("chat_rooms").update(row).eq("id", String(body.id));
          if (error) throw error;
          return json({ ok: true, id: body.id });
        }
        const { data, error } = await db.from("chat_rooms").insert(row).select("id").single();
        if (error) throw error;
        return json({ ok: true, id: data.id });
      }
      if (path === "/admin/room/open" && req.method === "POST") {
        const { error } = await db.from("chat_rooms").update({ is_open: !!body.open }).eq("id", String(body.id));
        if (error) throw error;
        return json({ ok: true });
      }
      if (path === "/admin/room/delete" && req.method === "POST") {
        const id = String(body.id || "");
        if (!/^[0-9a-f-]{36}$/.test(id)) return fail("Unknown chat.");
        const { data: files } = await db.storage.from(STORE).list(id, { limit: 1000 });
        if (files?.length) await db.storage.from(STORE).remove(files.map((f) => `${id}/${f.name}`));
        const { error } = await db.from("chat_rooms").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }
      if (path === "/admin/owner-name" && req.method === "POST") {
        const name = cleanText(body.name).slice(0, 40);
        if (!name) return fail("Enter a name.");
        const { error } = await db.from("app_secrets").upsert({ name: "chat_owner_name", value: name });
        if (error) throw error;
        secretCache = null;
        return json({ ok: true });
      }
      // The rest act on one chat
      const room = await getRoom(String(url.searchParams.get("room") || body.room || ""));
      if (!room) return fail("That chat no longer exists.", 404);
      if (path === "/admin/decoy") {
        const { rows } = await messages(room.id, null, 0, true);
        return json({ opened_at: room.decoy_opened_at, messages: await shape(rows), script: decoyScript(room.id, room.created_at).slice(-12) });
      }
      if (path === "/admin/decoy/dismiss" && req.method === "POST") {
        await db.from("chat_rooms").update({ decoy_alert: false }).eq("id", room.id);
        return json({ ok: true });
      }
      if (path === "/admin/messages") {
        const { rows, more } = await messages(room.id, after, num("before"));
        if (!num("before") && (after === null || rows.length)) await markSeen(room, "owner", rows.length ? rows[rows.length - 1].id : await lastId(room.id));
        return json({ name: room.name, open: room.is_open, more, messages: await shape(rows), seen_id: room.guest_seen_id, guest_last_seen: room.guest_last_seen, decoy_alert: room.decoy_alert, decoy_opened_at: room.decoy_opened_at });
      }
      if (path === "/admin/send" && req.method === "POST") return await send(room, "owner", body);
      if (path === "/admin/upload-url" && req.method === "POST") return await uploadUrl(room, body);
      if (path === "/admin/message/delete" && req.method === "POST") {
        const { data: m } = await db.from("chat_messages").select("id,image_path").eq("id", num("id")).eq("room_id", room.id).maybeSingle();
        if (!m) return fail("That message has already gone.", 404);
        if (m.image_path) await db.storage.from(STORE).remove([m.image_path]);
        await db.from("chat_messages").delete().eq("id", m.id);
        return json({ ok: true });
      }
    }
    return fail("Not found.", 404);
  } catch (e) {
    console.error(e);
    return fail("Something went wrong on the server. Try again.", 500);
  }
});
