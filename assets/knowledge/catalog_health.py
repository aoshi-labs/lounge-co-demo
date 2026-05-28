"""Repo health metrics for catalog + Sterlon hotspots (AGENTS.md caps)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
VISIONBOARD = BASE.parent.parent
JS = VISIONBOARD / "assets" / "javascript"
RECO_RUNTIME = JS / "recommendation-runtime"

# AGENTS.md soft / hard caps
# Legacy god-file — shrink-only per AGENTS.md (was ~3300; target glue <600)
STERLON_CHAT_TARGET = 600
STERLON_CHAT_REGRESSION = 1700
MODULE_SOFT = 400
MODULE_HARD = 600
ONTOLOGY_SOFT = 400
ONTOLOGY_HARD = 600

KNOWLEDGE_NOISE_GLOBS = (
    "*.b64",
    "wb-*.py",
    "_wb_*.py",
    "cigar-push-chunk-*.json",
    "bb24-*",
    "bb25-*",
)


def _line_count(path: Path) -> int:
    if not path.is_file():
        return 0
    return sum(1 for _ in path.open(encoding="utf-8", errors="replace"))


def _count_glob(root: Path, pattern: str) -> int:
    return len(list(root.glob(pattern)))


def check_sterlon_files() -> list[str]:
    issues: list[str] = []
    chat = JS / "sterlon-chat.js"
    chat_lines = _line_count(chat)
    if chat_lines > STERLON_CHAT_REGRESSION:
        issues.append(
            f"sterlon-chat.js {chat_lines} lines (shrink-only legacy — above {STERLON_CHAT_REGRESSION}; extract, do not grow)"
        )
    elif chat_lines > STERLON_CHAT_TARGET:
        issues.append(
            f"sterlon-chat.js {chat_lines} lines (above shrink target {STERLON_CHAT_TARGET})"
        )

    ontology_name = "ontology-policy.js"
    skip_runtime = {ontology_name}

    for path in sorted(RECO_RUNTIME.glob("*.js")):
        if path.name in ("index.js", "README.md") or path.name in skip_runtime:
            continue
        n = _line_count(path)
        if n > MODULE_HARD:
            issues.append(f"{path.name} {n} lines (hard cap {MODULE_HARD})")
        elif n > MODULE_SOFT:
            issues.append(f"{path.name} {n} lines (soft cap {MODULE_SOFT})")

    ontology = RECO_RUNTIME / ontology_name
    ont_lines = _line_count(ontology)
    if ont_lines > ONTOLOGY_HARD:
        issues.append(f"{ontology_name} {ont_lines} lines (hard cap {ONTOLOGY_HARD})")
    elif ont_lines > ONTOLOGY_SOFT:
        issues.append(
            f"{ontology_name} {ont_lines} lines (soft cap {ONTOLOGY_SOFT}) — consider split"
        )

    reco = BASE / "products" / "sterlon-recommendations.js"
    if reco.is_file():
        r = _line_count(reco)
        if r > MODULE_HARD:
            issues.append(f"sterlon-recommendations.js {r} lines (hard cap {MODULE_HARD})")

    return issues


def check_knowledge_hygiene() -> dict[str, int]:
    counts = {pat: _count_glob(BASE, pat) for pat in KNOWLEDGE_NOISE_GLOBS}
    counts["py_scripts"] = len(list(BASE.glob("*.py")))
    return counts


def check_catalog_slices() -> list[str]:
    issues: list[str] = []
    from catalog_paths import CIGARS_MANIFEST
    from catalog_slice_export import load_products_from_manifest

    if not CIGARS_MANIFEST.is_file():
        issues.append("missing cigars/manifest.json — run npm run catalog:sync")
        return issues

    products = load_products_from_manifest(CIGARS_MANIFEST, slice_key="recoShards")
    briefs = load_products_from_manifest(CIGARS_MANIFEST, slice_key="briefShards")
    brief_ids = {b.get("id") for b in briefs if b.get("id")}
    missing_brief = [p.get("id") for p in products if p.get("id") and p["id"] not in brief_ids]
    if missing_brief:
        issues.append(f"{len(missing_brief)} reco ids missing briefs")

    parent = sum(
        1
        for b in briefs
        if isinstance(b, dict) and (b.get("parentCompany") or "").strip()
    )
    print(f"Catalog: {len(products)} cigars, {parent} with parentCompany in briefs")
    return issues


def main() -> int:
    print("=== Catalog & Sterlon health ===\n")

    hygiene = check_knowledge_hygiene()
    noise_total = sum(hygiene.get(k, 0) for k in KNOWLEDGE_NOISE_GLOBS)
    print("Knowledge folder:")
    print(f"  Python scripts in root: {hygiene.get('py_scripts', 0)}")
    for pat in KNOWLEDGE_NOISE_GLOBS:
        c = hygiene.get(pat, 0)
        if c:
            print(f"  gitignored-style artifacts ({pat}): {c}")
    if noise_total > 50:
        print(f"  WARN: {noise_total} ephemeral files — safe to delete locally; see .gitignore")

    print("\nSterlon hotspots:")
    issues = check_sterlon_files()
    issues.extend(check_catalog_slices())
    if issues:
        for msg in issues:
            print(f"  WARN: {msg}")
        print("\nHealth: WARN (review before merge)")
        return 1

    print("\nHealth: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
