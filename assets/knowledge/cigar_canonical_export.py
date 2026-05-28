"""Canonical validation, field coverage, and build-time source shard export."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

VALID_BEGINNER_SAFE = frozenset({"Yes", "No", "Maybe"})
VALID_RECOMMENDATION_CONFIDENCE = frozenset({"High", "Medium", "Low"})
VALID_SOURCE_CONFIDENCE = frozenset(
    {
        "High",
        "Medium",
        "Low",
        "Article + inferred blend roles",
        "Retailer + inferred blend roles",
        "User-provided + inferred roles",
        "Cigar Aficionado official review",
        "Cigar Aficionado 2025 Top 25 review tasting prose",
        "Habanos official",
        "Manufacturer official",
        "Official site + halfwheel",
        "Official site + CA ratings",
        "halfwheel review + official site",
    }
)

URL_PATTERN = re.compile(r"^https?://", re.I)

COVERAGE_FIELDS = (
    "wrapperRole",
    "binderRole",
    "fillerRole",
    "bestFor",
    "avoidIf",
    "whyRecommend",
    "sourceConfidence",
    "dataGrade",
    "articleSource",
    "imageUrl",
    "beginnerSafe",
    "memberBlurb",
)

SHARD_RULES: list[tuple[str, str, Callable[[str], bool]]] = [
    ("levels.json", "levels", lambda sku: sku.startswith("L3") or sku.startswith("L4")),
    ("curated.json", "curated", lambda sku: sku.startswith("CUR-")),
    ("ca24-top25.json", "ca24-top25", lambda sku: sku.startswith("CA24-")),
    ("ca24-bestbuy.json", "ca24-bestbuy", lambda sku: sku.startswith("BB24-")),
    ("ca25-top25.json", "ca25-top25", lambda sku: sku.startswith("CA25-")),
    ("ca25-bestbuy.json", "ca25-bestbuy", lambda sku: sku.startswith("BB25-")),
    (
        "transcript.json",
        "transcript",
        lambda sku: sku.startswith("VID-") or sku.startswith("HTD-"),
    ),
]


def bucket_for_sku(sku: str) -> tuple[str, str]:
    for filename, source_id, predicate in SHARD_RULES:
        if predicate(sku):
            return filename, source_id
    return "other.json", "other"


def validate_row_format(row: dict[str, Any]) -> list[str]:
    """Hard format checks when a field is present. Returns error messages."""
    errors: list[str] = []
    sku = row.get("sku") or "?"

    bs = row.get("beginnerSafe")
    if bs is not None and str(bs).strip() and bs not in VALID_BEGINNER_SAFE:
        errors.append(f"{sku}: invalid beginnerSafe (want Yes/No/Maybe): {bs!r}")

    for url_field in ("articleSource", "imageUrl"):
        val = row.get(url_field)
        if val is not None and str(val).strip() and not URL_PATTERN.match(str(val).strip()):
            errors.append(f"{sku}: invalid {url_field} (must start with http): {val!r}")

    dg = row.get("dataGrade")
    if dg is not None:
        try:
            n = int(dg)
            if not (1 <= n <= 10):
                errors.append(f"{sku}: dataGrade out of range (1–10): {dg}")
        except (TypeError, ValueError):
            errors.append(f"{sku}: invalid dataGrade: {dg!r}")

    sc = row.get("sourceConfidence")
    if sc is not None and str(sc).strip() and sc not in VALID_SOURCE_CONFIDENCE:
        errors.append(f"{sku}: invalid sourceConfidence: {sc!r}")

    rc = row.get("recommendationConfidence")
    if rc is not None and str(rc).strip() and rc not in VALID_RECOMMENDATION_CONFIDENCE:
        errors.append(f"{sku}: invalid recommendationConfidence: {rc!r}")

    return errors


def compute_field_coverage(rows: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {field: 0 for field in COVERAGE_FIELDS}
    for row in rows:
        for field in COVERAGE_FIELDS:
            val = row.get(field)
            if val is None:
                continue
            if isinstance(val, str) and not val.strip():
                continue
            counts[field] += 1
    counts["_totalRows"] = len(rows)
    return counts


_SHARD_CHUNK = 13  # max rows per source file; keeps output under 500 lines


def _write_shard_rows(
    shard_rows: list[dict[str, Any]],
    stem: str,
    source_id: str,
    shards_dir: Path,
    ts: str,
) -> list[dict[str, Any]]:
    """Write one logical shard, splitting into numbered files if over _SHARD_CHUNK."""
    import math

    manifest: list[dict[str, Any]] = []
    if len(shard_rows) <= _SHARD_CHUNK:
        filename = f"{stem}.json"
        payload = {"version": 1, "source": source_id, "generatedAt": ts,
                   "rowCount": len(shard_rows), "rows": shard_rows}
        (shards_dir / filename).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        manifest.append({"path": f"cigars/sources/{filename}", "source": source_id,
                          "rowCount": len(shard_rows)})
    else:
        parts = math.ceil(len(shard_rows) / _SHARD_CHUNK)
        # Remove any stale single-file version before writing parts.
        stale = shards_dir / f"{stem}.json"
        if stale.exists():
            stale.unlink()
        for i in range(parts):
            chunk = shard_rows[i * _SHARD_CHUNK:(i + 1) * _SHARD_CHUNK]
            filename = f"{stem}-{i + 1:02d}.json"
            payload = {"version": 1, "source": source_id, "generatedAt": ts,
                       "part": i + 1, "totalParts": parts,
                       "rowCount": len(chunk), "rows": chunk}
            (shards_dir / filename).write_text(
                json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            manifest.append({"path": f"cigars/sources/{filename}", "source": source_id,
                              "part": i + 1, "rowCount": len(chunk)})
    return manifest


def write_source_shards(
    rows: list[dict[str, Any]],
    shards_dir: Path,
    *,
    generated_at: str | None = None,
) -> list[dict[str, Any]]:
    """Write audit shards; return manifest entries for merged canonical."""
    shards_dir.mkdir(parents=True, exist_ok=True)
    ts = generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    buckets: dict[str, list[dict[str, Any]]] = {source_id: [] for _, source_id, _ in SHARD_RULES}
    buckets["other"] = []

    for row in rows:
        _, source_id = bucket_for_sku(row.get("sku") or "")
        buckets[source_id].append(row)

    manifest: list[dict[str, Any]] = []
    for filename, source_id, _ in SHARD_RULES:
        stem = filename.removesuffix(".json")
        manifest.extend(_write_shard_rows(buckets.get(source_id, []), stem, source_id, shards_dir, ts))

    other_rows = buckets.get("other", [])
    if other_rows:
        manifest.extend(_write_shard_rows(other_rows, "other", "other", shards_dir, ts))

    return manifest
