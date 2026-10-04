/**
 * POST /api/verify-certificate   { id: "OR-ABC123-2026" }
 * Confirms whether a certificate ID is genuine. Only ever returns pass/fail,
 * the month it was issued, and the school - never a student's name, scores or
 * written answers. Rate limited so IDs can't be guessed in bulk.
 */
const { createClient } = require('@supabase/supabase-js');
const { checkRateLimit, clientIp } = require('./_lib/rateLimit');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const rl = await checkRateLimit(supabase, { bucket: 'verify:' + clientIp(req), limit: 20, windowSeconds: 600 });
    if (!rl.allowed) { res.status(429).json({ error: 'Too many checks from this connection. Please try again in a few minutes.' }); return; }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const id = String(body.id || '').trim().toUpperCase();
    // Full form OR-ABC123-2026. The short form OR-ABC123 is also accepted.
    const m = id.match(/^OR-([A-Z0-9]{6})(?:-(\d{4}))?$/);
    if (!m) { res.status(200).json({ valid: false, reason: 'format' }); return; }

    let q = supabase.from('issued_certificates').select('cert_id, issued_at, school_name');
    q = m[2] ? q.eq('cert_id', 'OR-' + m[1] + '-' + m[2]) : q.like('cert_id', 'OR-' + m[1] + '-%');
    const { data, error } = await q.limit(1);
    if (error) throw error;
    if (!data || !data.length) { res.status(200).json({ valid: false, reason: 'not_found' }); return; }
    const c = data[0];
    res.status(200).json({
      valid: true,
      certId: c.cert_id,
      issued: new Date(c.issued_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Europe/London' }),
      school: c.school_name || null
    });
  } catch (err) {
    console.error('verify-certificate failed:', err);
    res.status(500).json({ error: 'Could not check that just now. Please try again.' });
  }
};
