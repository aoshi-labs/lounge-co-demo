"""Canonical paths for Sterlon catalog data (category-first layout)."""
from __future__ import annotations

from pathlib import Path

BASE = Path(__file__).resolve().parent

# Runtime catalog (browser + Node fixtures)
CIGARS_DIR = BASE / "cigars"
SPIRITS_DIR = BASE / "spirits"
CIGARS_MANIFEST = CIGARS_DIR / "manifest.json"
SPIRITS_MANIFEST = SPIRITS_DIR / "manifest.json"
CIGARS_RECO_DIR = CIGARS_DIR / "reco"
CIGARS_BRIEFS_DIR = CIGARS_DIR / "briefs"
SPIRITS_RECO_DIR = SPIRITS_DIR / "reco"
SPIRITS_BRIEFS_DIR = SPIRITS_DIR / "briefs"

# Build-time tracker source shards (raw merged rows)
CIGARS_SOURCES_DIR = CIGARS_DIR / "sources"
CIGARS_CANONICAL_JSON = CIGARS_DIR / "canonical.json"

# Sheet push payloads for manual apply (not loaded by Sterlon at runtime)
CIGARS_PUSHES_DIR = CIGARS_DIR / "pushes"

# JS loaders stay in products/ until React port
PRODUCTS_DIR = BASE / "products"

CATALOG_BASE_URL = "assets/knowledge/"
