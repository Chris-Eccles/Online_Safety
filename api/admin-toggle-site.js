/**
 * POST /api/admin-toggle-site  (also handles the orders on/off switch)
 * ============================================================================
 * Switches the whole marketing site "offline" - every page that loads
 * js/script.js (home, order, curriculum, privacy, security, gdpr, cookies,
 * terms, for-teachers, verify) redirects to /404.html instead of showing
 * its real content. Deliberately does NOT touch course.html, dashboard.html,
 * mat-dashboard.html or admin.html - none of those load script.js, so
 * existing schools and students already using the course are completely
 * unaffected. This is for hiding the public-facing site before launch, not
 * for taking the whole product down.
 *
 * Protected the same way as the rest of admin.html - "x-admin-key" header
 * must match ADMIN_SECRET.
 * ============================================================================
 */
const { createClient } = require('@supabase/supabase-js');
const { requireAdminAuth } = require('./_lib/adminAuth');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  // Two-password gate + rate limiting + constant-time comparison - all
  // shared logic, see api/_lib/adminAuth.js.
  if (!(await requireAdminAuth(req, res, supabase))) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    // One endpoint for both switches (Vercel's free plan allows only 12 functions):
    //   { offline: true/false } -> takes the whole site offline / back online
    //   { paused:  true/false } -> stops / resumes taking new orders
    const update = { updated_at: new Date().toISOString() };
    if (typeof body.offline === 'boolean') update.site_offline = body.offline;
    if (typeof body.paused === 'boolean') update.orders_paused = body.paused;
    if (Object.keys(update).length === 1) {
      res.status(400).json({ error: 'Send offline or paused as true/false.' });
      return;
    }

    const { error } = await supabase.from('site_settings').update(update).eq('id', true);
    if (error) throw error;

    res.status(200).json({ ok: true, siteOffline: update.site_offline, ordersPaused: update.orders_paused });
  } catch (err) {
    console.error('admin-toggle-site failed:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
};
