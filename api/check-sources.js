/**
 * GET /api/check-sources
 * ============================================================================
 * Runs monthly by Vercel Cron (see vercel.json). Reads data/sources.json and:
 *   - requests every source URL (once per unique URL)
 *   - flags links that are broken (404/410/5xx/timeouts)
 *   - flags pages where an optional "expect" phrase has disappeared
 *   - lists statistics whose "reviewBy" date has passed or is within 60 days
 * Then emails you a short report (always sent, so silence means the job broke).
 *
 * Some publishers (Ofcom, Verizon, ACM, Science) block automated requests.
 * A 401/403/429 is reported as "blocked - check by hand", not as broken.
 *
 * ENV: CRON_SECRET (same one annual-purge uses), RESEND_API_KEY, SENDER_EMAIL,
 *      INTERNAL_NOTIFY_EMAIL.
 * ============================================================================
 */
const { Resend } = require('resend');
const data = require('../data/sources.json');

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER = process.env.SENDER_EMAIL || 'Online Ready <hello@abity.co.uk>';
const TO = process.env.INTERNAL_NOTIFY_EMAIL || 'chriseccles001@gmail.com';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function check(url, expect) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OnlineReadySourceCheck/1.0; +https://abity.co.uk)' }
    });
    if ([401, 403, 429].includes(r.status)) return { status: 'blocked', note: 'HTTP ' + r.status };
    if (!r.ok) return { status: 'broken', note: 'HTTP ' + r.status };
    if (expect && /html|text/.test(r.headers.get('content-type') || '')) {
      const body = (await r.text()).toLowerCase();
      if (!body.includes(expect.toLowerCase())) return { status: 'changed', note: 'page no longer contains "' + expect + '"' };
    }
    return { status: 'ok', note: 'HTTP ' + r.status };
  } catch (e) {
    return { status: 'broken', note: e.name === 'AbortError' ? 'timed out' : String(e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

module.exports = async (req, res) => {
  const auth = req.headers['authorization'] || '';
  if (!process.env.CRON_SECRET || auth !== 'Bearer ' + process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorised' });
    return;
  }

  const items = [].concat(
    data.stats.map(s => ({ label: s.figure + ' - ' + s.claim, url: s.url, expect: s.expect })),
    data.references.map(r => ({ label: r.title, url: r.url }))
  );
  const byUrl = new Map();
  items.forEach(i => { const k = i.url; if (!byUrl.has(k)) byUrl.set(k, i); });

  const results = [];
  for (const [url, i] of byUrl) {
    const r = await check(url, i.expect);
    results.push(Object.assign({ url, label: i.label }, r));
  }

  const today = new Date();
  const soon = new Date(today.getTime() + 60 * 86400000);
  const due = data.stats.filter(s => s.reviewBy && new Date(s.reviewBy) <= soon);

  const bad = results.filter(r => r.status === 'broken' || r.status === 'changed');
  const blocked = results.filter(r => r.status === 'blocked');
  const ok = results.filter(r => r.status === 'ok');

  const list = (arr, fn) => arr.length ? '<ul>' + arr.map(fn).join('') + '</ul>' : '<p>None.</p>';
  const html =
    '<h2>Source check - ' + today.toISOString().slice(0, 10) + '</h2>' +
    '<p>' + ok.length + ' links fine, ' + bad.length + ' need attention, ' + blocked.length + ' blocked automated checks (open them by hand).</p>' +
    '<h3>Needs attention</h3>' + list(bad, r => '<li><a href="' + esc(r.url) + '">' + esc(r.label) + '</a> - ' + esc(r.note) + '</li>') +
    '<h3>Review due (within 60 days or overdue)</h3>' + list(due, s => '<li>' + esc(s.figure) + ' - ' + esc(s.claim) + ' (review by ' + esc(s.reviewBy) + ', <a href="' + esc(s.url) + '">source</a>)</li>') +
    '<h3>Blocked - check by hand occasionally</h3>' + list(blocked, r => '<li><a href="' + esc(r.url) + '">' + esc(r.label) + '</a> - ' + esc(r.note) + '</li>') +
    '<p style="color:#666">To update a figure: edit data/sources.json, course.html and index.html, then run node scripts/build-sources.js.</p>';

  try {
    await resend.emails.send({
      from: SENDER,
      to: TO,
      subject: (bad.length || due.length ? 'Action needed: ' : 'All fine: ') + 'Online Ready source check',
      html
    });
  } catch (e) {
    res.status(500).json({ error: 'Report email failed', detail: String(e.message || e) });
    return;
  }
  res.status(200).json({ ok: ok.length, attention: bad.length, blocked: blocked.length, due: due.length });
};
