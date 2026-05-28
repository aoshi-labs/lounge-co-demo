"""Cigar Research Tracker → canonical JSON → catalog reco/brief slices.

Merge order (later wins for non-empty values):
  CSV export (pre-Notes columns only) → TSV export (full row) → row JSON batches
  → corrections JSON → smoker-facing fields.

Run via cigar_catalog_cli.py or npm run catalog:sync from docs/visionboard.
"""
from __future__ import annotations

import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from catalog_paths import (
    CIGARS_BRIEFS_DIR,
    CIGARS_CANONICAL_JSON,
    CIGARS_MANIFEST,
    CIGARS_RECO_DIR,
    CIGARS_SOURCES_DIR,
    PRODUCTS_DIR,
)
from catalog_slice_export import write_sharded_catalog_slices
from cigar_canonical_export import (
    compute_field_coverage,
    validate_row_format,
    write_source_shards,
)

BASE = Path(__file__).resolve().parent

EMBEDDED_CIGARS_JS = PRODUCTS_DIR / "cigars.js"
CANONICAL_JSON = CIGARS_CANONICAL_JSON
SHARDS_DIR = CIGARS_SOURCES_DIR

CSV_PATH = BASE / "cigar-research-tracker-cigars-updated.csv"
TSV_PATH = BASE / "cigar-research-tracker-cigars-updated.tsv"
SMOKER_FACING_GLOB = "cigar-smoker-facing-fields-*.json"
CORRECTIONS = BASE / "cigar-corrections.json"
CA_RATINGS_GLOB = "cigar-ca-ratings-map-*.json"

PARENT_COMPANY_RE = re.compile(r"parent_company:\s*([^\s|]+)", re.I)

ROW_JSON_GLOBS = (
    "cigar-ashton-ecosystem-rows.json",
    "cigar-padron-portfolio-rows.json",
    "cigar-curated-classics-rows.json",
    "cigar-ca24-top25-rows.json",
    "cigar-ca24-bestbuys-rows.json",
    "cigar-ca25-bestbuys-rows.json",
    "cigar-transcript-rows.json",
    "cigar-official-notes-master.json",
    "cigar-verified-batch-1.json",
    "cigar-verified-batch-2.json",
)

FLAVOR_FAMILY_NOTES = {
    "Coffee": "cocoa, coffee, earth, dark sweetness, cedar",
    "Sweet Spice": "cedar, baking spice, sweet tobacco, toast, light cocoa",
    "Woodsy": "cedar, wood, earth, leather, mineral tobacco",
    "Dark & Heavy": "cocoa, earth, pepper, espresso, dark sweetness",
    "Savory": "earth, savory spice, cedar, cocoa, toasted tobacco",
    "Creamy": "cream, cedar, nuts, toast, light sweetness",
    "Dessert": "caramel, cream, oak, almond, elegant fruit",
    "Earthy": "cedar, earth, toasted nuts, light pepper",
}

BODY_MAP = {
    "Light": 3,
    "Medium-Light": 4,
    "Medium": 6,
    "Medium-Full": 7,
    "Full": 9,
}

VALID_BODIES = frozenset(BODY_MAP)

FLAVOR_LEXICON: list[tuple[str, list[str]]] = [
    ("dark_chocolate", ["dark chocolate"]),
    ("dark_fruit", ["dark fruit"]),
    ("chocolate", ["chocolate", "cocoa", "cacao"]),
    ("caramel", ["caramel"]),
    ("tobacco", ["tobacco", "sweet tobacco"]),
    ("oak", ["toasted oak", "oak"]),
    ("wood", ["wood", "woody"]),
    ("espresso", ["espresso", "cafe au lait"]),
    ("cocoa", ["cocoa"]),
    ("cedar", ["cedar"]),
    ("cream", ["creamy", "cream"]),
    ("pepper", ["white pepper", "pepper", "peppery"]),
    ("leather", ["leather"]),
    ("earth", ["earthy", "earth", "barnyard", "mineral tobacco"]),
    ("coffee", ["coffee"]),
    ("spice", ["spice", "spicy", "baking spice", "savory spice"]),
    ("honey", ["honey", "honeyed", "brown sugar"]),
    ("nut", ["nuts", "almond", "toasted nuts"]),
    ("toast", ["toast", "toasted"]),
    ("fruit", ["elegant fruit", "fruit"]),
    ("hay", ["hay"]),
    ("smoke", ["smoky", "smoke", "campfire"]),
]

CANONICAL_STRING_FIELDS = (
    "brand",
    "line",
    "vitola",
    "country",
    "body",
    "flavorFamily",
    "occasion",
    "smokeTime",
    "pairingAffinity",
    "wrapper",
    "binder",
    "filler",
    "notes",
    "parentCompany",
    "wrapperRole",
    "binderRole",
    "fillerRole",
    "flavorNotes",
    "bestFor",
    "avoidIf",
    "whyRecommend",
    "recommendationConfidence",
    "sourceConfidence",
    "beginnerSafe",
    "shape",
    "stickSize",
    "catalogLine",
    "memberBlurb",
    "priceNote",
    "sizeNote",
    "articleSource",
    "imageUrl",
)


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip()).lower()


def load_embedded_cigar_names() -> set[str]:
    text = EMBEDDED_CIGARS_JS.read_text(encoding="utf-8")
    return {normalize_name(m) for m in re.findall(r"name:\s*'([^']+)'", text)}


def _parse_msrp(val: Any) -> float | None:
    if val is None:
        return None
    s = str(val).strip().replace("$", "").replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _parse_int(val: Any) -> int | None:
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def _parse_float(val: Any) -> float | None:
    if val is None:
        return None
    s = str(val).strip().replace("$", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _strip_empty(row: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, val in row.items():
        if val is None:
            continue
        if isinstance(val, str) and not val.strip():
            continue
        out[key] = val
    return out


def csv_row_to_fields_safe(raw: dict[str, str]) -> dict[str, Any]:
    """Pre-Notes columns only — unquoted commas in Notes/teaching columns corrupt DictReader tail."""
    return _strip_empty(
        {
            "sku": (raw.get("SKU") or "").strip(),
            "brand": (raw.get("Brand") or "").strip(),
            "line": (raw.get("Line") or "").strip(),
            "vitola": (raw.get("Vitola") or "").strip(),
            "country": (raw.get("Country") or "").strip(),
            "tier": _parse_int(raw.get("Tier")),
            "strength": _parse_int(raw.get("Strength")),
            "body": (raw.get("Body") or "").strip(),
            "flavorFamily": (raw.get("Flavor Family") or "").strip(),
            "occasion": (raw.get("Occasion") or "").strip(),
            "smokeTime": (raw.get("Smoke Time") or "").strip(),
            "pairingAffinity": (raw.get("Pairing Affinity") or "").strip(),
            "wrapper": (raw.get("Wrapper") or "").strip(),
            "binder": (raw.get("Binder") or "").strip(),
            "filler": (raw.get("Filler") or "").strip(),
        }
    )


def tabular_row_to_fields(raw: dict[str, str]) -> dict[str, Any]:
    """Full row mapping — safe when source is TSV or properly quoted CSV."""
    return _strip_empty(
        {
            "sku": (raw.get("SKU") or "").strip(),
            "brand": (raw.get("Brand") or "").strip(),
            "line": (raw.get("Line") or "").strip(),
            "vitola": (raw.get("Vitola") or "").strip(),
            "country": (raw.get("Country") or "").strip(),
            "tier": _parse_int(raw.get("Tier")),
            "strength": _parse_int(raw.get("Strength")),
            "body": (raw.get("Body") or "").strip(),
            "flavorFamily": (raw.get("Flavor Family") or "").strip(),
            "occasion": (raw.get("Occasion") or "").strip(),
            "smokeTime": (raw.get("Smoke Time") or "").strip(),
            "pairingAffinity": (raw.get("Pairing Affinity") or "").strip(),
            "wrapper": (raw.get("Wrapper") or "").strip(),
            "binder": (raw.get("Binder") or "").strip(),
            "filler": (raw.get("Filler") or "").strip(),
            "notes": (raw.get("Notes") or "").strip(),
            "wrapperRole": (raw.get("Wrapper Role") or "").strip(),
            "binderRole": (raw.get("Binder Role") or "").strip(),
            "fillerRole": (raw.get("Filler Role") or "").strip(),
            "flavorNotes": (raw.get("Flavor Notes") or "").strip(),
            "bestFor": (raw.get("Best For") or "").strip(),
            "avoidIf": (raw.get("Avoid If") or "").strip(),
            "whyRecommend": (raw.get("Why Recommend") or "").strip(),
            "recommendationConfidence": (raw.get("Recommendation Confidence") or "").strip(),
            "sourceConfidence": (raw.get("Source Confidence") or "").strip(),
            "beginnerSafe": (raw.get("Beginner Safe") or "").strip(),
            "imageUrl": (raw.get("Image URL") or "").strip(),
            "articleSource": (raw.get("Article Source") or "").strip(),
            "dataGrade": _parse_int(raw.get("Data Grade (1-10)") or raw.get("Data Grade")),
            "msrp": _parse_msrp(raw.get("MSRP USD")),
            "length": _parse_float(raw.get("Length")),
            "ring": _parse_float(raw.get("Ring Gauge")),
            "shape": (raw.get("Shape") or "").strip(),
            "stickSize": (raw.get("Stick Size") or "").strip(),
            "catalogLine": (raw.get("Catalog Line") or "").strip(),
            "memberBlurb": (raw.get("Member Blurb") or "").strip(),
            "priceNote": (raw.get("Price Note") or "").strip(),
            "sizeNote": (raw.get("Size Note") or "").strip(),
        }
    )


def load_csv_rows() -> dict[str, dict]:
    if not CSV_PATH.exists():
        return {}
    out: dict[str, dict] = {}
    with CSV_PATH.open(encoding="utf-8", newline="") as handle:
        for raw in csv.DictReader(handle):
            row = csv_row_to_fields_safe(raw)
            sku = row.get("sku")
            if sku:
                out[sku] = row
    return out


def load_tsv_rows() -> dict[str, dict]:
    if not TSV_PATH.exists():
        return {}
    out: dict[str, dict] = {}
    with TSV_PATH.open(encoding="utf-8", newline="") as handle:
        for raw in csv.DictReader(handle, delimiter="\t"):
            row = tabular_row_to_fields(raw)
            sku = row.get("sku")
            if sku:
                out[sku] = row
    return out


def load_json_rows() -> dict[str, dict]:
    merged: dict[str, dict] = {}
    for name in ROW_JSON_GLOBS:
        stem = name.removesuffix(".json")
        # Prefer numbered split files; fall back to single file.
        candidates = sorted(BASE.glob(f"{stem}-[0-9][0-9].json")) or (
            [BASE / name] if (BASE / name).exists() else []
        )
        for candidate in candidates:
            for row in json.loads(candidate.read_text(encoding="utf-8")):
                if not isinstance(row, dict):
                    continue
                sku = row.get("sku")
                if not sku:
                    continue
                normalized = normalize_json_row(row)
                merged[sku] = {**merged.get(sku, {}), **normalized}
    return merged


def normalize_json_row(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    if out.get("pairing") and not out.get("pairingAffinity"):
        out["pairingAffinity"] = out.pop("pairing")
    if out.get("flavor_notes") and not out.get("flavorNotes"):
        out["flavorNotes"] = out.pop("flavor_notes")
    if out.get("source_confidence") and not out.get("sourceConfidence"):
        out["sourceConfidence"] = out.pop("source_confidence")
    if out.get("grade") is not None and out.get("dataGrade") is None:
        out["dataGrade"] = _parse_int(out.pop("grade"))
    if out.get("article") and not out.get("articleSource"):
        out["articleSource"] = out.pop("article")
    if "msrp" in out:
        out["msrp"] = _parse_msrp(out["msrp"])
    if "tier" in out:
        out["tier"] = _parse_int(out["tier"])
    if "strength" in out:
        out["strength"] = _parse_int(out["strength"])
    if "length" in out:
        out["length"] = _parse_float(out["length"])
    if "ring" in out:
        out["ring"] = _parse_float(out["ring"])
    if "rating" in out and out["rating"] is not None:
        out["caRating"] = _parse_int(out["rating"])
    return _strip_empty(out)


def load_smoker_facing() -> dict[str, dict]:
    parts = sorted(BASE.glob(SMOKER_FACING_GLOB))
    if not parts:
        return {}
    raw_rows: list[dict] = []
    for p in parts:
        raw_rows.extend(json.loads(p.read_text(encoding="utf-8")))
    rows = raw_rows
    out: dict[str, dict] = {}
    for raw in rows:
        sku = raw.get("sku")
        if not sku:
            continue
        mapped = _strip_empty(
            {
                "stickSize": raw.get("stickSize"),
                "catalogLine": raw.get("catalogLine"),
                "memberBlurb": raw.get("memberBlurb"),
                "msrp": _parse_msrp(raw.get("msrpUsd")),
                "length": _parse_float(raw.get("lengthIn")),
                "ring": _parse_float(raw.get("ringGauge")),
                "shape": raw.get("shape"),
                "priceNote": raw.get("priceNote"),
                "sizeNote": raw.get("sizeNote"),
            }
        )
        out[sku] = mapped
    return out


def parse_parent_company(notes: str) -> str:
    m = PARENT_COMPANY_RE.search(notes or "")
    return m.group(1).strip() if m else ""


def parent_company_for_row(row: dict[str, Any]) -> str:
    explicit = (row.get("parentCompany") or "").strip()
    if explicit:
        return explicit
    return parse_parent_company(row.get("notes") or "")


def load_corrections() -> dict[str, dict]:
    merged: dict[str, dict] = {}
    if not CORRECTIONS.exists():
        return merged
    rows = json.loads(CORRECTIONS.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        return merged
    for r in rows:
        sku = r.get("sku")
        if not sku:
            continue
        patch = _strip_empty({k: v for k, v in r.items() if k not in ("row", "sku")})
        merged[sku] = {**merged.get(sku, {}), **patch}
    return merged


def _brand_in_text(brand: str, text: str) -> bool:
    b = (brand or "").strip().lower()
    if not b or not text:
        return not b
    return b in text.lower()


def _line_in_text(line: str, text: str) -> bool:
    ln = (line or "").strip().lower()
    if not ln or not text:
        return not ln
    return ln in text.lower()


def sanitize_row_identity(row: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Drop mis-pasted TSV/Sheet smoker-facing fields that belong to another SKU."""
    sku = row.get("sku") or "?"
    brand = (row.get("brand") or "").strip()
    line = (row.get("line") or "").strip()
    if not brand:
        return row, []

    warnings: list[str] = []
    for field in ("catalogLine", "memberBlurb", "stickSize"):
        val = (row.get(field) or "").strip()
        if not val:
            continue
        if not _brand_in_text(brand, val):
            row.pop(field, None)
            warnings.append(f"{sku}: cleared {field} (brand {brand!r} not in text — wrong row paste)")
            continue
        if line and field == "catalogLine" and not _line_in_text(line, val):
            row.pop(field, None)
            warnings.append(f"{sku}: cleared {field} (line {line!r} not in catalogLine)")

    length = row.get("length")
    ring = row.get("ring")
    stick = (row.get("stickSize") or "").strip()
    if stick and length is not None and ring is not None:
        try:
            ln = float(length)
            rg = int(float(ring))
            if f"{ln:g}" not in stick and str(rg) not in stick:
                row.pop("stickSize", None)
                warnings.append(f"{sku}: cleared stickSize (does not match length/ring)")
        except (TypeError, ValueError):
            pass

    return row, warnings


def validate_row_identity(row: dict[str, Any]) -> list[str]:
    """Hard errors when smoker-facing fields contradict brand/line."""
    errors: list[str] = []
    sku = row.get("sku") or "?"
    brand = (row.get("brand") or "").strip()
    line = (row.get("line") or "").strip()
    if not brand:
        return errors

    for field in ("catalogLine", "memberBlurb"):
        val = (row.get(field) or "").strip()
        if not val:
            continue
        if not _brand_in_text(brand, val):
            errors.append(
                f"{sku}: {field} missing brand {brand!r} — re-export sheet or add cigar-corrections.json"
            )
        elif field == "catalogLine" and line and not _line_in_text(line, val):
            errors.append(f"{sku}: catalogLine missing line {line!r}")
    return errors


def _ascii_fold(text: str) -> str:
    import unicodedata

    folded = unicodedata.normalize("NFKD", text)
    return folded.encode("ascii", "ignore").decode().lower()


def validate_reco_brief_products(products: list[dict[str, Any]]) -> list[str]:
    """Ensure reco + brief slices align and menuLine matches product identity."""
    errors: list[str] = []
    by_id: dict[str, dict[str, Any]] = {}
    for p in products:
        pid = p.get("id")
        if not pid:
            errors.append("product missing id")
            continue
        if pid in by_id:
            errors.append(f"{pid}: duplicate product id in export")
        by_id[pid] = p

    for p in products:
        name = (p.get("name") or "").strip()
        menu = (p.get("menuLine") or "").strip()
        tr = p.get("tracker") or {}
        sku = tr.get("sku") or p.get("id")
        if not menu:
            errors.append(f"{sku}: missing menuLine after build")
            continue
        brand_guess = name.split()[0] if name else ""
        if brand_guess and _ascii_fold(brand_guess) not in _ascii_fold(menu):
            if not (name.startswith("E.P.") and "e.p." in _ascii_fold(menu)):
                errors.append(f"{sku}: menuLine missing brand for {name!r}")
    return errors


def merge_row(
    sku: str,
    csv_rows: dict[str, dict],
    tsv_rows: dict[str, dict],
    json_rows: dict[str, dict],
    corrections: dict[str, dict],
    smoker: dict[str, dict],
) -> dict[str, Any]:
    row: dict[str, Any] = {"sku": sku}
    if sku in csv_rows:
        row.update(csv_rows[sku])
    if sku in tsv_rows:
        row.update({k: v for k, v in tsv_rows[sku].items() if v is not None and v != ""})
    if sku in json_rows:
        row.update({k: v for k, v in json_rows[sku].items() if v is not None and v != ""})
    if sku in corrections:
        row.update(corrections[sku])
    if sku in smoker:
        row.update({k: v for k, v in smoker[sku].items() if v is not None and v != ""})
    return row


def collect_all_skus(
    csv_rows: dict[str, dict],
    tsv_rows: dict[str, dict],
    json_rows: dict[str, dict],
    corrections: dict[str, dict],
    smoker: dict[str, dict],
) -> list[str]:
    skus: set[str] = set()
    skus.update(csv_rows)
    skus.update(tsv_rows)
    skus.update(json_rows)
    skus.update(corrections)
    skus.update(smoker)
    return sorted(skus)


def display_name(row: dict[str, Any]) -> str:
    explicit = (row.get("displayName") or "").strip()
    if explicit:
        return explicit
    brand = row.get("brand") or ""
    line = row.get("line") or ""
    vitola = row.get("repr") or row.get("vitola") or ""
    if vitola and vitola.lower() in line.lower():
        base = f"{brand} {line}".strip()
    else:
        base = f"{brand} {line} {vitola}".strip()
    wrapper = (row.get("wrapper") or "").lower()
    if "maduro" in wrapper and "maduro" not in base.lower():
        return f"{base} Maduro"
    if "natural" in wrapper and "natural" not in base.lower():
        return f"{base} Natural"
    return base


def import_precedence(sku: str) -> int:
    m = re.match(r"^(CA|BB)(\d{2})", sku)
    if m:
        return int(m.group(2))
    if sku.startswith("CUR"):
        return 40
    if sku.startswith("HTD"):
        return 35
    if sku.startswith("L3") or sku.startswith("L4"):
        return 30
    return 10


def dedupe_display_name_collisions(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    """When the same display name appears on multiple SKUs, keep the highest-precedence row."""
    ordered = sorted(rows, key=lambda r: (-import_precedence(r.get("sku", "")), r.get("sku", "")))
    seen: set[str] = set()
    kept: list[dict[str, Any]] = []
    dropped: list[str] = []
    for row in ordered:
        sku = row.get("sku") or "?"
        key = normalize_name(row.get("displayName") or display_name(row))
        if key in seen:
            dropped.append(f"{sku} (duplicate display name: {row.get('displayName')})")
            continue
        seen.add(key)
        kept.append(row)
    return kept, dropped


def validate_row(row: dict[str, Any]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    sku = row.get("sku") or "?"

    if not row.get("brand") and not row.get("line"):
        errors.append(f"{sku}: missing brand and line")

    name = display_name(row)
    if not name.strip():
        errors.append(f"{sku}: empty display name")

    tier = row.get("tier")
    if tier is None:
        warnings.append(f"{sku}: missing tier")
    elif not (1 <= int(tier) <= 10):
        errors.append(f"{sku}: tier out of range (1–10): {tier}")

    strength = row.get("strength")
    if strength is None:
        warnings.append(f"{sku}: missing strength")
    elif not (1 <= int(strength) <= 10):
        errors.append(f"{sku}: strength out of range (1–10): {strength}")

    body = row.get("body")
    if not body:
        warnings.append(f"{sku}: missing body")
    elif body not in VALID_BODIES:
        warnings.append(f"{sku}: non-standard body label: {body}")

    msrp = row.get("msrp")
    if msrp is None:
        warnings.append(f"{sku}: missing MSRP")
    elif msrp < 0:
        errors.append(f"{sku}: negative MSRP")

    if not row.get("sourceConfidence"):
        warnings.append(f"{sku}: missing sourceConfidence")

    errors.extend(validate_row_format(row))

    return errors, warnings


def load_all_source_maps() -> tuple[dict[str, dict], dict[str, dict], dict[str, dict], dict[str, dict], dict[str, dict]]:
    return (
        load_csv_rows(),
        load_tsv_rows(),
        load_json_rows(),
        load_corrections(),
        load_smoker_facing(),
    )


def _run_merge_pipeline() -> tuple[list[dict[str, Any]], list[str], list[str], list[str], list[str]]:
    """Returns (rows, errors, warnings, sanitize_notes, dropped_dupes)."""
    csv_rows, tsv_rows, json_rows, corrections, smoker = load_all_source_maps()
    skus = collect_all_skus(csv_rows, tsv_rows, json_rows, corrections, smoker)
    rows: list[dict[str, Any]] = []
    errors: list[str] = []
    warnings: list[str] = []
    sanitize_notes: list[str] = []
    for sku in skus:
        row = merge_row(sku, csv_rows, tsv_rows, json_rows, corrections, smoker)
        if len(row) <= 1:
            errors.append(f"{sku}: no merged source data")
            continue
        row, sw = sanitize_row_identity(row)
        sanitize_notes.extend(sw)
        errs, warns = validate_row(row)
        errors.extend(errs)
        warnings.extend(warns)
        errors.extend(validate_row_identity(row))
        name = display_name(row)
        canonical = {"sku": sku, "displayName": name}
        for field in CANONICAL_STRING_FIELDS:
            if field in row:
                canonical[field] = row[field]
        for field in ("tier", "strength", "dataGrade", "caRating", "msrp", "length", "ring"):
            if row.get(field) is not None:
                canonical[field] = row[field]
        rows.append(canonical)
    rows, dropped = dedupe_display_name_collisions(rows)
    warnings.extend(f"deduped: {msg}" for msg in dropped)
    return rows, errors, warnings, sanitize_notes, dropped


def build_merged_canonical_rows() -> tuple[list[dict[str, Any]], list[str], list[str], list[str]]:
    """Merge all sources into canonical rows (sanitize + validate). For audit/diff CLI."""
    rows, errors, warnings, sanitize_notes, _ = _run_merge_pipeline()
    return rows, errors, warnings, sanitize_notes


def load_disk_catalog_slices() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    from catalog_slice_export import load_reco_brief_from_category

    if not CIGARS_MANIFEST.is_file():
        return [], []
    return load_reco_brief_from_category("cigar")


def build_canonical_document(*, write_shards: bool = True) -> dict[str, Any]:
    csv_rows, tsv_rows, json_rows, corrections, smoker = load_all_source_maps()
    rows, all_errors, all_warnings, _, dropped_dupes = _run_merge_pipeline()

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    field_coverage = compute_field_coverage(rows)
    shard_manifest: list[dict[str, Any]] = []
    if write_shards:
        shard_manifest = write_source_shards(rows, SHARDS_DIR, generated_at=generated_at)

    return {
        "version": 1,
        "generatedAt": generated_at,
        "generator": "cigar_catalog_cli.py build",
        "sourceCounts": {
            "csv": len(csv_rows),
            "tsv": len(tsv_rows),
            "jsonRows": len(json_rows),
            "corrections": len(corrections),
            "smokerFacing": len(smoker),
            "mergedSkus": len(rows),
            "dedupedDisplayNames": len(dropped_dupes),
        },
        "fieldCoverage": field_coverage,
        "shards": shard_manifest,
        "validation": {
            "errorCount": len(all_errors),
            "warningCount": len(all_warnings),
            "errors": all_errors,
        },
        "rows": rows,
    }


def slug_id(sku: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", sku.lower()).strip("-")


def extract_tags(flavor_notes: str) -> list[dict]:
    text = (flavor_notes or "").lower()
    hits: list[tuple[int, str]] = []
    for tag_id, phrases in sorted(FLAVOR_LEXICON, key=lambda x: -len(x[1][0])):
        for phrase in sorted(phrases, key=len, reverse=True):
            if phrase in text:
                hits.append((text.index(phrase), tag_id))
                break
    seen: set[str] = set()
    ordered: list[str] = []
    for _, tag_id in sorted(hits):
        if tag_id in seen:
            continue
        seen.add(tag_id)
        ordered.append(tag_id)
    weights = [1.0, 0.95, 0.85, 0.75, 0.7, 0.65]
    return [
        {"id": tag_id, "weight": weights[i] if i < len(weights) else 0.6}
        for i, tag_id in enumerate(ordered[:6])
    ] or [{"id": "cedar", "weight": 0.7}, {"id": "tobacco", "weight": 0.65}]


def build_sensory(row: dict[str, Any]) -> dict[str, int]:
    tier = int(row.get("tier") or 5)
    strength = int(row.get("strength") or 4)
    ff = row.get("flavorFamily") or ""
    body = BODY_MAP.get(row.get("body") or "", min(9, max(3, tier)))
    cocoa = 8 if ff in ("Coffee", "Dessert", "Dark & Heavy") else 5
    earth = 7 if ff in ("Woodsy", "Earthy", "Savory") else 4
    pepper = min(10, strength + 2)
    sweetness = 6 if ff in ("Sweet Spice", "Creamy", "Dessert") else 5
    return {
        "body": body,
        "sweetness": sweetness,
        "pepper": pepper,
        "cocoa": cocoa,
        "earthiness": earth,
    }


def flavor_notes_from_row(row: dict[str, Any]) -> str:
    catalog = row.get("catalogLine") or ""
    m = re.search(r"Notes:\s*(.+?)(?:\s*·\s*[^·]*$|$)", catalog)
    if m:
        return m.group(1).strip()
    raw = row.get("flavorNotes") or ""
    if any(x in raw for x in ("User ", "Recommend when", "Beginner ")):
        raw = ""
    if raw:
        return raw.strip()
    ff = row.get("flavorFamily") or ""
    return FLAVOR_FAMILY_NOTES.get(ff, "cedar, earth, spice, sweet tobacco")


def catalog_line_for_row(row: dict[str, Any], name: str, flavor_notes: str) -> str:
    from cigar_size_utils import format_stick_size

    catalog = (row.get("catalogLine") or "").strip()
    if catalog and catalog != name:
        return catalog
    stick = row.get("stickSize") or ""
    if not stick and row.get("length") and row.get("ring"):
        stick = format_stick_size(
            float(row["length"]), int(float(row["ring"])), row.get("shape") or "Robusto"
        )
    msrp = row.get("msrp")
    price = f"${int(msrp)}" if msrp else "—"
    body = row.get("body") or ""
    country = row.get("country") or ""
    line_label = f"{row.get('brand', '')} {row.get('line', '')}".strip()
    parts = [line_label, stick, body, country, price]
    core = " · ".join(p for p in parts if p)
    return f"{core} · Notes: {flavor_notes}"


def _maybe_block(obj: dict[str, Any]) -> dict[str, Any] | None:
    cleaned = _strip_empty(obj)
    return cleaned or None


def build_product(row: dict[str, Any], ca: dict | None) -> dict[str, Any]:
    from cigar_size_utils import format_stick_size

    name = row.get("displayName") or display_name(row)
    flavor_notes = flavor_notes_from_row(row)
    catalog = catalog_line_for_row(row, name, flavor_notes)
    stick = row.get("stickSize") or ""
    if not stick and row.get("length") and row.get("ring"):
        stick = format_stick_size(
            float(row["length"]), int(float(row["ring"])), row.get("shape") or "Robusto"
        )

    spec = _strip_empty(
        {
            "msrp": row.get("msrp"),
            "tier": row.get("tier"),
            "strength": row.get("strength"),
            "body": row.get("body"),
            "smokeTime": row.get("smokeTime"),
            "wrapper": row.get("wrapper"),
            "binder": row.get("binder"),
            "filler": row.get("filler"),
        }
    )
    guidance = _maybe_block(
        {
            "flavorFamily": row.get("flavorFamily"),
            "occasion": row.get("occasion"),
            "pairingAffinity": row.get("pairingAffinity"),
            "wrapperRole": row.get("wrapperRole"),
            "binderRole": row.get("binderRole"),
            "fillerRole": row.get("fillerRole"),
            "bestFor": row.get("bestFor"),
            "avoidIf": row.get("avoidIf"),
            "whyRecommend": row.get("whyRecommend"),
            "memberBlurb": row.get("memberBlurb"),
            "lineNote": row.get("lineNote"),
        }
    )
    provenance = _maybe_block(
        {
            "sourceConfidence": row.get("sourceConfidence"),
            "dataGrade": row.get("dataGrade"),
            "recommendationConfidence": row.get("recommendationConfidence"),
            "beginnerSafe": row.get("beginnerSafe"),
            "articleSource": row.get("articleSource"),
            "imageUrl": row.get("imageUrl"),
        }
    )

    product: dict[str, Any] = {
        "id": slug_id(row["sku"]),
        "name": name,
        "category": "cigar",
        "deckKey": "bourbon",
        "spec": spec,
        "menuLine": catalog,
        "tags": extract_tags(flavor_notes),
        "sensory": build_sensory(row),
        "tracker": {"sku": row["sku"]},
    }
    if stick:
        product["stickSize"] = stick
    if guidance:
        product["guidance"] = guidance
    if provenance:
        product["provenance"] = provenance
    parent_company = parent_company_for_row(row)
    if parent_company:
        product["parentCompany"] = parent_company
    if ca:
        product["tracker"].update(ca)
    return product


def products_from_canonical(
    canonical: dict[str, Any],
    *,
    skip_embedded_duplicates: bool = True,
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    embedded_names = load_embedded_cigar_names() if skip_embedded_duplicates else set()
    ca_parts = sorted(BASE.glob(CA_RATINGS_GLOB))
    ca_map: dict = {}
    for _p in ca_parts:
        ca_map.update(json.loads(_p.read_text(encoding="utf-8")))

    products: list[dict[str, Any]] = []
    skipped: list[str] = []
    blocked: list[str] = []

    for row in canonical.get("rows", []):
        sku = row.get("sku")
        if not sku:
            continue
        name = row.get("displayName") or display_name(row)
        if skip_embedded_duplicates and normalize_name(name) in embedded_names:
            skipped.append(f"{sku} ({name})")
            continue
        products.append(build_product(row, ca_map.get(sku)))

    return products, skipped, blocked


def _json_number(val: Any) -> Any:
    if isinstance(val, float) and val.is_integer():
        return int(val)
    return val


def _normalize_product(product: dict[str, Any]) -> dict[str, Any]:
    """Normalize product dict for JSON export (ints, omit zero msrp)."""
    out = json.loads(json.dumps(product))  # deep copy
    spec = out.get("spec") or {}
    if spec.get("msrp") in (0, 0.0, None):
        spec.pop("msrp", None)
    else:
        spec["msrp"] = _json_number(spec["msrp"])
    for key in ("tier", "strength"):
        if key in spec:
            spec[key] = _json_number(spec[key])
    if not spec:
        out.pop("spec", None)
    else:
        out["spec"] = spec
    prov = out.get("provenance") or {}
    if "dataGrade" in prov:
        prov["dataGrade"] = _json_number(prov["dataGrade"])
    if not prov:
        out.pop("provenance", None)
    else:
        out["provenance"] = prov
    return out


CIGAR_RECO_KEYS = frozenset(
    {"id", "name", "category", "deckKey", "spec", "tags", "sensory", "tracker"}
)
CIGAR_BRIEF_KEYS = frozenset(
    {"id", "menuLine", "stickSize", "guidance", "provenance", "parentCompany"}
)


def product_to_reco(product: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize_product(product)
    return {key: normalized[key] for key in CIGAR_RECO_KEYS if key in normalized}


def product_to_brief(product: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize_product(product)
    return {key: normalized[key] for key in CIGAR_BRIEF_KEYS if key in normalized}


def write_reco_briefs_json(
    products: list[dict[str, Any]],
    *,
    category: str,
    source_sku_count: int,
    generator: str,
) -> None:
    """Write sharded catalog reco + brief slices + manifest for CatalogClient."""
    if category != "cigar":
        raise ValueError(f"write_reco_briefs_json: unsupported category {category!r}")

    slice_errors = validate_reco_brief_products(products)
    if slice_errors:
        raise ValueError(
            "Catalog slice integrity failed:\n  "
            + "\n  ".join(slice_errors[:30])
            + (f"\n  ... and {len(slice_errors) - 30} more" if len(slice_errors) > 30 else "")
        )

    reco_items = [product_to_reco(p) for p in products]
    brief_items = [product_to_brief(p) for p in products]
    manifest = write_sharded_catalog_slices(
        products,
        reco_items,
        brief_items,
        category=category,
        source_sku_count=source_sku_count,
        generator=generator,
        reco_dir=CIGARS_RECO_DIR,
        briefs_dir=CIGARS_BRIEFS_DIR,
        manifest_path=CIGARS_MANIFEST,
    )
    print(
        f"Wrote {manifest['productCount']} cigars -> "
        f"{len(manifest['recoShards'])} reco shards, {len(manifest['briefShards'])} brief shards"
    )
