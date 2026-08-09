#!/usr/bin/env python3
"""
Generates the two "provisioning" PDF documents for Online Ready (by Abity Academy):
  1. Teacher access/welcome PDF
  2. Finance / order details PDF

Edit the SCHOOL dict below (or wire it up to pull from Supabase) and rerun to
produce a fresh pair of PDFs for any school.
"""
import weasyprint
from datetime import date

TEACHER = {
    "teacher_name": "A. Teacher",
    "school_name": "Test School",
    "code": "TESTCODE",
    "seats_allowed": 30,
    "seats_used": 0,
    "site_url": "https://abity.co.uk",
}

FINANCE = {
    "is_sample": True,
    "school_name": "Example Secondary School",
    "teacher_name": "A. Teacher",
    "teacher_email": "teacher@example.sch.uk",
    "finance_email": "finance@example.sch.uk",
    "pricing_option": "per-student",
    "seats_requested": 210,
    "po_number": "PO-2026-0417",
    "request_date": date.today().strftime("%-d %B %Y"),
}

BRAND = {
    "green": "#1FA97C",
    "green_light": "#34D399",
    "navy": "#0A0E24",
    "ink": "#111827",
    "soft": "#5B6472",
    "border": "#E4E7EE",
    "bg_tint": "#F4FAF7",
}


def base_css():
    return f"""
    @page {{ size: A4; margin: 0; }}
    * {{ box-sizing: border-box; }}
    body {{
        margin: 0;
        font-family: 'Helvetica Neue', Arial, sans-serif;
        color: {BRAND['ink']};
        font-size: 10.3pt;
        line-height: 1.42;
    }}
    .header {{
        background: linear-gradient(135deg, {BRAND['navy']} 0%, #142055 100%);
        padding: 26px 44px 22px;
        color: #fff;
    }}
    .wordmark {{
        display: flex; align-items: center; gap: 10px;
        font-size: 19px; font-weight: 800; letter-spacing: -0.01em;
    }}
    .wordmark .tick {{
        display: inline-flex; align-items: center; justify-content: center;
        width: 24px; height: 24px; border-radius: 7px;
        background: {BRAND['green_light']}; color: #04241A;
        font-weight: 800; font-size: 14px;
    }}
    .header .doc-title {{ margin-top: 18px; font-size: 22px; font-weight: 800; }}
    .header .doc-sub {{ margin-top: 4px; font-size: 11pt; color: rgba(255,255,255,0.72); }}
    .content {{ padding: 24px 44px 6px; }}
    h2 {{ font-size: 12pt; margin: 0 0 6px; color: {BRAND['ink']}; }}
    p {{ margin: 0 0 8px; color: {BRAND['ink']}; }}
    .soft {{ color: {BRAND['soft']}; }}
    .card {{
        border: 1.4px solid {BRAND['border']}; border-radius: 12px;
        padding: 14px 20px; margin: 10px 0; background: {BRAND['bg_tint']};
    }}
    .code-chip {{
        display: inline-block; font-family: 'Courier New', monospace;
        font-weight: 700; font-size: 20px; letter-spacing: 0.06em;
        background: #fff; border: 1.6px dashed {BRAND['green']}; color: {BRAND['green']};
        border-radius: 9px; padding: 10px 20px; margin: 8px 0 4px;
    }}
    .link-line {{
        font-family: 'Courier New', monospace; font-size: 9.8pt;
        color: {BRAND['green']}; word-break: break-all;
    }}
    .seat-row {{ display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 10pt; }}
    .seat-bar {{ width: 100%; height: 8px; border-radius: 999px; background: #E4E7EE; margin-top: 8px; overflow: hidden; }}
    .seat-bar-fill {{ height: 100%; background: {BRAND['green']}; border-radius: 999px; }}
    ul {{ margin: 0 0 8px; padding-left: 20px; }}
    li {{ margin-bottom: 4px; }}
    table {{ width: 100%; border-collapse: collapse; margin: 4px 0 6px; }}
    td {{ padding: 6px 0; border-bottom: 1px solid {BRAND['border']}; font-size: 10.2pt; }}
    td.label {{ color: {BRAND['soft']}; width: 46%; }}
    td.value {{ font-weight: 700; text-align: right; }}
    tr.total td {{ border-bottom: none; border-top: 1.6px solid {BRAND['ink']}; padding-top: 12px; font-size: 12pt; }}
    .placeholder {{
        color: #B45309; background: #FFFBEB; border: 1px dashed #F59E0B;
        border-radius: 6px; padding: 1px 6px; font-size: 9.6pt;
    }}
    .sample-banner {{
        background: #FFF7ED; border: 1.4px solid #FDBA74; color: #9A3412;
        border-radius: 10px; padding: 10px 16px; font-size: 9.6pt; font-weight: 700; margin-bottom: 18px;
    }}
    .footer {{
        margin-top: 6px; padding: 8px 44px 12px; border-top: 1px solid {BRAND['border']};
        color: {BRAND['soft']}; font-size: 8.6pt; display: flex; justify-content: space-between;
    }}
    """


def render(path, title, sub, body_html, footer_note):
    html = f"""
    <html><head><meta charset="utf-8"><style>{base_css()}</style></head>
    <body>
      <div class="header">
        <div class="wordmark"><span class="tick">&#10003;</span>Online Ready</div>
        <div class="doc-title">{title}</div>
        <div class="doc-sub">{sub}</div>
      </div>
      <div class="content">
        {body_html}
      </div>
      <div class="footer">
        <span>Abity Academy &middot; Online Ready</span>
        <span>{footer_note}</span>
      </div>
    </body></html>
    """
    weasyprint.HTML(string=html).write_pdf(path)
    print("Wrote", path)


t = TEACHER
link = f"{t['site_url']}/cybersmart-academy.html?code={t['code']}"
seats_left = t["seats_allowed"] - t["seats_used"]
pct_used = round(100 * t["seats_used"] / t["seats_allowed"]) if t["seats_allowed"] else 0

teacher_body = f"""
<p>Hi {t['teacher_name']},</p>
<p><strong>{t['school_name']}</strong> is all set up on Online Ready &mdash; our
KCSIE-aligned online safety course for secondary students. Here's everything you
and your students need to get started.</p>

<div class="card">
  <h2>Your class code</h2>
  <div class="code-chip">{t['code']}</div>
  <p class="soft" style="margin-top:10px;">Students enter this code at
  <strong>abity.co.uk</strong> to join the course.</p>
</div>

<div class="card">
  <h2>Direct student link</h2>
  <p class="soft" style="margin-bottom:6px;">Share this link instead of the code and
  students skip straight to sign-in &mdash; handy for a form email, a QR code, or a
  VLE tile.</p>
  <div class="link-line">{link}</div>
</div>

<div class="card">
  <h2>Seats</h2>
  <div class="seat-row">
    <span><strong>{t['seats_used']} of {t['seats_allowed']}</strong> seats used</span>
    <span class="soft">{seats_left} remaining</span>
  </div>
  <div class="seat-bar"><div class="seat-bar-fill" style="width:{pct_used}%;"></div></div>
</div>

<h2>What happens next</h2>
<ul>
  <li>Share the code or link with your students &mdash; each student sets their own
  name and a 4-digit PIN the first time they join.</li>
  <li>Progress saves automatically in the browser as students complete each module,
  so they can pick up where they left off.</li>
  <li>On completion of all 7 modules, students can generate a certificate and email
  it to you directly from the course.</li>
  <li>Want your Designated Safeguarding Lead's name built into the course content
  automatically? Just reply to this email and we'll set it up.</li>
</ul>

<p class="soft">Questions any time &mdash; reply to this email or contact
<strong>hello@abity.co.uk</strong>.</p>
"""

render(
    "/sessions/gallant-bold-lovelace/mnt/outputs/teacher_access.pdf",
    "You're in &mdash; course access details",
    f"Online Ready for {t['school_name']}",
    teacher_body,
    "hello@abity.co.uk",
)


f = FINANCE
per_student = f["pricing_option"] == "per-student"
rate_label = "£1.00 / student / year" if per_student else "Whole-school flat rate (quoted separately)"
total_label = f"£{f['seats_requested']:,.2f}" if per_student else "Per quote"
sample_banner = (
    '<div class="sample-banner">SAMPLE DOCUMENT &mdash; built from example order data. '
    'Regenerate with the real order details before sending.</div>'
    if f["is_sample"] else ""
)

finance_body = f"""
{sample_banner}
<p>Hi there,</p>
<p><strong>{f['school_name']}</strong> has requested Online Ready licences via
Online Ready. Here are the order and payment details for your records.</p>

<div class="card">
  <h2>Order summary</h2>
  <table>
    <tr><td class="label">School</td><td class="value">{f['school_name']}</td></tr>
    <tr><td class="label">Requested by</td><td class="value">{f['teacher_name']}</td></tr>
    <tr><td class="label">Teacher email</td><td class="value">{f['teacher_email']}</td></tr>
    <tr><td class="label">Request date</td><td class="value">{f['request_date']}</td></tr>
    <tr><td class="label">Pricing plan</td><td class="value">{rate_label}</td></tr>
    <tr><td class="label">Seats requested</td><td class="value">{f['seats_requested']}</td></tr>
    <tr><td class="label">PO number</td><td class="value">{f['po_number'] or '&mdash;'}</td></tr>
    <tr class="total"><td class="label">Total due</td><td class="value">{total_label}</td></tr>
  </table>
</div>

<div class="card">
  <h2>Payment details</h2>
  <p class="soft" style="margin-bottom:10px;">Please pay by bank transfer using the
  reference <strong>{f['po_number'] or f['school_name']}</strong>.</p>
  <table>
    <tr><td class="label">Account name</td><td class="value"><span class="placeholder">Add account name</span></td></tr>
    <tr><td class="label">Sort code</td><td class="value"><span class="placeholder">Add sort code</span></td></tr>
    <tr><td class="label">Account number</td><td class="value"><span class="placeholder">Add account number</span></td></tr>
    <tr><td class="label">Company number</td><td class="value"><span class="placeholder">Add company number</span></td></tr>
  </table>
  <p class="soft" style="margin-top:10px;">Payment due within 30 days of invoice. Once
  received, licence access is confirmed by return email to the requesting teacher.</p>
</div>

<p class="soft">Any questions about this order, contact <strong>hello@abity.co.uk</strong>.</p>
"""

render(
    "/sessions/gallant-bold-lovelace/mnt/outputs/finance_details.pdf",
    "Order &amp; payment details",
    f"Online Ready &mdash; {f['school_name']}",
    finance_body,
    "hello@abity.co.uk",
)
