#!/usr/bin/env python3
"""Thin wrapper — prefer `cigar_catalog_cli.py build` or npm run test:catalog-integrity."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))

from cigar_catalog_cli import cmd_build  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(cmd_build(argparse.Namespace()))
