/**
 * POST /api/create-order
 * ============================================================================
 * Replaces the old mailto: flow entirely. When a school or MAT submits the
 * order form, this function:
 *   1. Generates a class code + dashboard token per teacher (and a trust +
 *      mat_dashboard_token if it's a MAT), and writes them to Supabase.
 *   2. Records the order (gets back a real sequential invoice number).
 *   3. Emails EVERY teacher their own "here are your logins" email via Resend
 *      (including the purchaser, who is always also set up as a teacher) -
 *      the course link lands students on the name/PIN screen, never straight
 *      into a module; the dashboard link auto-signs the teacher in.
 *   4. If it's a MAT, additionally emails the purchaser their trust dashboard
 *      link, in a separate email from their own teacher login.
 *   5. Emails the finance contact a real, numbered invoice.
 *   6. Emails you (INTERNAL_NOTIFY_EMAIL) a quiet "a school just ordered"
 *      notice - never seen by the customer.
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
 *   SITE_URL                  - e.g. 'https://www.abity.co.uk'
 *
 * OPTIONAL - INVOICE / NOTIFICATIONS (safe to leave unset; the invoice email
 * shows an obvious placeholder wherever one of these is missing, so nothing
 * breaks, it just looks unfinished until you fill them in):
 *   INTERNAL_NOTIFY_EMAIL   - where YOU get told "a school just ordered".
 *                             Defaults to chriseccles001@gmail.com.
 *   INVOICE_BUSINESS_NAME   - the legal name that should appear on invoices,
 *                             e.g. 'Abity Academy Ltd' or your own name if
 *                             you're a sole trader.
 *   INVOICE_BUSINESS_ADDRESS- your registered/business address, one line
 *                             (use <br> for line breaks if you want more than one).
 *   INVOICE_COMPANY_NUMBER  - Companies House number. Leave unset if you're
 *                             a sole trader - the line is omitted entirely.
 *   INVOICE_VAT_NUMBER      - only set this if you're VAT-registered; the
 *                             VAT line is omitted entirely if unset.
 *   INVOICE_BANK_DETAILS    - how schools should actually pay you, e.g.
 *                             'Account name: ...<br>Sort code: XX-XX-XX<br>Account number: XXXXXXXX'.
 *                             This is sensitive - set it only here as an env
 *                             var, never commit it to the repo.
 * ============================================================================
 */
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SENDER = process.env.SENDER_EMAIL || 'Online Ready <hello@abity.co.uk>';
const SITE_URL = process.env.SITE_URL || 'https://www.abity.co.uk';
const INTERNAL_NOTIFY_EMAIL = process.env.INTERNAL_NOTIFY_EMAIL || 'chriseccles001@gmail.com';

const INVOICE = {
  businessName: process.env.INVOICE_BUSINESS_NAME || '[Add your legal business name - INVOICE_BUSINESS_NAME]',
  address: process.env.INVOICE_BUSINESS_ADDRESS || '[Add your business address - INVOICE_BUSINESS_ADDRESS]',
  companyNumber: process.env.INVOICE_COMPANY_NUMBER || '',
  vatNumber: process.env.INVOICE_VAT_NUMBER || '',
  bankDetails: process.env.INVOICE_BANK_DETAILS || '[Add payment details - INVOICE_BANK_DETAILS - reply to this email in the meantime and we\'ll send them separately]'
};

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

function financeEmailHtml({ schoolOrTrustName, financeEmail, seats, pricingOption, pricingLabel, po, invoiceNumber, invoiceDate }) {
  const isPerStudent = pricingOption !== 'whole-school';
  const unitPrice = 1; // £1 per seat, per year
  const seatCount = Number(seats) || 0;
  const total = isPerStudent ? (unitPrice * seatCount) : null;
  const reference = po || (invoiceNumber ? 'INV-' + invoiceNumber : schoolOrTrustName);

  const companyNumberRow = INVOICE.companyNumber
    ? `<p style="margin:2px 0;">Company number: ${INVOICE.companyNumber}</p>` : '';
  const vatRow = INVOICE.vatNumber
    ? `<p style="margin:2px 0;">VAT number: ${INVOICE.vatNumber}</p>` : '';

  const lineItemRow = isPerStudent
    ? `<tr>
         <td style="padding:10px 0;border-bottom:1px solid #eee;">Online Ready — per-student annual licence</td>
         <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:center;">${seatCount}</td>
         <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;">£${unitPrice.toFixed(2)}</td>
         <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;">£${total.toFixed(2)}</td>
       </tr>`
    : `<tr>
         <td style="padding:10px 0;border-bottom:1px solid #eee;" colspan="3">Online Ready — whole-school/trust flat rate (${seatCount || 'to confirm'} seats requested)</td>
         <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;">Quote to follow</td>
       </tr>`;

  const totalRow = isPerStudent
    ? `<tr>
         <td colspan="3" style="padding:10px 0;text-align:right;font-weight:bold;">Total due</td>
         <td style="padding:10px 0;text-align:right;font-weight:bold;">£${total.toFixed(2)}</td>
       </tr>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F1B2D;">
      <table style="width:100%;margin-bottom:20px;">
        <tr>
          <td>
            <h2 style="margin:0;">Invoice</h2>
            <p style="margin:2px 0;color:#718096;">${invoiceNumber ? 'INV-' + invoiceNumber : 'Reference: ' + reference}</p>
          </td>
          <td style="text-align:right;color:#718096;">
            <p style="margin:2px 0;">Date: ${invoiceDate}</p>
          </td>
        </tr>
      </table>

      <table style="width:100%;margin-bottom:24px;">
        <tr>
          <td style="vertical-align:top;width:50%;">
            <p style="margin:0 0 4px;font-weight:bold;">From</p>
            <p style="margin:2px 0;">${INVOICE.businessName}</p>
            <p style="margin:2px 0;">${INVOICE.address}</p>
            ${companyNumberRow}
            ${vatRow}
          </td>
          <td style="vertical-align:top;width:50%;">
            <p style="margin:0 0 4px;font-weight:bold;">Bill to</p>
            <p style="margin:2px 0;">${schoolOrTrustName}</p>
            <p style="margin:2px 0;">${financeEmail}</p>
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px 0;border-bottom:2px solid #0F1B2D;">Description</th>
            <th style="text-align:center;padding:8px 0;border-bottom:2px solid #0F1B2D;">Qty</th>
            <th style="text-align:right;padding:8px 0;border-bottom:2px solid #0F1B2D;">Unit price</th>
            <th style="text-align:right;padding:8px 0;border-bottom:2px solid #0F1B2D;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemRow}
        </tbody>
        <tfoot>
          ${totalRow}
        </tfoot>
      </table>

      <div style="background:#F7F9FC;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
        <p style="margin:0 0 6px;font-weight:bold;">How to pay</p>
        <p style="margin:2px 0;">${INVOICE.bankDetails}</p>
        <p style="margin:8px 0 0;">Please use <strong>${reference}</strong> as your payment reference so we can match it up automatically.</p>
      </div>

      <p style="font-size:13px;color:#718096;">This confirms the order only — it isn't a legal advice document. Any questions, just reply to this email.</p>
    </div>
  `;
}

function internalNotifyEmailHtml({ schoolOrTrustName, seats, pricingLabel, teacherName, teacherEmail, financeEmail, po, isMat, invoiceNumber }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0F1B2D;">
      <h2 style="margin-bottom:4px;">New order: ${schoolOrTrustName}</h2>
      <p>${seats || '0'} seats · ${pricingLabel}${isMat ? ' · MAT' : ''}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        <tr><td style="padding:6px 0;border-bottom:1px solid #eee;">Teacher</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${teacherName} (${teacherEmail})</td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px solid #eee;">Finance contact</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${financeEmail}</td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px solid #eee;">PO number</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${po || 'n/a'}</td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px solid #eee;">Invoice</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${invoiceNumber ? 'INV-' + invoiceNumber : 'not recorded'}</td></tr>
      </table>
      <p style="font-size:12.5px;color:#718096;">Automatic notification - not sent to the customer.</p>
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

    // Record the order first (before sending the invoice) so we have a real,
    // sequential invoice number to put on the finance email. The Monzo webhook
    // (a Supabase Edge Function) later matches incoming bank transfers against
    // unpaid rows here by PO number or school/trust name.
    let invoiceNumber = null;
    try {
      const { data: orderRow, error: orderInsertErr } = await supabase.from('orders').insert({
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
      }).select('invoice_number').single();
      if (orderInsertErr) throw orderInsertErr;
      invoiceNumber = orderRow ? orderRow.invoice_number : null;
    } catch (orderErr) {
      // Non-fatal: still provision and email the school even if we can't record
      // the order row - just means the invoice email won't have a real number
      // and this order needs manual reconciliation later.
      console.error('Could not record order for invoice tracking:', orderErr.message);
    }
    const invoiceDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

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

    // Finance gets the actual invoice
    await resend.emails.send({
      from: SENDER,
      to: financeEmail,
      subject: (invoiceNumber ? 'Invoice INV-' + invoiceNumber : 'Invoice') + ' — Online Ready for ' + (isMat ? matName : schoolName),
      html: financeEmailHtml({
        schoolOrTrustName: isMat ? matName : schoolName, financeEmail, seats,
        pricingOption, pricingLabel, po, invoiceNumber, invoiceDate
      })
    });

    // Quiet internal notification - never seen by the customer, just tells
    // you a school ordered without you needing to check the dashboard.
    try {
      await resend.emails.send({
        from: SENDER,
        to: INTERNAL_NOTIFY_EMAIL,
        subject: 'New order: ' + (isMat ? matName : schoolName) + ' (' + (Number(seats) || 0) + ' seats)',
        html: internalNotifyEmailHtml({
          schoolOrTrustName: isMat ? matName : schoolName, seats, pricingLabel,
          teacherName, teacherEmail, financeEmail, po, isMat, invoiceNumber
        })
      });
    } catch (notifyErr) {
      console.error('Internal notify email failed:', notifyErr.message);
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
