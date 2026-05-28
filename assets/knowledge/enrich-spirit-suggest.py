#!/usr/bin/env python3
"""Suggest spirit sheet fields from WhiskeyFYI search — QA only, never auto-merge reco JSON."""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent
OUT = BASE / "spirit-enrichment-suggestions.json"
API = "https://whiskeyfyi.com/api/v1/search/"


def load_rows(from_sheet: bool) -> list[dict]:
    if from_sheet:
        import export_spirit_tracker_from_sheet as exp

        exp.main()
    parts = sorted(BASE.glob("spirit-research-tracker-all-rows-*.json"))
    if not parts:
        raise SystemExit("Missing spirit-research-tracker-all-rows-*.json — run export-spirit-tracker-from-sheet.py")
    rows: list[dict] = []
    for p in parts:
        rows.extend(json.loads(p.read_text(encoding="utf-8")))
    return [r for r in rows if isinstance(r, dict) and r.get("sku")]


def search_whiskeyfyi(query: str) -> list[dict]:
    url = API + "?" + urllib.parse.urlencode({"q": query})
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "LoungeCatalogQA/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    results = data.get("results") if isinstance(data, dict) else data
    if not isinstance(results, list):
        return []
    out = []
    for item in results[:5]:
        if not isinstance(item, dict):
            continue
        out.append(
            {
                "slug": item.get("slug") or "",
                "name": item.get("name") or item.get("title") or "",
                "abv": item.get("abv"),
                "distillery": item.get("distillery_name") or item.get("distillery") or "",
                "type": item.get("type") or item.get("whiskey_type") or "",
                "tastingNotes": item.get("tasting_notes") or item.get("notes") or "",
            }
        )
    return out


def build_query(row: dict) -> str:
    brand = (row.get("brand") or "").strip()
    name = (row.get("name") or row.get("expr") or "").strip()
    return " ".join(p for p in (brand, name) if p)


def main() -> int:
    parser = argparse.ArgumentParser(description="WhiskeyFYI spirit enrichment suggestions")
    parser.add_argument("--from-sheet", action="store_true", help="Re-export spirit-research-tracker-all-rows-*.json from sheet first")
    parser.add_argument("--limit", type=int, default=0, help="Max rows to query (0 = all)")
    parser.add_argument("--sku", help="Single SKU only")
    parser.add_argument("--dry-run", action="store_true", help="Print queries only, no HTTP")
    parser.add_argument("--delay", type=float, default=1.0, help="Seconds between API calls")
    args = parser.parse_args()

    rows = load_rows(args.from_sheet)
    if args.sku:
        rows = [r for r in rows if r.get("sku") == args.sku]
        if not rows:
            raise SystemExit(f"SKU not found: {args.sku}")
    if args.limit and args.limit > 0:
        rows = rows[: args.limit]

    suggestions: list[dict] = []
    for i, row in enumerate(rows):
        sku = row.get("sku", "")
        query = build_query(row)
        entry = {"sku": sku, "brand": row.get("brand"), "name": row.get("name"), "query": query, "matches": []}
        if args.dry_run:
            print(f"{sku}: {query}")
        else:
            try:
                entry["matches"] = search_whiskeyfyi(query)
            except Exception as exc:
                entry["error"] = str(exc)
            if i < len(rows) - 1 and args.delay > 0:
                time.sleep(args.delay)
        suggestions.append(entry)

    if not args.dry_run:
        OUT.write_text(json.dumps({"generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "suggestions": suggestions}, indent=2), encoding="utf-8")
        print(f"Wrote {len(suggestions)} suggestions -> {OUT.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
