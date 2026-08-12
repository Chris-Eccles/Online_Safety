/**
 * GET/POST /api/annual-purge
 * ============================================================================
 * Wipes essentially all personal data once a year, run automatically by
 * Vercel Cron every September 1st (see vercel.json "crons"). This is the
 * site's storage-limitation and right-to-erasure mechanism: nothing personal
 * is kept longer than roughly one academic year, no exceptions for schools
 * that haven't paid.
 *
 * What survives: only `orders` rows with no payment_received_at yet (so you
 * don't lose track of money owed to you). Everything else is deleted,
 * including the live class data (license_keys, student_records) for any
 * school that ordered but never paid - they'd need to place a fresh order to
 * continue, same as every other school does the following year anyway.
 *
 * Paid orders are archived as a CSV emailed to you BEFORE being deleted,
 * since HMRC bookkeeping requirements are separate from GDPR data
 * minimisation - you keep an accounting record without keeping personal data
 * sitting in the live database indefinitely.
 *
 * Storage cleanup: every file in the dsl-photos and reflection-pdfs buckets
 * is deleted too, not just the database rows that used to point at them -
 * otherwise the personal data would still physically exist, just orphaned.
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
 * ?dryRun=true - it reports exactly what it WOULD delete/archive without
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

    // 2. Counts, for the report either way.
    const { count: studentCount } = await supabase.from('student_records').select('*', { count: 'exact', head: true });
    const { count: licenseCount } = await supabase.from('license_keys').select('*', { count: 'exact', head: true });
    const { count: trustCount } = await supabase.from('trusts').select('*', { count: 'exact', head: true });
    const { data: unpaidOrders } = await supabase.from('orders').select('id').is('payment_received_at', null);
    summary.studentRecordsToWipe = studentCount || 0;
    summary.licenseKeysToWipe = licenseCount || 0;
    summary.trustsToWipe = trustCount || 0;
    summary.unpaidOrdersKept = unpaidOrders ? unpaidOrders.length : 0;

    // 3. Which storage folders actually hold reflections PDFs, while the rows
    // that reference them still exist to tell us.
    const { data: reflectionRows } = await supabase
      .from('student_records').select('license_code').not('reflections_pdf_path', 'is', null);
    const reflectionFolders = [...new Set((reflectionRows || []).map(r => r.license_code).filter(Boolean))];
    summary.reflectionFoldersFound = reflectionFolders.length;

    if (dryRun) {
      summary.note = 'Dry run only - nothing was deleted, archived, or emailed.';
      res.status(200).json(summary);
      return;
    }

    // 4. Archive paid orders BEFORE deleting anything, since this is the one
    // piece of data that genuinely needs to survive somewhere for accounting.
    if (paidOrders && paidOrders.length > 0) {
      const csv = toCsv(paidOrders);
      await sendSummaryEmail(
        'Online Ready — annual purge: ' + paidOrders.length + ' paid order(s) archived',
        '<p>Attached is every paid order on file, archived immediately before the annual data purge deletes it from the live database. Keep this file for your own accounting/HMRC records.</p>',
        [{ filename: 'paid-orders-archive-' + new Date().toISOString().slice(0, 10) + '.csv', content: Buffer.from(csv).toString('base64') }]
      );
    }

    // 5. Empty storage. dsl-photos is a flat bucket (no folders); reflection-pdfs
    // is one folder per class code.
    let dslPhotosDeleted = 0;
    dslPhotosDeleted = await emptyStorageFolder('dsl-photos', '');
    let reflectionsDeleted = 0;
    for (const folder of reflectionFolders) {
      reflectionsDeleted += await emptyStorageFolder('reflection-pdfs', folder);
    }
    summary.dslPhotosDeleted = dslPhotosDeleted;
    summary.reflectionPdfsDeleted = reflectionsDeleted;

    // 6. Wipe the tables. Children (student_records, license_keys) before
    // parents (trusts) doesn't strictly matter here since nothing cascades,
    // but keeping a sane order regardless.
    const { error: srErr } = await supabase.from('student_records').delete().not('id', 'is', null);
    if (srErr) throw new Error('Could not wipe student_records: ' + srErr.message);

    const { error: lkErr } = await supabase.from('license_keys').delete().not('code', 'is', null);
    if (lkErr) throw new Error('Could not wipe license_keys: ' + lkErr.message);

    const { error: trErr } = await supabase.from('trusts').delete().not('id', 'is', null);
    if (trErr) throw new Error('Could not wipe trusts: ' + trErr.message);

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
