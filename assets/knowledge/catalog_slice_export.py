"""Shard catalog reco/brief JSON + manifest for category-first folders."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from catalog_paths import (
    CIGARS_BRIEFS_DIR,
    CIGARS_MANIFEST,
    CIGARS_RECO_DIR,
    SPIRITS_BRIEFS_DIR,
    SPIRITS_MANIFEST,
    SPIRITS_RECO_DIR,
)
from cigar_canonical_export import bucket_for_sku

# Target ~500 lines/file at ~45–55 lines/product (JSON indent=2) + ~15-line envelope.
MAX_PRODUCTS_PER_SHARD_FILE: dict[str, dict[str, int]] = {
    "cigar": {"reco": 9, "briefs": 9},
    "spirit": {"reco": 8, "briefs": 8},
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def spirit_shard_id(sku: str) -> str:
    if sku.startswith("SPI-CUR-"):
        return "curated"
    if sku.startswith("SPI-TRK-"):
        return "tracker"
    return "other"


def cigar_shard_id(sku: str) -> str:
    filename, _source = bucket_for_sku(sku)
    return filename.replace(".json", "")


def _sku_from_product(product: dict[str, Any]) -> str:
    tracker = product.get("tracker") or {}
    if isinstance(tracker, dict) and tracker.get("sku"):
        return str(tracker["sku"]).strip().upper()
    pid = str(product.get("id") or "").strip()
    if pid.startswith("cigar-"):
        return pid.replace("cigar-", "", 1).upper()
    if pid.startswith("spirit-"):
        return pid.replace("spirit-", "", 1).upper()
    # Brief slice ids are lowercase sku slugs (e.g. cur-01-hoyo-sanjuan).
    return pid.upper()


def bucket_product(
    product: dict[str, Any],
    *,
    category: str,
) -> str:
    sku = _sku_from_product(product)
    if category == "cigar":
        return cigar_shard_id(sku)
    if category == "spirit":
        return spirit_shard_id(sku)
    raise ValueError(f"unsupported category {category!r}")


def group_products_by_shard(
    products: list[dict[str, Any]],
    *,
    category: str,
) -> dict[str, list[dict[str, Any]]]:
    buckets: dict[str, list[dict[str, Any]]] = {}
    for product in products:
        shard = bucket_product(product, category=category)
        buckets.setdefault(shard, []).append(product)
    return buckets


def _sort_products_stable(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(products, key=lambda p: (_sku_from_product(p), str(p.get("id") or "")))


def _split_product_chunks(
    products: list[dict[str, Any]],
    max_per_file: int,
) -> list[list[dict[str, Any]]]:
    if not products:
        return []
    if max_per_file <= 0 or len(products) <= max_per_file:
        return [products]
    return [
        products[i : i + max_per_file] for i in range(0, len(products), max_per_file)
    ]


def _shard_part_names(shard: str, part_count: int) -> list[str]:
    if part_count <= 0:
        return []
    if part_count == 1:
        return [shard]
    return [f"{shard}-{idx:02d}" for idx in range(1, part_count + 1)]


def _clear_slice_dir(slice_dir: Path) -> None:
    if not slice_dir.is_dir():
        return
    for path in slice_dir.glob("*.json"):
        path.unlink()


def _write_shard_file(
    path: Path,
    *,
    shard: str,
    category: str,
    slice_name: str,
    generated_at: str,
    generator: str,
    products: list[dict[str, Any]],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "shard": shard,
        "category": category,
        "slice": slice_name,
        "generatedAt": generated_at,
        "generator": generator,
        "productCount": len(products),
        "products": products,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_sharded_catalog_slices(
    products: list[dict[str, Any]],
    reco_items: list[dict[str, Any]],
    brief_items: list[dict[str, Any]],
    *,
    category: str,
    source_sku_count: int,
    generator: str,
    reco_dir: Path,
    briefs_dir: Path,
    manifest_path: Path,
    bucket_fn: Callable[[dict[str, Any]], str] | None = None,
) -> dict[str, Any]:
    """Write reco/* + briefs/* shards and manifest.json; return manifest dict."""
    generated_at = _utc_now()
    limits = MAX_PRODUCTS_PER_SHARD_FILE.get(category, {"reco": 9, "briefs": 9})
    reco_by_shard = group_products_by_shard(reco_items, category=category)
    brief_by_shard = group_products_by_shard(brief_items, category=category)

    _clear_slice_dir(reco_dir)
    _clear_slice_dir(briefs_dir)

    all_shards = sorted(set(reco_by_shard) | set(brief_by_shard))
    reco_paths: list[str] = []
    brief_paths: list[str] = []

    for shard in all_shards:
        reco_sorted = _sort_products_stable(reco_by_shard.get(shard, []))
        brief_sorted = _sort_products_stable(brief_by_shard.get(shard, []))
        brief_by_id = {b["id"]: b for b in brief_sorted if b.get("id")}

        if not reco_sorted and not brief_sorted:
            continue

        if reco_sorted:
            reco_chunks = _split_product_chunks(reco_sorted, limits["reco"])
            part_names = _shard_part_names(shard, len(reco_chunks))
            for part_name, reco_chunk in zip(part_names, reco_chunks, strict=True):
                brief_chunk = [
                    brief_by_id[pid]
                    for p in reco_chunk
                    if (pid := p.get("id")) and pid in brief_by_id
                ]
                reco_rel = f"reco/{part_name}.json"
                brief_rel = f"briefs/{part_name}.json"
                _write_shard_file(
                    reco_dir / f"{part_name}.json",
                    shard=part_name,
                    category=category,
                    slice_name="reco",
                    generated_at=generated_at,
                    generator=generator,
                    products=reco_chunk,
                )
                _write_shard_file(
                    briefs_dir / f"{part_name}.json",
                    shard=part_name,
                    category=category,
                    slice_name="briefs",
                    generated_at=generated_at,
                    generator=generator,
                    products=brief_chunk,
                )
                if reco_chunk:
                    reco_paths.append(reco_rel)
                if brief_chunk:
                    brief_paths.append(brief_rel)
            continue

        brief_chunks = _split_product_chunks(brief_sorted, limits["briefs"])
        part_names = _shard_part_names(shard, len(brief_chunks))
        for part_name, brief_chunk in zip(part_names, brief_chunks, strict=True):
            brief_rel = f"briefs/{part_name}.json"
            _write_shard_file(
                briefs_dir / f"{part_name}.json",
                shard=part_name,
                category=category,
                slice_name="briefs",
                generated_at=generated_at,
                generator=generator,
                products=brief_chunk,
            )
            if brief_chunk:
                brief_paths.append(brief_rel)

    manifest = {
        "version": 1,
        "category": category,
        "generatedAt": generated_at,
        "generator": generator,
        "sourceSkuCount": source_sku_count,
        "productCount": len(products),
        "recoShards": reco_paths,
        "briefShards": brief_paths,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def load_products_from_manifest(
    manifest_path: Path,
    *,
    base_dir: Path | None = None,
    slice_key: str,
) -> list[dict[str, Any]]:
    """Load and concatenate products from manifest shard list."""
    if not manifest_path.is_file():
        return []
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    root = base_dir or manifest_path.parent
    shard_paths = manifest.get(slice_key) or []
    products: list[dict[str, Any]] = []
    for rel in shard_paths:
        doc = json.loads((root / rel).read_text(encoding="utf-8"))
        chunk = doc.get("products") if isinstance(doc, dict) else doc
        if isinstance(chunk, list):
            products.extend(chunk)
    return products


def load_reco_brief_from_category(category: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if category == "cigar":
        manifest = CIGARS_MANIFEST
        base = CIGARS_MANIFEST.parent
    elif category == "spirit":
        manifest = SPIRITS_MANIFEST
        base = SPIRITS_MANIFEST.parent
    else:
        raise ValueError(category)
    reco = load_products_from_manifest(manifest, base_dir=base, slice_key="recoShards")
    briefs = load_products_from_manifest(manifest, base_dir=base, slice_key="briefShards")
    return reco, briefs
