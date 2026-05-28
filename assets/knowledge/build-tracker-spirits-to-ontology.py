#!/usr/bin/env python3
"""Generate catalog JSON slices from Spirit Research Tracker exports.

Reads tracker-sterlon-spirits-all.json SKU list, row data from
spirit-research-tracker-all-rows-01..07.json,
curated-spirit-products.json, and spirit-official-notes-master.json.

Run from docs/visionboard/assets/knowledge:
  python export-spirit-tracker-from-sheet.py   # optional sheet sync
  python build-tracker-spirits-to-ontology.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent

from catalog_paths import (  # noqa: E402
    SPIRITS_BRIEFS_DIR,
    SPIRITS_MANIFEST,
    SPIRITS_RECO_DIR,
)
from catalog_slice_export import write_sharded_catalog_slices  # noqa: E402

CURATED_SPIRITS = BASE / "curated-spirit-products.json"
BATCH_FILE = BASE / "tracker-sterlon-spirits-all.json"
OFFICIAL_NOTES_GLOB = "spirit-official-notes-master-*.json"

ROW_JSON_GLOBS = (
    "spirit-research-tracker-all-rows-01.json",
    "spirit-research-tracker-all-rows-02.json",
    "spirit-research-tracker-all-rows-03.json",
    "spirit-research-tracker-all-rows-04.json",
    "spirit-research-tracker-all-rows-05.json",
    "spirit-research-tracker-all-rows-06.json",
    "spirit-research-tracker-all-rows-07.json",
)

# Card-facing display names (short menu labels; overrides sheet Product Name when set).
DISPLAY_NAMES: dict[str, str] = {
    "SPI-TRK-BT-BUFFALO": "Buffalo Trace",
    "SPI-TRK-WOODFORD": "Woodford Reserve",
    "SPI-TRK-OF-1920": "Old Forester 1920",
    "SPI-TRK-EAGLE-RARE": "Eagle Rare 10yr",
    "SPI-TRK-WP-10": "WhistlePig 10yr",
    "SPI-TRK-SAZERAC-RYE": "Sazerac Rye",
    "SPI-TRK-MACALLAN-12": "Macallan 12",
    "SPI-TRK-LAG-16": "Lagavulin 16",
    "SPI-TRK-GLENFID-12": "Glenfiddich 12",
    "SPI-TRK-JW-BLUE": "Johnnie Walker Blue",
    "SPI-TRK-HIBIKI-HARMONY": "Hibiki Harmony",
    "SPI-TRK-YAMAZAKI-12": "Yamazaki 12",
    "SPI-TRK-DIPLO-RE": "Diplomatico Reserva Exclusiva",
    "SPI-TRK-ZACAPA-23": "Zacapa 23",
    "SPI-TRK-HENNESSY-XO": "Hennessy XO",
    "SPI-TRK-REMY-XO": "Rémy Martin XO",
    "SPI-TRK-CLASE-AZUL-REP": "Clase Azul Reposado",
    "SPI-TRK-DJ-1942": "Don Julio 1942",
    "SPI-TRK-WELLER-SR": "Weller Special Reserve",
    "SPI-TRK-4R-SB": "Four Roses Single Barrel",
    "SPI-TRK-TITOS": "Tito's Handmade Vodka",
    "SPI-TRK-SMIRNOFF-21": "Smirnoff No. 21 Vodka",
    "SPI-TRK-NEW-AMSTERDAM": "New Amsterdam Vodka",
    "SPI-TRK-JD-OLD7": "Jack Daniel's Old No. 7",
    "SPI-TRK-JIM-BEAM-WHITE": "Jim Beam Kentucky Straight Bourbon",
    "SPI-TRK-MAKERS-MARK": "Maker's Mark Kentucky Straight Bourbon",
    "SPI-TRK-JAMESON-ORIG": "Jameson Irish Whiskey",
    "SPI-TRK-HENNESSY-VS": "Hennessy VS",
    "SPI-TRK-ARDBEG-10": "Ardbeg 10",
    "SPI-TRK-BASIL-HAYDEN": "Basil Hayden's",
    "SPI-TRK-BULLEIT-BBN": "Bulleit Bourbon",
    "SPI-TRK-CASAMIGOS-REP": "Casamigos Reposado",
    "SPI-TRK-CHIVAS-12": "Chivas Regal 12",
    "SPI-TRK-DALMORE-12": "Dalmore 12",
    "SPI-TRK-EC-SB": "Elijah Craig Small Batch",
    "SPI-TRK-LUNAZUL-BLANCO": "Lunazul Blanco",
    "SPI-TRK-DONJULIO-REP": "Don Julio Reposado",
}

STYLE_DECK_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(vodka)\b", re.I), "vodka"),
    (re.compile(r"\b(cognac|brandy|v\.?s\.?o\.?p)\b", re.I), "cognac"),
    (re.compile(r"\b(irish whiskey|irish whisky)\b", re.I), "irish"),
    (re.compile(r"\b(tequila|mezcal|agave spirit|reposado|añejo|anejo)\b", re.I), "agave"),
    (re.compile(r"\b(rum|rhum)\b", re.I), "rum"),
    (re.compile(r"\b(japanese whisky|japanese whiskey)\b", re.I), "japanese"),
    (re.compile(r"\b(islay|peated|peat smoke|lagavulin|laphroaig|ardbeg|talisker)\b", re.I), "peated"),
    (re.compile(r"\b(scotch|single malt|blended scotch|speyside)\b", re.I), "scotch"),
    (re.compile(r"\b(straight rye|rye whiskey|rye whisky|bottled.in.bond.*rye)\b", re.I), "rye"),
    (re.compile(r"\b(bourbon|tennessee whiskey|kentucky straight)\b", re.I), "bourbon"),
]

NAME_DECK_OVERRIDES: dict[str, str] = {
    "lagavulin 16": "peated",
    "lagavulin 8 year": "peated",
    "ardbeg 10": "peated",
    "laphroaig 10 year": "peated",
    "laphroaig 10": "peated",
    "talisker 10 year": "peated",
    "whistlepig 10yr": "rye",
    "sazerac rye": "rye",
    "hibiki harmony": "japanese",
    "yamazaki 12": "japanese",
    "hakushu 12": "japanese",
    "nikka from the barrel": "japanese",
    "nikka coffey grain whisky": "japanese",
    "hakushu 12 year": "japanese",
    "mars iwai tradition": "japanese",
    "martell blue swift": "cognac",
    "hennessy vs": "cognac",
    "hennessy xo": "cognac",
    "rémy martin xo": "cognac",
    "courvoisier vsop": "cognac",
    "mount gay xo": "rum",
    "diplomatico reserva exclusiva": "rum",
    "zacapa 23": "rum",
    "jameson irish whiskey": "irish",
    "redbreast 12": "irish",
    "tito's handmade vodka": "vodka",
    "smirnoff no. 21 vodka": "vodka",
    "new amsterdam vodka": "vodka",
}

# Mirrors sterlon-flavor-match.js FLAVOR_LEXICON (spirit-relevant phrases).
FLAVOR_LEXICON: list[tuple[str, list[str]]] = [
    ("ripe_apple", ["ripe apples", "ripe apple"]),
    ("dark_chocolate", ["dark chocolate"]),
    ("dark_fruit", ["dark fruit"]),
    ("dried_fruit", ["dried fruit", "dried fruits"]),
    ("orange_peel", ["orange peel", "orange zest"]),
    ("chocolate", ["chocolate", "cocoa", "cacao", "hint of chocolate"]),
    ("caramel", ["sweet caramel", "caramel"]),
    ("cherry", ["cherries", "cherry", "cherry preserves"]),
    ("tobacco", ["tobacco", "tobacco spice"]),
    ("oak", ["toasted oak", "oak", "mizunara oak", "elegant oak"]),
    ("wood", ["wood", "woody", "woodiness", "wood smoke"]),
    ("apple", ["apples", "apple", "green apple"]),
    ("peat", ["peated", "peat smoke", "peat"]),
    ("smoke", ["smoky", "smoke"]),
    ("iodine", ["iodine", "medicinal"]),
    ("sherry", ["sherried", "sherry cask", "sherry sweetness"]),
    ("honey", ["honeyed", "honey", "honeysuckle"]),
    ("vanilla", ["vanilla"]),
    ("citrus", ["citrus", "lemon", "orange", "grapefruit"]),
    ("floral", ["floral", "flower"]),
    ("espresso", ["espresso"]),
    ("cocoa", ["cocoa"]),
    ("cedar", ["cedar"]),
    ("cream", ["creamy", "cream"]),
    ("pepper", ["white pepper", "pepper", "peppery", "rye spice", "green pepper"]),
    ("leather", ["leather"]),
    ("earth", ["earthy", "earth"]),
    ("coffee", ["coffee"]),
    ("spice", ["spice", "spicy", "baking spice", "spiced nuts"]),
    ("walnut", ["walnut"]),
    ("toffee", ["toffee", "butterscotch"]),
    ("maple", ["maple", "maple syrup"]),
    ("mint", ["mint", "menthol"]),
    ("anise", ["anise", "licorice"]),
    ("molasses", ["molasses"]),
    ("brown_sugar", ["brown sugar"]),
    ("berry", ["stewed berries", "berries"]),
    ("pear", ["pear"]),
    ("peach", ["peach", "pineapple"]),
    ("pineapple", ["pineapple"]),
    ("plum", ["ripe plum", "plum"]),
    ("nutmeg", ["nutmeg"]),
    ("cinnamon", ["cinnamon", "ginger"]),
    ("ginger", ["ginger"]),
    ("coconut", ["toasted coconut", "coconut"]),
    ("nougat", ["nougat"]),
    ("malt", ["malt"]),
    ("herbal", ["herbal", "herbs", "basil", "rosemary"]),
    ("incense", ["incense"]),
    ("sandalwood", ["sandalwood"]),
    ("white_chocolate", ["white chocolate"]),
    ("hazelnut", ["hazelnut", "toasted hazelnut"]),
    ("apricot", ["apricot"]),
    ("fig", ["fig"]),
    ("maritime", ["maritime", "sea salt", "seaweed", "saline"]),
    ("agave", ["agave"]),
    ("banana", ["banana"]),
    ("lychee", ["lychee"]),
    ("rose", ["rose"]),
    ("fresh", ["fresh", "bright"]),
]


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip()).lower()


def load_curated_spirits() -> list[dict]:
    if not CURATED_SPIRITS.exists():
        return []
    doc = json.loads(CURATED_SPIRITS.read_text(encoding="utf-8"))
    return list(doc.get("products") or [])


def load_json_rows() -> dict[str, dict]:
    merged: dict[str, dict] = {}
    for name in ROW_JSON_GLOBS:
        path = BASE / name
        if not path.exists():
            continue
        for row in json.loads(path.read_text(encoding="utf-8")):
            sku = row.get("sku")
            if sku:
                merged[sku] = {**merged.get(sku, {}), **row}
    return merged


def load_official_notes() -> dict[str, dict]:
    parts = sorted(BASE.glob(OFFICIAL_NOTES_GLOB))
    merged: dict[str, dict] = {}
    for p in parts:
        data = json.loads(p.read_text(encoding="utf-8"))
        merged.update({k: v for k, v in data.items() if not k.startswith("_")})
    return merged


def slug_id(sku: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", sku.lower()).strip("-")


def display_name(row: dict) -> str:
    sku = row["sku"]
    if sku in DISPLAY_NAMES:
        return DISPLAY_NAMES[sku]
    raw = (row.get("name") or row.get("brand") or sku).strip()
    return re.sub(r"\s+", " ", raw)


def extract_tags(flavor_notes: str) -> list[dict]:
    text = (flavor_notes or "").lower()
    hits: list[tuple[int, str]] = []
    for tag_id, phrases in sorted(FLAVOR_LEXICON, key=lambda x: -max(len(p) for p in x[1])):
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
        for i, tag_id in enumerate(ordered[:8])
    ] or [{"id": "oak", "weight": 0.7}, {"id": "spice", "weight": 0.65}]


def deck_key_for(row: dict, flavor_notes: str, display: str) -> str:
    name = normalize_name(display)
    if name in NAME_DECK_OVERRIDES:
        return NAME_DECK_OVERRIDES[name]

    st = (row.get("type") or "").lower()
    style = (row.get("style") or "").lower()
    origin = (row.get("origin") or "").lower()
    notes = (flavor_notes or "").lower()
    blob = f"{name} {st} {style} {origin} {notes}"

    if st in ("tequila", "mezcal"):
        return "agave"
    if st == "vodka":
        return "vodka"
    if st == "gin" or "gin" in style:
        return "vodka"
    if st in ("cognac", "brandy"):
        return "cognac"
    if st == "rum":
        return "rum"
    if "irish" in st:
        return "irish"
    if st == "rye" or st == "straight rye":
        return "rye"
    if st == "japanese whisky" or origin == "japan":
        return "japanese"

    for pattern, deck in STYLE_DECK_RULES:
        if pattern.search(blob):
            return deck
    return "bourbon"


def build_sensory(row: dict, flavor_notes: str) -> dict:
    tier = int(row.get("tier") or 5)
    proof = float(row.get("proof") or 90)
    ff = (row.get("family") or "").lower()
    st = (row.get("type") or "").lower()
    notes = (flavor_notes or "").lower()

    body = min(9, max(3, 3 + tier // 2 + (1 if proof >= 100 else 0)))
    if st == "vodka":
        body = max(2, min(4, body - 2))
        sweetness = 4
        cocoa = 2
    pepper = min(10, max(2, 2 + int((proof - 80) / 10)))
    if st == "rye" or "rye" in st:
        pepper = min(10, pepper + 2)
    if "peat" in notes or "pepper" in notes:
        pepper = max(pepper, 6)
    if "peat" in notes or "iodine" in notes or "smoke" in notes:
        pepper = min(10, max(pepper, 7))

    sweetness = 6 if st != "vodka" else sweetness
    if any(x in ff for x in ("vanilla", "honey", "caramel", "sweet", "luxury")):
        sweetness = 7
    if st in ("rum", "cognac", "tequila", "brandy"):
        sweetness = min(9, sweetness + 1)
    if st == "tequila" and "reposado" in notes:
        sweetness = min(8, sweetness + 1)
        body = max(3, body - 1)

    cocoa = 7 if any(x in notes for x in ("chocolate", "cocoa", "cacao", "fudge")) else 4
    if st == "vodka":
        cocoa = 2
    if "chocolate" in ff or "cocoa" in ff:
        cocoa = 8

    earthiness = 4
    if "peat" in notes or "iodine" in notes or "seaweed" in notes:
        earthiness = 8
    elif st in ("scotch", "whisky", "whiskey") and "smoke" in notes:
        earthiness = 6
    elif st == "mezcal":
        earthiness = 7

    return {
        "body": body,
        "sweetness": sweetness,
        "pepper": pepper,
        "cocoa": cocoa,
        "earthiness": earthiness,
    }


def flavor_notes_for_row(row: dict, official: dict | None) -> str:
    if official and official.get("notes"):
        return str(official["notes"]).strip()
    return (row.get("notes") or "").strip()


def menu_line(name: str, row: dict, flavor_notes: str, proof: float | None) -> str:
    catalog = (row.get("catalogLine") or "").strip()
    if catalog:
        return catalog

    msrp = row.get("msrp")
    price = f"${int(msrp)}" if msrp else "—"
    style = row.get("style") or row.get("type") or ""
    mash = (row.get("mash") or "").strip()
    journey = (row.get("journey") or "").strip()
    st = (row.get("type") or "").lower()

    proof_bit = f"{proof} proof" if proof else ""
    if proof:
        abv = round(proof / 2, 1)
        proof_bit += f" ({abv}% ABV)"

    journey_bit = ""
    if journey:
        if st in ("bourbon", "rye"):
            journey_bit = f" · Whiskey Journey: {journey.capitalize()}"
        else:
            journey_bit = f" · {journey.capitalize()} pour"

    parts = [name, style, price]
    if proof_bit:
        parts.append(proof_bit)
    if mash and len(mash) <= 72:
        parts.append(mash)
    core = " · ".join(p for p in parts if p)
    return f"{core}{journey_bit} · Notes: {flavor_notes}"


def build_guidance(row: dict) -> dict:
    g: dict = {}
    if row.get("best"):
        g["bestFor"] = str(row["best"]).strip()
    if row.get("avoid"):
        g["avoidIf"] = str(row["avoid"]).strip()
    if row.get("why"):
        g["whyRecommend"] = str(row["why"]).strip()
    if row.get("occasion"):
        g["occasion"] = str(row["occasion"]).strip()
    if row.get("family"):
        g["flavorFamily"] = str(row["family"]).strip()
    if row.get("pairing"):
        g["pairingAffinity"] = str(row["pairing"]).strip()
    if row.get("blurb"):
        g["memberBlurb"] = str(row["blurb"]).strip()
    return g


def build_provenance(row: dict) -> dict:
    journey = (row.get("journey") or "").lower()
    tier = int(row.get("tier") or 5)
    p: dict = {}
    if journey == "novice" or tier <= 3:
        p["beginnerSafe"] = "Yes"
    elif journey == "advanced" or tier >= 6:
        p["beginnerSafe"] = "No"
    else:
        p["beginnerSafe"] = "Maybe"
    if row.get("source"):
        p["sourceConfidence"] = str(row["source"]).strip()
    if row.get("dataGrade") is not None:
        p["dataGrade"] = row["dataGrade"]
    return p


def build_product(row: dict, official: dict | None) -> dict:
    name = display_name(row)
    proof = None
    if official and official.get("proof") is not None:
        proof = float(official["proof"])
    elif row.get("proof") is not None:
        proof = float(row["proof"])

    flavor_notes = flavor_notes_for_row(row, official)
    st = row.get("type") or ""
    origin = row.get("origin") or ""

    msrp = row.get("msrp")
    if msrp is not None:
        msrp = float(msrp)

    spec: dict = {
        "proof": proof,
        "abvPercent": round(proof / 2, 1) if proof else row.get("abv"),
        "mash": row.get("mash") or "",
        "style": row.get("style") or st,
        "origin": origin,
    }
    if msrp is not None:
        spec["msrp"] = int(msrp) if msrp == int(msrp) else msrp

    product = {
        "id": slug_id(row["sku"]),
        "name": name,
        "category": "spirit",
        "deckKey": deck_key_for(row, flavor_notes, name),
        "spec": spec,
        "journeyLevel": row.get("journey") or "intermediate",
        "journeyRank": int(row.get("rank") or 5),
        "menuLine": menu_line(name, row, flavor_notes, proof),
        "tags": extract_tags(flavor_notes),
        "sensory": build_sensory({**row, "proof": proof}, flavor_notes),
        "tracker": {"sku": row["sku"]},
        "guidance": build_guidance(row),
        "provenance": build_provenance(row),
    }
    if official and official.get("article"):
        product["tracker"]["article"] = official["article"]
    elif row.get("article"):
        product["tracker"]["article"] = row["article"]
    if official and official.get("source"):
        product["tracker"]["source"] = official["source"]
    elif row.get("source"):
        product["tracker"]["source"] = row["source"]
    return product


SPIRIT_RECO_KEYS = frozenset(
    {
        "id",
        "name",
        "category",
        "deckKey",
        "spec",
        "tags",
        "sensory",
        "tracker",
        "journeyLevel",
        "journeyRank",
    }
)
SPIRIT_BRIEF_KEYS = frozenset({"id", "menuLine", "guidance", "provenance"})


SPIRIT_RECO_OPTIONAL_KEYS = frozenset({"expertise", "presentation", "awards"})


def product_to_reco(product: dict) -> dict:
    out = {key: product[key] for key in SPIRIT_RECO_KEYS if key in product}
    for key in SPIRIT_RECO_OPTIONAL_KEYS:
        if key in product:
            out[key] = product[key]
    return out


def product_to_brief(product: dict) -> dict:
    brief = {key: product[key] for key in SPIRIT_BRIEF_KEYS if key in product}
    g = brief.get("guidance") or {}
    if g and not g.get("memberBlurb") and product.get("menuLine"):
        pass
    return brief


def write_reco_briefs_json(products: list[dict], *, batch_sku_count: int) -> None:
    reco_items = [product_to_reco(p) for p in products]
    brief_items = [product_to_brief(p) for p in products]
    manifest = write_sharded_catalog_slices(
        products,
        reco_items,
        brief_items,
        category="spirit",
        source_sku_count=batch_sku_count,
        generator="build-tracker-spirits-to-ontology.py",
        reco_dir=SPIRITS_RECO_DIR,
        briefs_dir=SPIRITS_BRIEFS_DIR,
        manifest_path=SPIRITS_MANIFEST,
    )
    print(
        f"Wrote {manifest['productCount']} spirits -> "
        f"{len(manifest['recoShards'])} reco shards, {len(manifest['briefShards'])} brief shards"
    )


def main() -> None:
    if not BATCH_FILE.exists():
        raise SystemExit(f"Missing {BATCH_FILE.name} — run export-spirit-tracker-from-sheet.py first")

    batch = json.loads(BATCH_FILE.read_text(encoding="utf-8"))
    skus: list[str] = batch["skus"]
    curated = load_curated_spirits()
    curated_names = {normalize_name(p.get("name") or "") for p in curated}
    json_rows = load_json_rows()
    official_map = load_official_notes()

    products: list[dict] = list(curated)
    missing: list[str] = []

    for sku in skus:
        row = json_rows.get(sku)
        if not row:
            missing.append(sku)
            continue
        row = {**row, "sku": sku}
        name = display_name(row)
        if normalize_name(name) in curated_names:
            continue
        products.append(build_product(row, official_map.get(sku)))

    if missing:
        raise SystemExit(f"Missing tracker data for: {', '.join(missing)}")

    write_reco_briefs_json(products, batch_sku_count=len(skus) + len(curated))


if __name__ == "__main__":
    main()
