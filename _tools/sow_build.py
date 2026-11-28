"""Turn the J277 two-year scheme of work (xlsx) into sow/gcse2.json for the admin: python3 _tools/sow_build.py
Lessons get ids like y10-t1-l08. Homework rows come from the Homework 10 / Homework 11 sheets."""
import json, os, re, openpyxl
HERE = os.path.dirname(os.path.abspath(__file__))
wb = openpyxl.load_workbook(os.path.join(HERE, "J277-Scheme-of-Work.xlsx"), data_only=True)
def clean(v): return "" if v is None else re.sub(r"\s+", " ", str(v)).strip()
out = {"course": "gcse2", "title": "GCSE Computer Science (OCR J277), two-year", "years": {}}
for y in (10, 11):
    lessons, terms = [], {}
    for r in wb[f"Year {y}"].iter_rows(values_only=True):
        c = [clean(x) for x in r[:10]]
        if c[0].startswith("Term ") and ":" in c[0] and not c[1]: terms[int(c[0].split()[1].rstrip(":"))] = c[0].split(":", 1)[1].strip()
        if not (c[0].isdigit() and c[1].isdigit() and c[2].isdigit()): continue
        t, w, l = int(c[0]), int(c[1]), int(c[2])
        lessons.append({"id": f"y{y}-t{t}-l{l:02d}", "term": t, "week": w, "lesson": l, "focus": c[3], "spec": c[4], "topic": c[5],
                        "prep": c[6], "lab": c[7], "feeds": c[8], "notes": c[9],
                        "kind": "assess" if c[5] in ("Assessment",) else "dirt" if c[5].startswith("Feedback") else "lesson"})
    hws = []
    for r in wb[f"Homework {y}"].iter_rows(values_only=True):
        c = [clean(x) for x in r[:8]]
        if not (c[0].isdigit() and c[1].isdigit()): continue
        hws.append({"id": f"y{y}-t{c[0]}-w{c[1]}", "term": int(c[0]), "week": int(c[1]), "type": c[2], "new": c[3], "recent": c[4], "distant": c[5], "interleaved": c[6], "notes": c[7]})
    out["years"][str(y)] = {"terms": {str(k): v for k, v in terms.items()}, "lessons": lessons, "homework": hws}
json.dump(out, open(os.path.join(HERE, "..", "sow", "gcse2.json"), "w"), ensure_ascii=False, indent=0)
for y, d in out["years"].items(): print(y, len(d["lessons"]), "lessons", len(d["homework"]), "homeworks", d["terms"])
