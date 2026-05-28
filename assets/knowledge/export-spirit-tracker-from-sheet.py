#!/usr/bin/env python3
"""Export Spirits tab from Google Sheet → spirit-research-tracker-all-rows-*.json.

Also refreshes tracker-sterlon-spirits-all.json SKU allowlist (excludes curated sheet rows SPI-CUR-*).

Run from docs/visionboard/assets/knowledge:
  python export-spirit-tracker-from-sheet.py
"""
from __future__ import annotations

import csv
import json
import re
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent
SHEET_ID = "1mLHCA8rvvl5G87FJCxg5tkoDQ1Xp5FDx2QBm7Ty-WUU"
CSV_URL = (
    f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Spirits"
)
OUT_ALLOWLIST = BASE / "tracker-sterlon-spirits-all.json"
_ROWS_CHUNK = 14
CURATED_SHEET_PREFIX = "SPI-CUR-"


def cell(row: list[str], idx: int) -> str:
    if idx >= len(row):
        return ""
    return row[idx].strip()


def parse_float(val: str) -> float | None:
    val = (val or "").strip().replace("$", "").replace(",", "")
    if not val:
        return None
    try:
        return float(val)
    except ValueError:
        return None


def parse_int(val: str) -> int | None:
    f = parse_float(val)
    if f is None:
        return None
    return int(f) if f == int(f) else int(round(f))


def row_from_sheet(cells: list[str]) -> dict | None:
    sku = cell(cells, 0)
    if not sku or sku.upper() == "SKU":
        return None
    if sku.startswith(CURATED_SHEET_PREFIX):
        return None

    proof = parse_float(cell(cells, 10))
    msrp = parse_float(cell(cells, 23))
    tier = parse_int(cell(cells, 7))
    rank = parse_int(cell(cells, 9))

    catalog_line = cell(cells, 24)
    blurb = cell(cells, 25)
    article = cell(cells, 28)
    source = cell(cells, 22) or "Tracker sheet"
    notes_field = cell(cells, 17)
    flavor_notes = cell(cells, 16)

    return {
        "sku": sku,
        "brand": cell(cells, 1),
        "name": cell(cells, 2),
        "expr": cell(cells, 3),
        "type": cell(cells, 4),
        "style": cell(cells, 5),
        "origin": cell(cells, 6),
        "tier": tier if tier is not None else 5,
        "journey": cell(cells, 8).lower() or "intermediate",
        "rank": rank if rank is not None else 5,
        "proof": proof,
        "abv": parse_float(cell(cells, 11)),
        "mash": cell(cells, 12),
        "family": cell(cells, 13),
        "occasion": cell(cells, 14),
        "pairing": cell(cells, 15),
        "notes": flavor_notes or notes_field,
        "research": notes_field,
        "best": cell(cells, 18),
        "avoid": cell(cells, 19),
        "why": cell(cells, 20),
        "recommendationConfidence": cell(cells, 21),
        "source": source,
        "msrp": int(msrp) if msrp is not None and msrp == int(msrp) else msrp,
        "catalogLine": catalog_line,
        "blurb": blurb,
        "awards": cell(cells, 26),
        "imageUrl": cell(cells, 27),
        "article": article,
        "sterlon": cell(cells, 29),
        "dataGrade": parse_int(cell(cells, 30)),
    }


def fetch_sheet_rows() -> list[dict]:
    raw = urllib.request.urlopen(CSV_URL, timeout=60).read().decode("utf-8")
    reader = csv.reader(raw.splitlines())
    rows: list[dict] = []
    for cells in reader:
        parsed = row_from_sheet(cells)
        if parsed:
            rows.append(parsed)
    rows.sort(key=lambda r: r["sku"])
    return rows


def main() -> None:
    rows = fetch_sheet_rows()
    if not rows:
        raise SystemExit("No spirit rows exported from sheet")

    # Remove stale part files before writing fresh ones.
    for stale in sorted(BASE.glob("spirit-research-tracker-all-rows-*.json")):
        stale.unlink()
    import math
    for i in range(math.ceil(len(rows) / _ROWS_CHUNK)):
        chunk = rows[i * _ROWS_CHUNK:(i + 1) * _ROWS_CHUNK]
        out = BASE / f"spirit-research-tracker-all-rows-{i + 1:02d}.json"
        out.write_text(json.dumps(chunk, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} rows -> spirit-research-tracker-all-rows-01..{math.ceil(len(rows)/_ROWS_CHUNK):02d}.json")

    allowlist = {
        "version": 1,
        "description": (
            "All tracker Spirits-tab SKUs for Sterlon ontology import (curated SPI-CUR-* merged separately). "
            "Regenerate spirits.reco.json via build-tracker-spirits-to-ontology.py."
        ),
        "skus": [r["sku"] for r in rows],
    }
    OUT_ALLOWLIST.write_text(
        json.dumps(allowlist, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(allowlist['skus'])} SKUs -> {OUT_ALLOWLIST.name}")


if __name__ == "__main__":
    main()
