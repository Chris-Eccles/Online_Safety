/**
 * Shared input checks for public endpoints. Everything a visitor can send is
 * untrusted: this keeps lengths, types and numbers inside sane limits so a
 * script can't stuff the database, spam inboxes, or smuggle markup/headers.
 */
const MAX_SEATS = 15000;

class ValidationError extends Error {}

/** Trimmed single-line string, control characters removed. Throws if too long. */
function line(v, label, { max = 150, required = true, min = 1 } = {}) {
  let s = typeof v === 'string' ? v : (v == null ? '' : String(v));
  s = s.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) { if (required) throw new ValidationError('Please fill in: ' + label + '.'); return ''; }
  if (s.length < min) throw new ValidationError(label + ' looks too short.');
  if (s.length > max) throw new ValidationError(label + ' is too long (max ' + max + ' characters).');
  return s;
}

/** Multi-line text (addresses). Keeps newlines, strips other control chars. */
function block(v, label, { max = 400, required = true, min = 1 } = {}) {
  let s = typeof v === 'string' ? v : '';
  s = s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F\u2028\u2029]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!s) { if (required) throw new ValidationError('Please fill in: ' + label + '.'); return ''; }
  if (s.length < min) throw new ValidationError(label + ' looks too short.');
  if (s.length > max) throw new ValidationError(label + ' is too long (max ' + max + ' characters).');
  return s;
}

function email(v, label) {
  const s = line(v, label, { max: 254 }).toLowerCase();
  if (!/^[^\s@<>"',;:()\[\]\\]+@[^\s@<>"',;:()\[\]\\]+\.[^\s@<>"',;:()\[\]\\]{2,}$/.test(s)) {
    throw new ValidationError('That ' + label + ' doesn\'t look right.');
  }
  return s;
}

/** Whole number 1..MAX_SEATS. Rejects decimals, negatives, NaN, exponents, huge values. */
function seats(v) {
  const raw = String(v == null ? '' : v).trim();
  if (!/^\d{1,6}$/.test(raw)) throw new ValidationError('Please enter the number of seats as a whole number.');
  const n = parseInt(raw, 10);
  if (n < 1) throw new ValidationError('Please request at least 1 seat.');
  if (n > MAX_SEATS) throw new ValidationError('The most you can order at one time is ' + MAX_SEATS.toLocaleString('en-GB') + ' seats. For more than that, please email hello@abity.co.uk.');
  return n;
}

/** Only accepts requests from our own site (blocks other websites' forms posting to us). */
function originOk(req) {
  const o = req.headers['origin'] || '';
  if (!o) return true; // non-browser clients: still rate-limited
  try {
    const h = new URL(o).hostname;
    return h === 'abity.co.uk' || h === 'www.abity.co.uk' || h === 'localhost' || h === '127.0.0.1' ||
      (h.endsWith('.vercel.app') && h.startsWith('online-safety'));
  } catch (e) { return false; }
}

/** Decodes a data: URL image, checking type, size and the file's real signature (not just its name). */
function image(dataUrl, { maxBytes = 1.5 * 1024 * 1024 } = {}) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new ValidationError('Photos must be JPEG, PNG or WebP images.');
  if (m[2].length > maxBytes * 1.4) throw new ValidationError('That photo is too large. Please use one under 1.5 MB.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > maxBytes) throw new ValidationError('That photo is too large. Please use one under 1.5 MB.');
  const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  const isPng = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
  const isWebp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  const type = m[1];
  if (!((type === 'image/jpeg' && isJpeg) || (type === 'image/png' && isPng) || (type === 'image/webp' && isWebp))) {
    throw new ValidationError('That file doesn\'t look like a real image.');
  }
  const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp';
  return { buffer: buf, contentType: type, ext };
}

module.exports = { ValidationError, MAX_SEATS, line, block, email, seats, originOk, image };
