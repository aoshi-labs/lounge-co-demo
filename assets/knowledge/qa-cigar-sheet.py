#!/usr/bin/env python3
"""QA Cigar Research Tracker export vs cigar-corrections.json (rows 6–19 by SKU)."""
import csv
import json
import re
import urllib.request
from pathlib import Path

SHEET_URL = (
    "https://docs.google.com/spreadsheets/d/1mLHCA8rvvl5G87FJCxg5tkoDQ1Xp5FDx2QBm7Ty-WUU"
    "/gviz/tq?tqx=out:csv&sheet=Cigars"
)
CORRECTIONS = Path(__file__).parent / "cigar-corrections.json"

FIELD_MAP = {
    "wrapper": "Wrapper",
    "binder": "Binder",
    "filler": "Filler",
    "wrapperRole": "Wrapper Role",
    "binderRole": "Binder Role",
    "fillerRole": "Filler Role",
    "flavorNotes": "Flavor Notes",
    "bestFor": "Best For",
    "avoidIf": "Avoid If",
    "whyRecommend": "Why Recommend",
}


def fetch_rows():
    with urllib.request.urlopen(SHEET_URL) as resp:
        text = resp.read().decode("utf-8")
    return list(csv.reader(text.splitlines()))


def cell(row, col_name, col_index):
    i = col_index.get(col_name)
    if i is None or i >= len(row):
        return ""
    return (row[i] or "").strip()


def check_role_alignment(row_num, r, col_index):
    w, b, f = cell(r, "Wrapper", col_index), cell(r, "Binder", col_index), cell(
        r, "Filler", col_index
    )
    wr, br, fr = (
        cell(r, "Wrapper Role", col_index),
        cell(r, "Binder Role", col_index),
        cell(r, "Filler Role", col_index),
    )
    if not wr and not br and not fr:
        return []
    problems = []

    def missing(haystack, *needles):
        h = haystack.lower()
        return not any(n in h for n in needles)

    if w and wr:
        wl = w.lower()
        wrl = wr.lower()
        if "connecticut" in wl and "connecticut" not in wrl and "shade" not in wrl:
            problems.append("wrapper role missing Connecticut/shade")
        if "cameroon" in wl and "cameroon" not in wrl:
            problems.append("wrapper role missing Cameroon")
        if "san andr" in wl and "andr" not in wrl and "san" not in wrl:
            problems.append("wrapper role missing San Andrés")
        if "nicaraguan" in wl and "nicaragua" not in wrl:
            problems.append("wrapper role missing Nicaraguan")
        if "ecuador" in wl and "ecuador" not in wrl:
            problems.append("wrapper role missing Ecuador")
        if "dominican" in wl and "dominican" not in wrl:
            problems.append("wrapper role missing Dominican")
        if "habano" in wl and "habano" not in wrl:
            problems.append("wrapper role missing Habano")
        if "sumatra" in wl and "sumatra" not in wrl:
            problems.append("wrapper role missing Sumatra")
        if "broadleaf" in wl and "broadleaf" not in wrl and "broad" not in wrl:
            problems.append("wrapper role missing Broadleaf")
        if "cuba" in wl and "cuban" not in wrl and "cuba" not in wrl:
            problems.append("wrapper role missing Cuban")
        if "mexican" in wl and "mexic" not in wrl and "andr" not in wrl:
            problems.append("wrapper role missing Mexican/San Andrés")

    if b and br:
        bl, brl = b.lower(), br.lower()
        if "dominican" in bl and "dominican" not in brl:
            problems.append("binder role missing Dominican")
        if "nicaragua" in bl and "nicaragua" not in brl:
            problems.append("binder role missing Nicaraguan")
        if "indonesian" in bl and "jember" not in brl and "indonesian" not in brl:
            problems.append("binder role missing Jember/Indonesian")
        if "mexican" in bl and "mexic" not in brl and "andr" not in brl:
            problems.append("binder role missing Mexican")
        if "brazilian" in bl and "brazil" not in brl:
            problems.append("binder role missing Brazilian")
        if "ecuador" in bl and "ecuador" not in brl:
            problems.append("binder role missing Ecuador")
        if "honduras" in bl and "hondur" not in brl:
            problems.append("binder role missing Honduran")

    if f and fr:
        fl, frl = f.lower(), fr.lower()
        if "cuba" in fl and "cuban" not in frl and "cuba" not in frl:
            problems.append("filler role missing Cuban")
        if "nicaragua" in fl and "nicaragua" not in frl:
            problems.append("filler role missing Nicaraguan")
        if "dominican" in fl and "dominican" not in frl:
            problems.append("filler role missing Dominican")

    return problems


def main():
    rows = fetch_rows()
    hdr = rows[0]
    col_index = {h: i for i, h in enumerate(hdr) if h}

    exp_list = json.loads(CORRECTIONS.read_text(encoding="utf-8"))
    exp_by_sku = {e["sku"]: e for e in exp_list if e.get("sku")}

    mismatches_6_19 = []
    for row_num in range(6, 20):
        r = rows[row_num - 1]
        sku = cell(r, "SKU", col_index)
        e = exp_by_sku.get(sku)
        if not e:
            mismatches_6_19.append((row_num, sku, "sku", sku, "(missing from cigar-corrections.json)"))
            continue
        for f, col in FIELD_MAP.items():
            got = cell(r, col, col_index)
            want = e.get(f, "")
            if got != want:
                mismatches_6_19.append((row_num, sku, f, got, want))

    align_fail = []
    role_checked = 0
    role_pass = 0
    for row_num in range(2, 45):
        r = rows[row_num - 1]
        if not cell(r, "SKU", col_index):
            continue
        role_checked += 1
        probs = check_role_alignment(row_num, r, col_index)
        if not probs:
            role_pass += 1
        else:
            align_fail.append((row_num, cell(r, "SKU", col_index), probs))

    logic_fail = []
    for row_num in range(2, 45):
        r = rows[row_num - 1]
        if not cell(r, "SKU", col_index):
            continue
        try:
            strength = int(cell(r, "Strength", col_index) or 0)
        except ValueError:
            strength = 0
        beg = cell(r, "Beginner Safe", col_index).lower()
        best = cell(r, "Best For", col_index).lower()
        if beg == "yes" and strength >= 6:
            logic_fail.append((row_num, cell(r, "SKU", col_index), "Beginner Safe=Yes but Strength>=6"))
        if beg == "no" and strength <= 3 and "beginner" in best:
            logic_fail.append(
                (row_num, cell(r, "SKU", col_index), "Beginner Safe=No but Best For mentions beginner")
            )

    empty_crit = []
    for row_num in range(2, 45):
        r = rows[row_num - 1]
        if not cell(r, "SKU", col_index):
            continue
        for name in ["Wrapper", "Binder", "Filler", "Wrapper Role", "Why Recommend"]:
            if not cell(r, name, col_index):
                empty_crit.append((row_num, cell(r, "SKU", col_index), f"empty {name}"))

    varies = sum(
        1
        for row_num in range(2, 45)
        if cell(rows[row_num - 1], "SKU", col_index)
        and "varies" in cell(rows[row_num - 1], "Vitola", col_index).lower()
    )

    exact_6_19 = 14 - len({m[0] for m in mismatches_6_19})
    block6_rate = exact_6_19 / 14
    align_rate = role_pass / max(role_checked, 1)

    print("=== ROWS 6-19 EXACT MATCH (vs corrections JSON) ===")
    print(f"{exact_6_19}/14 rows fully match M-W fields")
    if mismatches_6_19:
        print(f"{len(mismatches_6_19)} field mismatches:")
        for m in mismatches_6_19:
            print(f"  row {m[0]} {m[1]} | {m[2]}")
            print(f"    got:  {m[3][:80]}...")
            print(f"    want: {m[4][:80]}...")

    print("\n=== ROLE ALIGNMENT (all rows 2-44) ===")
    print(f"{role_pass}/{role_checked} pass heuristic")
    for a in align_fail:
        print(f"  row {a[0]} {a[1]}: {', '.join(a[2])}")

    print("\n=== LOGIC (Beginner Safe vs Strength) ===")
    print(f"{len(logic_fail)} issues")
    for x in logic_fail:
        print(f"  {x}")

    print("\n=== EMPTY CRITICAL FIELDS ===")
    print(f"{len(empty_crit)} issues")
    for x in empty_crit:
        print(f"  {x}")

    print(f"\n=== Vitola 'Varies': {varies} rows (line-level SKUs, not stick-level) ===")

    penalty = 0.15 * len({m[0] for m in mismatches_6_19}) + 0.05 * len(align_fail) + 0.1 * len(logic_fail)
    base = block6_rate * 4.0 + align_rate * 4.5 + (1.0 if not empty_crit else 0.5) * 1.5
    sterlon = max(0, min(10, round(base - penalty, 1)))
    print(f"\n=== STERLON v1 SCORE (accuracy + usefulness, no images/links) ===")
    print(f"{sterlon} / 10")
    if sterlon >= 9.5:
        verdict = "Yes — effectively 10/10 for v1 catalog use."
    elif sterlon >= 8.5:
        verdict = "Close — minor fixes below for true 10/10."
    else:
        verdict = "Not yet — fix blockers below."
    print(verdict)


if __name__ == "__main__":
    main()
