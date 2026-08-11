/**
 * POST /api/create-order
 * ============================================================================
 * Replaces the old mailto: flow entirely. When a school or MAT submits the
 * order form, this function:
 *   1. Generates a class code + dashboard token per teacher (and a trust +
 *      mat_dashboard_token if it's a MAT), and writes them to Supabase.
 *   2. Emails EVERY teacher their own "here are your logins" email via Resend
 *      (including the purchaser, who is always also set up as a teacher).
 *   3. If it's a MAT, additionally emails the purchaser their trust dashboard
 *      link, in a separate email from their own teacher login.
 *   4. Emails the finance contact an invoice notice.
 *
 * ENVIRONMENT VARIABLES THIS NEEDS (set these in Vercel → Settings → Environment
 * Variables, not in this file):
 *   RESEND_API_KEY            - from resend.com/api-keys
 *   SUPABASE_URL              - same project as the course app
 *   SUPABASE_SERVICE_ROLE_KEY - NOT the anon key. This function needs to write
 *                               license_keys/trusts rows directly, bypassing
 *                               RLS, so it uses the service role key. This key
 *                               must NEVER appear in any client-side file -
 *                               it belongs only here, server-side, as an env var.
 *   SENDER_EMAIL              - e.g. 'Online Ready <hello@post.abity.co.uk>' -
 *                               must be an address on a domain verified in
 *                               your Resend dashboard (Domains tab).
 * ============================================================================
 */
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SENDER = process.env.SENDER_EMAIL || 'Online Ready <hello@abity.co.uk>';
const SITE_URL = process.env.SITE_URL || 'https://www.abity.co.uk';

function randomToken() {
  return (require('crypto').randomUUID)();
}

/** Turns a school name into a short, readable, unique-ish class code, e.g.
 * "Maidstone Grammar School" -> "MGS-4821". Retries on collision. */
async function generateUniqueCode(schoolName) {
  const initials = (schoolName || 'SCH')
    .replace(/[^a-zA-Z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4) || 'SCH';

  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const candidate = initials + '-' + suffix;
    const { data } = await supabase.from('license_keys').select('code').eq('code', candidate).maybeSingle();
    if (!data) return candidate;
  }
  // Extremely unlikely fallback: fully random code
  return initials + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function teacherLoginEmailHtml({ teacherName, schoolName, code, dashboardToken, isMatMember, trustName }) {
  const dashboardUrl = SITE_URL.replace(/\/$/, '') + '/dashboard.html?token=' + encodeURIComponent(dashboardToken);
  const courseUrl = SITE_URL.replace(/\/$/, '') + '/course.html?code=' + encodeURIComponent(code);
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0F1B2D;">
      <h2 style="margin-bottom:4px;">Welcome to Online Ready${isMatMember ? ' — ' + trustName : ''}</h2>
      <p>Hi ${teacherName},</p>
      <p>Your seats for <strong>${schoolName}</strong> are set up. Here's everything you need:</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;"><strong>Your class code</strong></td><td style="padding:10px 0;border-bottom:1px solid #eee;font-family:monospace;font-size:16px;">${code}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;"><strong>Share this with students</strong></td><td style="padding:10px 0;border-bottom:1px solid #eee;">Write it on the board, or send the direct link below</td></tr>
      </table>
      <p><a href="${courseUrl}" style="display:inline-block;background:#00C9B1;color:#0F1B2D;padding:12px 22px;border-radius:30px;text-decoration:none;font-weight:bold;">Open a ready-made student link →</a></p>
      <p style="margin-top:28px;"><strong>Your teacher dashboard</strong> (see your students' progress, scores, and certificates):</p>
      <p><a href="${dashboardUrl}" style="color:#00C9B1;">${dashboardUrl}</a></p>
      <p style="font-size:13px;color:#718096;margin-top:24px;">Keep this email safe — your dashboard link is private to you. Don't share it with students; the class code above is the only thing they need.</p>
      <p style="font-size:13px;color:#718096;">Questions? Just reply to this email.</p>
    </div>
  `;
}

function matAdminEmailHtml({ teacherName, trustName, matDashboardToken }) {
  const matDashboardUrl = SITE_URL.replace(/\/$/, '') + '/mat-dashboard.html?token=' + encodeURIComponent(matDashboardToken);
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0F1B2D;">
      <h2 style="margin-bottom:4px;">Your trust dashboard for ${trustName}</h2>
      <p>Hi ${teacherName},</p>
      <p>Because you set up <strong>${trustName}</strong> as a Multi-Academy Trust, you get one additional thing beyond your own teacher login (sent separately): a trust-wide dashboard that sees every teacher's classes.</p>
      <p><a href="${matDashboardUrl}" style="display:inline-block;background:#00C9B1;color:#0F1B2D;padding:12px 22px;border-radius:30px;text-decoration:none;font-weight:bold;">Open your trust dashboard →</a></p>
      <p style="font-size:13px;color:#718096;margin-top:24px;">This link is only for whoever manages the trust account — please don't forward it to individual teachers. Each teacher gets their own separate login in their own email.</p>
    </div>
  `;
}

function financeEmailHtml({ schoolOrTrustName, seats, pricingLabel, po }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0F1B2D;">
      <h2>Invoice for ${schoolOrTrustName}</h2>
      <p>An order for Online Ready has just been placed for <strong>${schoolOrTrustName}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee;">Seats requested</td><td style="padding:8px 0;border-bottom:1px solid #eee;">${seats || 'to confirm'}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee;">Pricing</td><td style="padding:8px 0;border-bottom:1px solid #eee;">${pricingLabel}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee;">PO number</td><td style="padding:8px 0;border-bottom:1px solid #eee;">${po || 'n/a'}</td></tr>
      </table>
      <p>A formal invoice with bank transfer details will follow separately. If you have any questions in the meantime, just reply to this email.</p>
    </div>
  `;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const {
      orgType, teacherName, teacherEmail, schoolName, matName,
      financeEmail, pricingOption, seats, po, matTeachers,
      dslName, dslPhotoDataUrl, dslPhotoFilename, dslPhotoContentType
    } = body || {};

    if (!teacherName || !teacherEmail || !schoolName || !financeEmail) {
      res.status(400).json({ error: 'Missing required fields.' });
      return;
    }
    const isMat = orgType === 'mat';
    if (isMat && !matName) {
      res.status(400).json({ error: 'Trust name is required for a MAT sign-up.' });
      return;
    }

    const pricingLabel = pricingOption === 'whole-school'
      ? 'Whole ' + (isMat ? 'trust' : 'school') + ' flat rate (quote to follow)'
      : 'Per student (£1/seat)';

    let trustId = null;
    let matDashboardToken = null;

    // Optional DSL photo, uploaded here server-side (service role) rather than
    // client-side, so order.html never needs its own Supabase credentials.
    let dslPhotoUrl = null;
    if (dslPhotoDataUrl) {
      try {
        const match = /^data:([^;]+);base64,(.+)$/.exec(dslPhotoDataUrl);
        const contentType = (match && match[1]) || dslPhotoContentType || 'image/jpeg';
        const base64 = match ? match[2] : dslPhotoDataUrl;
        const buffer = Buffer.from(base64, 'base64');
        const ext = ((dslPhotoFilename || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
        const { error: uploadErr } = await supabase.storage.from('dsl-photos').upload(path, buffer, {
          contentType, upsert: false
        });
        if (!uploadErr) {
          const { data: pub } = supabase.storage.from('dsl-photos').getPublicUrl(path);
          dslPhotoUrl = pub ? pub.publicUrl : null;
        } else {
          console.error('DSL photo upload failed:', uploadErr.message);
        }
      } catch (photoErr) {
        console.error('DSL photo processing failed:', photoErr.message);
      }
    }

    if (isMat) {
      matDashboardToken = randomToken();
      const { data: trust, error: trustErr } = await supabase
        .from('trusts')
        .insert({ trust_name: matName, mat_dashboard_token: matDashboardToken, seats_allocated: Number(seats) || 0 })
        .select('id')
        .single();
      if (trustErr) throw new Error('Could not create trust: ' + trustErr.message);
      trustId = trust.id;
    }

    // Build the full list of teachers to provision: the purchaser, plus any
    // additional teachers submitted in the MAT section of the form.
    const teacherList = [{ name: teacherName, email: teacherEmail, school: schoolName, isPurchaser: true }];
    if (isMat && Array.isArray(matTeachers)) {
      matTeachers.forEach(t => {
        if (t && t.name && t.email) teacherList.push({ name: t.name, email: t.email, school: t.school || matName, isPurchaser: false });
      });
    }

    const provisioned = [];
    for (const t of teacherList) {
      const code = await generateUniqueCode(t.school);
      const dashboardToken = randomToken();
      const { error: insertErr } = await supabase.from('license_keys').insert({
        code, dashboard_token: dashboardToken, trust_id: trustId,
        display_name: t.name, school_name: t.school,
        seats_allowed: isMat ? 0 : (Number(seats) || 0), // per-teacher seat split for a MAT is set later by hand
        seats_used: 0,
        // DSL info is collected once per order (for the purchaser's own school);
        // other MAT member schools can have theirs added later by replying to their email.
        dsl_name: t.isPurchaser ? (dslName || null) : null,
        dsl_photo_url: t.isPurchaser ? dslPhotoUrl : null
      });
      if (insertErr) throw new Error('Could not create class code for ' + t.name + ': ' + insertErr.message);
      provisioned.push({ ...t, code, dashboardToken });
    }

    // Send every teacher their own login email
    const emailResults = await Promise.allSettled(provisioned.map(t =>
      resend.emails.send({
        from: SENDER,
        to: t.email,
        subject: 'Your Online Ready login for ' + t.school,
        html: teacherLoginEmailHtml({
          teacherName: t.name, schoolName: t.school, code: t.code,
          dashboardToken: t.dashboardToken, isMatMember: isMat, trustName: matName
        })
      })
    ));

    // Purchaser gets a second, separate email with the trust-wide dashboard, if applicable
    if (isMat) {
      await resend.emails.send({
        from: SENDER,
        to: teacherEmail,
        subject: 'Your trust dashboard for ' + matName,
        html: matAdminEmailHtml({ teacherName, trustName: matName, matDashboardToken })
      });
    }

    // Finance gets the invoice notice
    await resend.emails.send({
      from: SENDER,
      to: financeEmail,
      subject: 'Invoice — Online Ready for ' + (isMat ? matName : schoolName),
      html: financeEmailHtml({ schoolOrTrustName: isMat ? matName : schoolName, seats, pricingLabel, po })
    });

    // Record the order itself for invoice + payment tracking. The Monzo
    // webhook (a Supabase Edge Function) matches incoming bank transfers
    // against unpaid rows here by PO number or school/trust name.
    try {
      await supabase.from('orders').insert({
        teacher_name: teacherName,
        teacher_email: teacherEmail,
        school_name: isMat ? matName : schoolName,
        finance_email: financeEmail,
        pricing_option: pricingOption === 'whole-school' ? 'whole-school' : 'per-student',
        seats_requested: Number(seats) || 0,
        po_number: po || null,
        dsl_name: dslName || null,
        dsl_photo_url: dslPhotoUrl,
        license_code: provisioned[0] ? provisioned[0].code : null
      });
    } catch (orderErr) {
      // Non-fatal: the school is already provisioned and emailed at this point,
      // so a failure here should never surface as an error to the requester -
      // just log it for manual reconciliation.
      console.error('Could not record order for invoice tracking:', orderErr.message);
    }

    const failedEmails = emailResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value && r.value.error));
    res.status(200).json({
      ok: true,
      teachersProvisioned: provisioned.length,
      emailFailures: failedEmails.length
    });
  } catch (err) {
    console.error('create-order failed:', err);
    res.status(500).json({ error: err.message || 'Something went wrong setting up your account.' });
  }
};
