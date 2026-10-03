/**
 * Shared admin auth check, used by every api/admin-*.js endpoint. Lives under
 * api/_lib/ so Vercel never treats it as its own route.
 *
 * Two things this adds on top of the plain "do the two passwords match":
 *  1. Rate limiting - without this, an attacker could script unlimited
 *     guesses at ADMIN_SECRET/ADMIN_SECRET_2 with no slowdown at all. 15
 *     attempts per 10 minutes per IP is generous for a real admin typing a
 *     password wrong, but turns brute-forcing two long random secrets from
 *     "fast" into "impractical".
 *  2. Constant-time comparison - a plain `===` on strings can leak, via tiny
 *     timing differences, how many leading characters of a guess were
 *     correct. crypto.timingSafeEqual removes that signal. (In practice this
 *     is a hard attack to actually pull off over the internet, but it's a
 *     free fix, so there's no reason not to.)
 */
const crypto = require('crypto');
const { checkRateLimit, clientIp } = require('./rateLimit');

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) {
    // Compare something of equal length anyway, so a mismatched length
    // takes the same time as a mismatched value instead of returning early.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Call at the very top of every admin-*.js handler:
 *    if (!(await requireAdminAuth(req, res, supabase))) return;
 * It writes the 429/401 response itself on failure - the caller just needs
 * to stop. */
async function requireAdminAuth(req, res, supabase) {
  const ip = clientIp(req);
  const rl = await checkRateLimit(supabase, { bucket: 'admin-auth:' + ip, limit: 15, windowSeconds: 600 });
  if (!rl.allowed) {
    res.status(429).json({ error: 'Too many attempts from this connection - try again in a few minutes.' });
    return false;
  }

  const key = req.headers['x-admin-key'] || '';
  const parts = key.split('::');
  const secret1 = process.env.ADMIN_SECRET || '';
  const secret2 = process.env.ADMIN_SECRET_2 || '';
  const ok = parts.length === 2 && secret1 && secret2 &&
    timingSafeStringEqual(parts[0], secret1) &&
    timingSafeStringEqual(parts[1], secret2);

  if (!ok) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

module.exports = { requireAdminAuth, timingSafeStringEqual };
