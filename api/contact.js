/**
 * POST /api/contact
 * ============================================================================
 * Backs the themed "Contact us" box that appears on every page (see
 * js/script.js) instead of a plain mailto: link, which used to just kick
 * students/teachers out to whatever desktop mail app they had (or nothing,
 * on a school Chromebook with no mail client configured at all).
 *
 * Sends a plain notification email to you, and a short confirmation back to
 * whoever filled the form in, both via Resend - same provider/pattern as
 * /api/create-order.
 *
 * ENVIRONMENT VARIABLES THIS NEEDS: reuses RESEND_API_KEY, SENDER_EMAIL,
 * INTERNAL_NOTIFY_EMAIL - already set for /api/create-order.
 * ============================================================================
 */
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER = process.env.SENDER_EMAIL || 'Online Ready <hello@abity.co.uk>';
const INTERNAL_NOTIFY_EMAIL = process.env.INTERNAL_NOTIFY_EMAIL || 'chriseccles001@gmail.com';

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Rate limit by IP - each submission fires 2 real emails, so this stops a
  // script from flooding your inbox and burning through Resend's quota.
  const { createClient } = require('@supabase/supabase-js');
  const { checkRateLimit, clientIp } = require('./_lib/rateLimit');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const rl = await checkRateLimit(supabase, { bucket: 'contact:' + clientIp(req), limit: 5, windowSeconds: 1800 });
  if (!rl.allowed) {
    res.status(429).json({ error: 'Too many messages from this connection - please try again shortly.' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const name = (body.name || '').trim();
    const email = (body.email || '').trim();
    const message = (body.message || '').trim();

    if (!name || !email || !message) {
      res.status(400).json({ error: 'Name, email and message are all required.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'That email address doesn\'t look right.' });
      return;
    }

    await resend.emails.send({
      from: SENDER,
      to: INTERNAL_NOTIFY_EMAIL,
      replyTo: email,
      subject: 'Online Ready — message from ' + name,
      html: '<p><strong>From:</strong> ' + escapeHtml(name) + ' &lt;' + escapeHtml(email) + '&gt;</p>' +
        '<p>' + escapeHtml(message).replace(/\n/g, '<br>') + '</p>'
    });

    await resend.emails.send({
      from: SENDER,
      to: email,
      subject: 'We got your message — Online Ready',
      html: '<p>Hi ' + escapeHtml(name) + ',</p>' +
        '<p>Thanks for getting in touch - we\'ve got your message and will reply as soon as we can.</p>' +
        '<p style="color:#718096;font-size:13px;">What you sent us:</p>' +
        '<p style="color:#718096;font-size:13px;">' + escapeHtml(message).replace(/\n/g, '<br>') + '</p>'
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact failed:', err);
    res.status(500).json({ error: 'Something went wrong sending that - please try again.' });
  }
};
