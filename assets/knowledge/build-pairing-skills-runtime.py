#!/usr/bin/env python3
"""Emit pairing-skills-data.js from pairing-skills-sheet-rows.json (browser runtime).

Run from docs/visionboard/assets/knowledge:
  python build-pairing-skills-runtime.py

Outputs:
  pairing-skills-data.js — compact SKILLS array (no source column; omit empty fields)
  pairing-skills.js is hand-maintained runtime (SterlonPairingSkills API)
"""
from __future__ import annotations

import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROWS_JSON = BASE / "pairing-skills-sheet-rows.json"
OUT_DATA = BASE / "pairing-skills-data.js"

COL = {
    "section": 0,
    "id": 1,
    "priority": 2,
    "title": 3,
    "rule": 4,
    "cigar": 5,
    "spirit": 6,
    "mode": 7,
    "body": 8,
    "bridges": 9,
    "example": 10,
    "triggers": 11,
}

# Runtime field order — source (sheet col M) intentionally excluded from browser bundle.
SKILL_KEYS = (
    "section",
    "id",
    "priority",
    "title",
    "rule",
    "cigarSignals",
    "spiritSignals",
    "mode",
    "bodyMatch",
    "bridges",
    "example",
    "triggers",
)


def js_str(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def row_to_skill(row: list) -> dict:
    def cell(i: int) -> str:
        return (row[i] if i < len(row) else "") or ""

    pri = cell(COL["priority"]).strip()
    return {
        "section": cell(COL["section"]).strip(),
        "id": cell(COL["id"]).strip(),
        "priority": int(pri) if pri.isdigit() else 2,
        "title": cell(COL["title"]).strip(),
        "rule": cell(COL["rule"]).strip(),
        "cigarSignals": cell(COL["cigar"]).strip(),
        "spiritSignals": cell(COL["spirit"]).strip(),
        "mode": cell(COL["mode"]).strip(),
        "bodyMatch": cell(COL["body"]).strip(),
        "bridges": cell(COL["bridges"]).strip(),
        "example": cell(COL["example"]).strip(),
        "triggers": cell(COL["triggers"]).strip(),
    }


def render_skill(s: dict, indent: str = "  ") -> str:
    parts: list[str] = []
    for key in SKILL_KEYS:
        val = s[key]
        if key == "priority":
            parts.append(f"priority:{val}")
        elif val:
            parts.append(f"{key}:{js_str(val)}")
    return indent + "{" + ",".join(parts) + "}"


def main() -> None:
    data = json.loads(ROWS_JSON.read_text(encoding="utf-8"))
    skills = [row_to_skill(r) for r in data["rows"]]
    entries = ",\n".join(render_skill(s) for s in skills)

    js = f"""/**
 * Pairing skills playbook data (generated). Load before pairing-skills.js.
 * build-pairing-skills-runtime.py · {len(skills)} skills · pairing-skills-sheet-rows.json
 * Sheet column M (Source) stays in tracker JSON only — not shipped to the browser.
 */
(function (global) {{
  'use strict';
  global.PAIRING_SKILLS_DATA = [
{entries}
  ];
}})(typeof window !== 'undefined' ? window : global);
"""
    OUT_DATA.write_text(js, encoding="utf-8")
    line_count = len(js.splitlines())
    print(f"Wrote {len(skills)} skills to {OUT_DATA.name} ({line_count} lines)")


if __name__ == "__main__":
    main()
