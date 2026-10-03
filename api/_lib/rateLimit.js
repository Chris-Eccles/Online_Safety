/**
 * Shared rate-limit helper. Lives under api/_lib/ - Vercel treats anything
 * under an underscore-prefixed folder inside /api as a plain file, never a
 * route, so this is only ever reached via require(), never a public URL.
 *
 * Fixed window counter backed by Supabase (not in-memory - a serverless
 * function's memory doesn't persist between invocations, so an in-memory
 * counter would reset almost every request and protect nothing). The
 * increment itself happens inside a single Postgres function
 * (increment_rate_limit, see migration add_rate_limiting) so concurrent
 * requests can't race each other into both being "under the limit".
 *
 * Usage:
 *   const { checkRateLimit } = require('./_lib/rateLimit');
 *   const rl = await checkRateLimit(supabase, {
 *     bucket: 'admin:' + clientIp(req),
 *     limit: 20,
 *     windowSeconds: 600
 *   });
 *   if (!rl.allowed) { res.status(429).json({ error: 'Too many attempts - try again shortly.' }); return; }
 */

/** Best-effort caller IP from Vercel's forwarded header. Not spoof-proof
 * against someone behind a shared NAT/proxy, but there's nothing more
 * reliable available in a serverless function, and it's still a real
 * barrier against a single scripted attacker. */
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket && req.socket.remoteAddress || 'unknown';
}

async function checkRateLimit(supabase, { bucket, limit, windowSeconds }) {
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  try {
    const { data, error } = await supabase.rpc('increment_rate_limit', {
      p_bucket: bucket,
      p_window: windowStart
    });
    if (error) {
      // Fail OPEN on a DB hiccup - a broken rate limiter should never be the
      // reason a legitimate order/contact form stops working. It still logs,
      // so a persistent failure is visible.
      console.error('rateLimit check failed, allowing request:', error.message);
      return { allowed: true, count: 0 };
    }
    return { allowed: data <= limit, count: data };
  } catch (err) {
    console.error('rateLimit check threw, allowing request:', err.message);
    return { allowed: true, count: 0 };
  }
}

module.exports = { checkRateLimit, clientIp };
