/**
 * POST /api/dsl-photo   { token, photoDataUrl }
 * ============================================================================
 * Lets a school upload a safeguarding-team photo from its teacher dashboard.
 * The browser never writes to storage itself (the bucket is closed to
 * browsers); this endpoint checks the dashboard token belongs to a real
 * licence, checks the file really is a small JPEG/PNG/WebP, stores it under a
 * random name, and returns the public URL to save against the team member.
 * ============================================================================
 */
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const V = require('./_lib/validate');
const { checkRateLimit, clientIp } = require('./_lib/rateLimit');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!V.originOk(req)) { res.status(403).json({ error: 'Not allowed.' }); return; }

  const ipRl = await checkRateLimit(supabase, { bucket: 'dsl-photo-ip:' + clientIp(req), limit: 30, windowSeconds: 3600 });
  if (!ipRl.allowed) { res.status(429).json({ error: 'Too many uploads - please try again later.' }); return; }

  try {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch (e) { body = null; }
    const token = body && typeof body.token === 'string' ? body.token.trim() : '';
    if (!/^[0-9a-fA-F-]{36}$/.test(token)) { res.status(401).json({ error: 'Your dashboard link is not valid.' }); return; }

    const { data: lic } = await supabase.from('license_keys').select('code').eq('dashboard_token', token).maybeSingle();
    if (!lic) { res.status(401).json({ error: 'Your dashboard link is not valid.' }); return; }

    const tokRl = await checkRateLimit(supabase, { bucket: 'dsl-photo-lic:' + lic.code, limit: 20, windowSeconds: 3600 });
    if (!tokRl.allowed) { res.status(429).json({ error: 'Too many uploads for this school - please try again later.' }); return; }

    let img;
    try { img = V.image(body.photoDataUrl); }
    catch (e) {
      if (e instanceof V.ValidationError) { res.status(400).json({ error: e.message }); return; }
      throw e;
    }

    const path = crypto.randomUUID() + '.' + img.ext;
    const { error: upErr } = await supabase.storage.from('dsl-photos').upload(path, img.buffer, { contentType: img.contentType, upsert: false });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from('dsl-photos').getPublicUrl(path);
    res.status(200).json({ ok: true, url: pub.publicUrl });
  } catch (err) {
    console.error('dsl-photo failed:', err);
    res.status(500).json({ error: 'Could not upload that photo. Please try again.' });
  }
};
