# abity.co.uk

The student site for Computer Science at Maidstone Grammar School. Stage 1: Key Stage 3 (Years 7–9).

Student route: site password → year → learning group, full name and group password → group page (Terms 1–6) → workbook.
Each workbook lesson opens only when it is switched on for that group in admin (`/admin`).

## Files

| File | What it is |
|---|---|
| `index.html` | Front door: site password, year, group, name, group password |
| `group.html` | A group's terms and projects, with each lesson shown open or locked |
| `ks3/level-up.html`, `ks3/pitch-it.html` | The Year 7 workbooks. Lessons 3–7 and the Workshop are encrypted in the page; the key for a lesson is sent only when it is switched on for the student's group |
| `admin.html` | Lesson switches per group (or whole year), groups and their passwords, site and admin passwords, links to CPD and Teach Tools |
| `api.js` | Calls the database and keeps this device's sign-in (name stays on the device) |
| `site.css`, `ks3/fonts.css`, `fonts/`, `brand/` | Look, self-hosted fonts and MGS logos |
| `privacy.html` | Privacy notice |

## Back end

Supabase project "Abity CPD" (London), schema `abity` (not exposed). The browser calls five functions with the publishable key:
`site_gate`, `site_groups`, `site_join`, `site_state`, `site_admin`. Passwords for the site and admin are bcrypt-hashed in `abity.config`.
Lesson keys live in `abity.lessons`. No personal data is stored.

Adding a new KS3 project later: add the page under `ks3/`, then rows in `abity.items` and `abity.lessons`.

## Archive

The old front door (links to CS Online, CPD and Teach Tools) is on the `home-archive-2026-11` branch.
The Online Ready site is on `online-ready-archive`.
