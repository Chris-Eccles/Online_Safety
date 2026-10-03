/**
 * GET/POST /api/annual-purge
 * ============================================================================
 * Runs automatically by Vercel Cron every September 1st (see vercel.json
 * "crons"). Two separate things happen here, for two separate reasons:
 *
 * 1. GDPR data minimisation (unconditional, every school, paid or not):
 *    every student_records row - names, PINs, progress, encrypted
 *    reflections - is wiped, along with their reflections PDFs in storage.
 *    Nothing personal about a student is kept longer than one academic year.
 *
 * 2. Seat allocation reset (NOT the same thing as the above - this is a
 *    billing/anti-abuse rule, not a privacy one):
 *      - PAID licences (seat_type = 'paid') roll over: the licence row,
 *        class code, dashboard token and seats_allowed all survive
 *        untouched. Only seats_used resets to 0, since every student that
 *        used one up just got wiped in step 1 anyway - the school keeps the
 *        same code and the same seat count ready for the new year.
 *      - FREE licences (seat_type = 'free', i.e. created with a discount
 *        code such as FREE) are deleted entirely, however large
 *        seats_allowed was set to. This is what stops someone requesting a
 *        huge number of free seats with the intention of just holding onto
 *        that allocation forever - any unused free seats simply don't exist
 *        come September, and the school would need to place a fresh order
 *        (free or paid) to continue.
 *    Trusts (MATs) follow the same split: a free trust is deleted, a paid
 *    trust's row (and its seats_allocated) survives unchanged.
 *
 * What survives regardless: `orders` rows with no payment_received_at yet
 * (so you don't lose track of money owed to you).
 *
 * Paid orders are archived as a CSV emailed to you BEFORE being deleted,
 * since HMRC bookkeeping requirements are separate from GDPR data
 * minimisation - you keep an accounting record without keeping personal data
 * sitting in the live database indefinitely.
 *
 * Storage cleanup: every reflections PDF is deleted (tied 1:1 to the
 * student_records wipe above). DSL/safeguarding-team photos are only
 * deleted for licences that are themselves being removed (free ones) - a
 * paid school's dashboard and course carousel keep working, so their DSL
 * photos must NOT be deleted.
 *
 * ENVIRONMENT VARIABLES THIS NEEDS (Vercel -> Settings -> Environment Variables):
 *   CRON_SECRET                - any random string. Vercel automatically sends
 *                                 it as "Authorization: Bearer <value>" on every
 *                                 scheduled Cron invocation once this is set, so
 *                                 this endpoint can tell a real Cron trigger apart
 *                                 from anyone else who finds the URL.
 *   (Also reuses RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   SENDER_EMAIL, INTERNAL_NOTIFY_EMAIL - already set for /api/create-order.)
 *
 * TESTING: call this URL yourself with the same Authorization header and
 * ?dryRun=true - it reports exactly what it WOULD delete/archive/reset without
 * touching anything or sending any email. Only drop dryRun once you're happy
 * with what a dry run reports.
 * ============================================================================
 */
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SENDER = process.env.SENDER_EMAIL || 'Online Ready <hello@abity.co.uk>';
const INTERNAL_NOTIFY_EMAIL = process.env.INTERNAL_NOTIFY_EMAIL || 'chriseccles001@gmail.com';

function toCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const esc = v => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}

async function emptyStorageFolder(bucket, folder) {
  const { data: files, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000 });
  if (error) throw new Error('Could not list ' + bucket + (folder ? '/' + folder : '') + ': ' + error.message);
  if (!files || files.length === 0) return 0;
  const paths = files.map(f => (folder ? folder + '/' : '') + f.name);
  const { error: rmErr } = await supabase.storage.from(bucket).remove(paths);
  if (rmErr) throw new Error('Could not delete from ' + bucket + ': ' + rmErr.message);
  return paths.length;
}

/** Pulls the storage object path back out of a public Supabase storage URL, e.g.
 * ".../storage/v1/object/public/dsl-photos/abc123.jpg" -> "abc123.jpg". Returns
 * null for anything that doesn't look like a URL in this bucket (best-effort only -
 * DSL photos are staff photos, not the sensitive student data this job exists for). */
function storagePathFromUrl(url, bucket) {
  if (!url || typeof url !== 'string') return null;
  const marker = '/object/public/' + bucket + '/';
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length));
}

async function sendSummaryEmail(subject, html, attachments) {
  try {
    await resend.emails.send({ from: SENDER, to: INTERNAL_NOTIFY_EMAIL, subject, html, attachments });
  } catch (e) {
    console.error('annual-purge: notification email failed:', e.message);
  }
}

module.exports = async (req, res) => {
  const auth = req.headers['authorization'];
  if (!process.env.CRON_SECRET || auth !== 'Bearer ' + process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const dryRun = req.query && (req.query.dryRun === 'true' || req.query.dryRun === '1');
  const summary = { dryRun, startedAt: new Date().toISOString() };

  try {
    // 1. Snapshot every paid order in full, before touching anything.
    const { data: paidOrders, error: paidErr } = await supabase
      .from('orders').select('*').not('payment_received_at', 'is', null);
    if (paidErr) throw new Error('Could not read paid orders: ' + paidErr.message);
    summary.paidOrdersToArchive = paidOrders ? paidOrders.length : 0;

    // 2. Licences and trusts, split by seat_type - this is the thing that decides
    // what rolls over (paid) vs what gets removed outright (free).
    const { data: freeLicenses, error: flErr } = await supabase
      .from('license_keys').select('code, dsl_photo_url, dsl_team').eq('seat_type', 'free');
    if (flErr) throw new Error('Could not read free licences: ' + flErr.message);
    const { count: paidLicenseCount } = await supabase
      .from('license_keys').select('*', { count: 'exact', head: true }).eq('seat_type', 'paid');
    const { count: freeTrustCount } = await supabase
      .from('trusts').select('*', { count: 'exact', head: true }).eq('seat_type', 'free');
    const { count: paidTrustCount } = await supabase
      .from('trusts').select('*', { count: 'exact', head: true }).eq('seat_type', 'paid');

    summary.freeLicensesToDelete = freeLicenses ? freeLicenses.length : 0;
    summary.paidLicensesToRollOver = paidLicenseCount || 0;
    summary.freeTrustsToDelete = freeTrustCount || 0;
    summary.paidTrustsToRollOver = paidTrustCount || 0;

    // 3. Counts, for the report either way.
    const { count: studentCount } = await supabase.from('student_records').select('*', { count: 'exact', head: true });
    const { data: unpaidOrders } = await supabase.from('orders').select('id').is('payment_received_at', null);
    summary.studentRecordsToWipe = studentCount || 0;
    summary.unpaidOrdersKept = unpaidOrders ? unpaidOrders.length : 0;

    // 4. Which storage folders actually hold reflections PDFs, while the rows
    // that reference them still exist to tell us. All of these get wiped
    // regardless of free/paid, since they're tied to the student_records wipe.
    const { data: reflectionRows } = await supabase
      .from('student_records').select('license_code').not('reflections_pdf_path', 'is', null);
    const reflectionFolders = [...new Set((reflectionRows || []).map(r => r.license_code).filter(Boolean))];
    summary.reflectionFoldersFound = reflectionFolders.length;

    // DSL photos belonging ONLY to the free licences about to be deleted -
    // a paid school's photos must survive, since their licence/dashboard does too.
    const dslPhotoPaths = new Set();
    (freeLicenses || []).forEach(lic => {
      const p1 = storagePathFromUrl(lic.dsl_photo_url, 'dsl-photos');
      if (p1) dslPhotoPaths.add(p1);
      (lic.dsl_team || []).forEach(member => {
        const p2 = storagePathFromUrl(member && member.photoUrl, 'dsl-photos');
        if (p2) dslPhotoPaths.add(p2);
      });
    });
    summary.freeLicenseDslPhotosFound = dslPhotoPaths.size;

    if (dryRun) {
      summary.note = 'Dry run only - nothing was deleted, archived, or reset.';
      res.status(200).json(summary);
      return;
    }

    // 5. Archive paid orders BEFORE deleting anything, since this is the one
    // piece of data that genuinely needs to survive somewhere for accounting.
    if (paidOrders && paidOrders.length > 0) {
      const csv = toCsv(paidOrders);
      await sendSummaryEmail(
        'Online Ready — annual purge: ' + paidOrders.length + ' paid order(s) archived',
        '<p>Attached is every paid order on file, archived immediately before the annual data purge deletes it from the live database. Keep this file for your own accounting/HMRC records.</p>',
        [{ filename: 'paid-orders-archive-' + new Date().toISOString().slice(0, 10) + '.csv', content: Buffer.from(csv).toString('base64') }]
      );
    }

    // 6. Empty storage: all reflections PDFs (tied to the student wipe), and
    // only the DSL photos that belonged to a free licence now being removed.
    let reflectionsDeleted = 0;
    for (const folder of reflectionFolders) {
      reflectionsDeleted += await emptyStorageFolder('reflection-pdfs', folder);
    }
    summary.reflectionPdfsDeleted = reflectionsDeleted;

    let dslPhotosDeleted = 0;
    if (dslPhotoPaths.size > 0) {
      const { error: dslRmErr } = await supabase.storage.from('dsl-photos').remove([...dslPhotoPaths]);
      if (!dslRmErr) dslPhotosDeleted = dslPhotoPaths.size;
    }
    summary.dslPhotosDeleted = dslPhotosDeleted;

    // 7. Wipe all student data (GDPR - unconditional, every school).
    const { error: srErr } = await supabase.from('student_records').delete().not('id', 'is', null);
    if (srErr) throw new Error('Could not wipe student_records: ' + srErr.message);

    // 8. Licences: delete the free ones outright, reset usage (not allocation) on paid ones.
    const { error: delFreeLkErr } = await supabase.from('license_keys').delete().eq('seat_type', 'free');
    if (delFreeLkErr) throw new Error('Could not delete free license_keys: ' + delFreeLkErr.message);

    const { error: resetPaidLkErr } = await supabase.from('license_keys').update({ seats_used: 0 }).eq('seat_type', 'paid');
    if (resetPaidLkErr) throw new Error('Could not reset seats_used on paid license_keys: ' + resetPaidLkErr.message);

    // 9. Trusts: same split. A paid trust has no per-seat "used" count of its own
    // to reset (usage lives on its member license_keys, already handled above).
    const { error: delFreeTrustErr } = await supabase.from('trusts').delete().eq('seat_type', 'free');
    if (delFreeTrustErr) throw new Error('Could not delete free trusts: ' + delFreeTrustErr.message);

    if (paidOrders && paidOrders.length > 0) {
      const { error: ordErr } = await supabase.from('orders').delete().not('payment_received_at', 'is', null);
      if (ordErr) throw new Error('Could not delete archived paid orders: ' + ordErr.message);
    }

    summary.finishedAt = new Date().toISOString();

    await sendSummaryEmail(
      'Online Ready — annual data purge complete',
      '<pre style="font-family:monospace;font-size:13px;white-space:pre-wrap;">' + JSON.stringify(summary, null, 2) + '</pre>'
    );

    res.status(200).json(summary);
  } catch (err) {
    console.error('annual-purge failed:', err);
    summary.error = err.message || String(err);
    await sendSummaryEmail(
      'Online Ready — annual data purge FAILED',
      '<p>The annual purge failed partway through and needs manual attention - data may be partially wiped.</p>' +
      '<pre style="font-family:monospace;font-size:13px;white-space:pre-wrap;">' + JSON.stringify(summary, null, 2) + '</pre>'
    );
    res.status(500).json({ error: summary.error, summary });
  }
};
