/**
 * GET /api/admin-orders
 * ============================================================================
 * Read-only endpoint for the admin dashboard (admin.html) - lets you see every
 * order, who's paid and who hasn't, and overall seat usage, without opening
 * the Supabase dashboard by hand.
 *
 * Protected by TWO shared secrets - admin.html asks for both passwords and
 * sends them joined as "password1::password2" in the "x-admin-key" header.
 * This is deliberately simple (no login system) since it's just you using it -
 * but both keys must still be set as real env vars, not left blank.
 *
 * ENVIRONMENT VARIABLES THIS NEEDS (Vercel -> Settings -> Environment Variables):
 *   ADMIN_SECRET                - the first password.
 *   ADMIN_SECRET_2               - the second password. Both are required.
 *   (Also reuses SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY - already set for
 *   /api/create-order.)
 * ============================================================================
 */
const { createClient } = require('@supabase/supabase-js');
const { requireAdminAuth } = require('./_lib/adminAuth');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  // Two-password gate + rate limiting + constant-time comparison - all
  // shared logic, see api/_lib/adminAuth.js.
  if (!(await requireAdminAuth(req, res, supabase))) return;

  try {
    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('id, created_at, invoice_number, teacher_name, teacher_email, school_name, finance_email, pricing_option, seats_requested, po_number, payment_ref, payment_received_at, license_code')
      .order('created_at', { ascending: false });
    if (ordersErr) throw ordersErr;

    // Pull seats_used per licence code so the dashboard can show how much of
    // what was ordered has actually been handed out to students.
    const codes = (orders || []).map(o => o.license_code).filter(Boolean);
    let usageByCode = {};
    if (codes.length) {
      const { data: licenses } = await supabase
        .from('license_keys')
        .select('code, seats_allowed, seats_used, dsl_team, trust_id')
        .in('code', codes);
      (licenses || []).forEach(l => { usageByCode[l.code] = { seats_allowed: l.seats_allowed, seats_used: l.seats_used, dsl_team: l.dsl_team, trust_id: l.trust_id }; });

      // A trust order covers every school in the trust, so show the trust-wide
      // numbers (seats bought vs seats used across all its schools), not just
      // the first school's slice of it.
      const trustIds = Array.from(new Set((licenses || []).map(l => l.trust_id).filter(Boolean)));
      if (trustIds.length) {
        const [{ data: trusts }, { data: members }] = await Promise.all([
          supabase.from('trusts').select('id, seats_allocated').in('id', trustIds),
          supabase.from('license_keys').select('trust_id, seats_used').in('trust_id', trustIds)
        ]);
        const allocated = {}, used = {}, schools = {};
        (trusts || []).forEach(t => { allocated[t.id] = t.seats_allocated; });
        (members || []).forEach(m => { used[m.trust_id] = (used[m.trust_id] || 0) + (m.seats_used || 0); schools[m.trust_id] = (schools[m.trust_id] || 0) + 1; });
        Object.keys(usageByCode).forEach(c => {
          const u = usageByCode[c];
          if (u.trust_id) { u.seats_allowed = allocated[u.trust_id]; u.seats_used = used[u.trust_id] || 0; u.trust_schools = schools[u.trust_id] || 0; }
        });
      }
    }

    const rows = (orders || []).map(o => ({
      ...o,
      seats_allowed: usageByCode[o.license_code] ? usageByCode[o.license_code].seats_allowed : null,
      seats_used: usageByCode[o.license_code] ? usageByCode[o.license_code].seats_used : null,
      trust_schools: usageByCode[o.license_code] ? (usageByCode[o.license_code].trust_schools || null) : null,
      dsl_team: usageByCode[o.license_code] ? (usageByCode[o.license_code].dsl_team || []) : []
    }));

    const summary = {
      totalOrders: rows.length,
      paidOrders: rows.filter(r => r.payment_received_at).length,
      unpaidOrders: rows.filter(r => !r.payment_received_at).length,
      totalSeatsRequested: rows.reduce((sum, r) => sum + (Number(r.seats_requested) || 0), 0)
    };

    res.status(200).json({ orders: rows, summary });
  } catch (err) {
    console.error('admin-orders failed:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
};
