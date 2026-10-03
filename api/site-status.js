/**
 * GET /api/site-status
 * ============================================================================
 * Public, read-only. Tells order.html (and anything else that cares) whether
 * new orders are currently switched on or paused. No secret needed to read
 * this - it's the same information a visitor can already see on the order
 * page itself, just exposed as JSON so the page can react to it.
 *
 * Toggled from admin.html (POST /api/admin-toggle-orders, ADMIN_SECRET-gated).
 * Defaults to PAUSED if the row is somehow missing, so a database hiccup
 * fails safe (no orders) rather than fails open (silently taking orders).
 * ============================================================================
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('orders_paused, paused_message, site_offline')
      .eq('id', true)
      .maybeSingle();

    if (error || !data) {
      res.status(200).json({ ordersPaused: true, pausedMessage: 'Orders are temporarily unavailable - please check back shortly.', siteOffline: false });
      return;
    }

    res.status(200).json({ ordersPaused: !!data.orders_paused, pausedMessage: data.paused_message, siteOffline: !!data.site_offline });
  } catch (err) {
    console.error('site-status failed:', err);
    res.status(200).json({ ordersPaused: true, pausedMessage: 'Orders are temporarily unavailable - please check back shortly.' });
  }
};
