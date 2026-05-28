#!/usr/bin/env python3
"""Cigar catalog sync CLI — live sheet → validate → diff → build Sterlon JSON.

Run from docs/visionboard (npm) or assets/knowledge:

  python cigar_catalog_cli.py pull          # fetch Cigars tab → TSV export
  python cigar_catalog_cli.py audit         # identity + validation report
  python cigar_catalog_cli.py diff          # merged sources vs on-disk reco/briefs
  python cigar_catalog_cli.py build         # cigars/canonical.json + reco/brief shards + manifest
  python cigar_catalog_cli.py sync          # pull → audit → build (fails on audit errors)

npm (from docs/visionboard):
  npm run catalog:pull | catalog:audit | catalog:diff | catalog:sync
  npm run test:catalog-integrity            # alias for build
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))

from catalog_paths import CIGARS_MANIFEST  # noqa: E402
from cigar_tracker_pipeline import (  # noqa: E402
    BASE as PIPE_BASE,
    CANONICAL_JSON,
    TSV_PATH,
    build_canonical_document,
    build_merged_canonical_rows,
    load_disk_catalog_slices,
    load_tsv_rows,
    product_to_brief,
    product_to_reco,
    products_from_canonical,
    tabular_row_to_fields,
    write_reco_briefs_json,
)

SHEET_ID = "1mLHCA8rvvl5G87FJCxg5tkoDQ1Xp5FDx2QBm7Ty-WUU"
SHEET_CSV_URL = (
    f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Cigars"
)
REPORTS_DIR = PIPE_BASE.parent.parent / "reports"
AUDIT_REPORT = REPORTS_DIR / "catalog-audit-latest.json"

def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_sheet_dict_rows() -> list[dict[str, Any]]:
    with urllib.request.urlopen(SHEET_CSV_URL, timeout=120) as resp:
        text = resp.read().decode("utf-8")
    reader = csv.DictReader(text.splitlines())
    rows: list[dict[str, Any]] = []
    for raw in reader:
        row = tabular_row_to_fields(raw)
        sku = (row.get("sku") or "").strip()
        if not sku or sku.upper() == "SKU":
            continue
        rows.append(row)
    return rows


def write_tsv_export(rows: list[dict[str, Any]], dest: Path) -> None:
    """Write tracker-shaped TSV (same columns as manual export)."""
    headers = [
        "SKU",
        "Brand",
        "Line",
        "Vitola",
        "Wrapper",
        "Binder",
        "Filler",
        "Wrapper Role",
        "Binder Role",
        "Filler Role",
        "Flavor Notes",
        "Strength",
        "Tier",
        "MSRP",
        "Length",
        "Ring",
        "Catalog Line",
        "Member Blurb",
        "Best For",
        "Avoid If",
        "Why Recommend",
        "Data Grade",
        "CA Rating",
        "Stick Size",
        "Repr Vitola",
        "Origin",
        "Factory",
        "Beginner Safe",
    ]
    field_to_header = {
        "sku": "SKU",
        "brand": "Brand",
        "line": "Line",
        "vitola": "Vitola",
        "wrapper": "Wrapper",
        "binder": "Binder",
        "filler": "Filler",
        "wrapperRole": "Wrapper Role",
        "binderRole": "Binder Role",
        "fillerRole": "Filler Role",
        "flavorNotes": "Flavor Notes",
        "strength": "Strength",
        "tier": "Tier",
        "msrp": "MSRP",
        "length": "Length",
        "ring": "Ring",
        "catalogLine": "Catalog Line",
        "memberBlurb": "Member Blurb",
        "bestFor": "Best For",
        "avoidIf": "Avoid If",
        "whyRecommend": "Why Recommend",
        "dataGrade": "Data Grade",
        "caRating": "CA Rating",
        "stickSize": "Stick Size",
        "repr": "Repr Vitola",
        "origin": "Origin",
        "factory": "Factory",
        "beginnerSafe": "Beginner Safe",
    }

    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers, delimiter="\t", extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            out: dict[str, str] = {}
            for field, header in field_to_header.items():
                val = row.get(field)
                if val is None:
                    continue
                if isinstance(val, float) and val == int(val):
                    val = int(val)
                out[header] = str(val)
            writer.writerow(out)


def cmd_pull(args: argparse.Namespace) -> int:
    rows = fetch_sheet_dict_rows()
    dest = Path(args.output) if args.output else TSV_PATH
    if dest.exists() and not args.force:
        print(f"Refusing to overwrite {dest} (use --force).", file=sys.stderr)
        return 1
    write_tsv_export(rows, dest)
    print(f"Pulled {len(rows)} rows from live sheet -> {dest.relative_to(PIPE_BASE)}")
    print("Note: fields with commas are safer in a manual TSV export; re-run audit after pull.")
    return 0


def run_audit(*, json_out: Path | None = None) -> dict[str, Any]:
    rows, errors, warnings, sanitize_notes = build_merged_canonical_rows()
    reco_disk, briefs_disk = load_disk_catalog_slices()
    disk_ids = {p.get("id") for p in reco_disk if p.get("id")}

    report: dict[str, Any] = {
        "generatedAt": _utc_now(),
        "sheetId": SHEET_ID,
        "sources": {
            "tsv": str(TSV_PATH.name),
            "tsvRowCount": len(load_tsv_rows()),
        },
        "mergedRowCount": len(rows),
        "errorCount": len(errors),
        "warningCount": len(warnings),
        "sanitizeNoteCount": len(sanitize_notes),
        "errors": errors,
        "warnings": warnings[:200],
        "sanitizeNotes": sanitize_notes[:200],
        "diskRecoCount": len(reco_disk),
        "diskBriefCount": len(briefs_disk),
    }
    if json_out:
        json_out.parent.mkdir(parents=True, exist_ok=True)
        json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def cmd_audit(args: argparse.Namespace) -> int:
    report = run_audit(json_out=AUDIT_REPORT if args.report else None)
    print(f"Merged rows: {report['mergedRowCount']}")
    print(f"Errors: {report['errorCount']}  Warnings: {report['warningCount']}")
    print(f"Sanitize notes: {report['sanitizeNoteCount']}")
    if args.report:
        print(f"Wrote {AUDIT_REPORT.relative_to(PIPE_BASE.parent.parent)}")
    if report["errors"]:
        for msg in report["errors"][:25]:
            print(" ERROR:", msg)
        if report["errorCount"] > 25:
            print(f" ... and {report['errorCount'] - 25} more")
        return 1 if args.strict else 0
    return 0


def _stable_slice(obj: dict[str, Any]) -> str:
    return json.dumps(obj, sort_keys=True, ensure_ascii=False)


def cmd_diff(args: argparse.Namespace) -> int:
    canonical = build_canonical_document(write_shards=False)
    if canonical["validation"]["errors"] and args.strict:
        print("Cannot diff: canonical validation has errors (run audit).", file=sys.stderr)
        return 1

    expected_products, skipped, _ = products_from_canonical(
        canonical, skip_embedded_duplicates=True
    )
    if skipped:
        print(f"Skipped {len(skipped)} embedded duplicates when building expected set")

    reco_disk, briefs_disk = load_disk_catalog_slices()
    if not reco_disk:
        print(f"No on-disk catalog at {CIGARS_MANIFEST}", file=sys.stderr)
        return 1

    brief_by_id = {p["id"]: p for p in briefs_disk if p.get("id")}
    reco_by_id = {p["id"]: p for p in reco_disk if p.get("id")}
    expected_by_id = {p["id"]: p for p in expected_products if p.get("id")}

    drift: list[dict[str, Any]] = []
    missing_on_disk: list[str] = []
    stale_on_disk: list[str] = []

    for pid, exp in expected_by_id.items():
        exp_reco = product_to_reco(exp)
        exp_brief = product_to_brief(exp)
        disk_reco = reco_by_id.get(pid)
        disk_brief = brief_by_id.get(pid)
        if not disk_reco or not disk_brief:
            missing_on_disk.append(pid)
            continue
        parts: list[str] = []
        if _stable_slice(exp_reco) != _stable_slice(disk_reco):
            parts.append("reco")
        if _stable_slice(exp_brief) != _stable_slice(disk_brief):
            parts.append("briefs")
        if parts:
            sku = (exp.get("tracker") or {}).get("sku")
            drift.append({"id": pid, "sku": sku, "slices": parts})

    for pid in reco_by_id:
        if pid not in expected_by_id:
            stale_on_disk.append(pid)

    print(f"Expected products: {len(expected_by_id)}")
    print(f"On-disk reco: {len(reco_by_id)}  briefs: {len(brief_by_id)}")
    print(f"Drift (field mismatch): {len(drift)}")
    print(f"Missing on disk: {len(missing_on_disk)}")
    print(f"Stale on disk (not in merge): {len(stale_on_disk)}")

    for item in drift[:30]:
        print(f"  {item['id']} ({item.get('sku')}): {', '.join(item['slices'])}")
    if len(drift) > 30:
        print(f"  ... and {len(drift) - 30} more")

    if args.report:
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        out = REPORTS_DIR / "catalog-diff-latest.json"
        payload = {
            "generatedAt": _utc_now(),
            "driftCount": len(drift),
            "drift": drift,
            "missingOnDisk": missing_on_disk,
            "staleOnDisk": stale_on_disk,
        }
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {out.relative_to(PIPE_BASE.parent.parent)}")

    if drift or missing_on_disk:
        return 1 if args.strict else 0
    return 0


def _write_canonical_split(canonical: dict[str, Any], dest: Path, chunk: int = 13) -> None:
    """Write canonical metadata to dest and row chunks to dest.parent/canonical-rows-NN.json."""
    import math

    rows = canonical["rows"]
    meta = {k: v for k, v in canonical.items() if k != "rows"}
    dest.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    for stale in sorted(dest.parent.glob("canonical-rows-*.json")):
        stale.unlink()
    parts = math.ceil(len(rows) / chunk)
    for i in range(parts):
        out = dest.parent / f"canonical-rows-{i + 1:02d}.json"
        out.write_text(
            json.dumps(rows[i * chunk:(i + 1) * chunk], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


def cmd_build(args: argparse.Namespace) -> int:
    canonical = build_canonical_document()
    validation = canonical["validation"]
    errors = validation["errors"]

    _write_canonical_split(canonical, CANONICAL_JSON)
    print(f"Wrote {len(canonical['rows'])} rows -> {CANONICAL_JSON.name} + canonical-rows-*.json")
    print(
        f"Validation: {validation['errorCount']} error(s), "
        f"{validation['warningCount']} warning(s)"
    )

    if errors:
        for msg in errors[:20]:
            print(" ERROR:", msg)
        if len(errors) > 20:
            print(f" ... and {len(errors) - 20} more")
        return 1

    products, skipped, _ = products_from_canonical(canonical, skip_embedded_duplicates=True)
    if skipped:
        print(f"Skipped {len(skipped)} duplicate display names")

    write_reco_briefs_json(
        products,
        category="cigar",
        source_sku_count=len(canonical["rows"]),
        generator="cigar_catalog_cli.py build",
    )
    print(f"Wrote {len(products)} -> {CIGARS_MANIFEST.relative_to(PIPE_BASE)}")
    return 0


def cmd_sync(args: argparse.Namespace) -> int:
    if not args.skip_pull:
        rc = cmd_pull(argparse.Namespace(output=None, force=args.force))
        if rc != 0:
            return rc

    audit_args = argparse.Namespace(report=True, strict=True)
    if cmd_audit(audit_args) != 0 and not args.force_build:
        print("Sync stopped: fix audit errors or pass --force-build.", file=sys.stderr)
        return 1

    rc = cmd_build(argparse.Namespace())
    if rc == 0:
        diff_args = argparse.Namespace(strict=False, report=True)
        cmd_diff(diff_args)
    return rc


def main() -> None:
    parser = argparse.ArgumentParser(description="Cigar catalog sync (sheet → Sterlon JSON)")
    sub = parser.add_subparsers(dest="command", required=True)

    pull = sub.add_parser("pull", help="Fetch live Google Sheet Cigars tab → TSV")
    pull.add_argument("-o", "--output", help=f"TSV path (default: {TSV_PATH.name})")
    pull.add_argument("--force", action="store_true", help="Overwrite existing TSV")

    audit = sub.add_parser("audit", help="Validate merged sources (no JSON write)")
    audit.add_argument("--report", action="store_true", help=f"Write {AUDIT_REPORT.name}")
    audit.add_argument("--strict", action="store_true", help="Exit 1 on any error")

    diff = sub.add_parser("diff", help="Compare merge output vs on-disk reco/briefs")
    diff.add_argument("--report", action="store_true", help="Write catalog-diff-latest.json")
    diff.add_argument("--strict", action="store_true", help="Exit 1 if drift or missing")

    sub.add_parser("build", help="Rebuild canonical + reco + briefs JSON")

    sync = sub.add_parser("sync", help="pull → audit (strict) → build → diff report")
    sync.add_argument("--skip-pull", action="store_true", help="Use existing TSV only")
    sync.add_argument("--force", action="store_true", help="Overwrite TSV on pull")
    sync.add_argument(
        "--force-build",
        action="store_true",
        help="Build even when audit has errors (not recommended)",
    )

    sub.add_parser("health", help="Sterlon file caps + catalog slice + knowledge hygiene")

    args = parser.parse_args()
    handlers = {
        "pull": cmd_pull,
        "audit": cmd_audit,
        "diff": cmd_diff,
        "build": cmd_build,
        "sync": cmd_sync,
        "health": lambda _a: __import__("catalog_health").main(),
    }
    sys.exit(handlers[args.command](args))


if __name__ == "__main__":
    main()
