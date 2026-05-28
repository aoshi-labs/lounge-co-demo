#!/usr/bin/env python3
"""Build + emit Spirits tab rows from Royal Batch 2025 US best-sellers article."""
from __future__ import annotations

import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
SPREADSHEET_ID = "1mLHCA8rvvl5G87FJCxg5tkoDQ1Xp5FDx2QBm7Ty-WUU"
START_ROW = 84
ARTICLE = (
    "https://www.royalbatch.com/blog-detail/"
    "best-selling-alcohol-in-the-usa-in-2025-what-americans-actually-chose"
)


def e(
    sku, brand, name, expr, stype, style, origin, tier, journey, rank, proof,
    mash, family, occasion, pairing, notes, research, best, avoid, why, msrp, blurb,
):
    return {
        "sku": sku, "brand": brand, "name": name, "expr": expr, "type": stype,
        "style": style, "origin": origin, "tier": tier, "journey": journey,
        "rank": rank, "proof": proof, "mash": mash, "family": family,
        "occasion": occasion, "pairing": pairing, "notes": notes, "research": research,
        "best": best, "avoid": avoid, "why": why, "msrp": msrp, "blurb": blurb,
        "source": "Industry reference (US retail sales 2025)",
        "article": ARTICLE,
    }


ROWS = [
    e(
        "SPI-TRK-TITOS", "Tito's", "Tito's Handmade Vodka", "Handmade",
        "Vodka", "Corn vodka (gluten-free)", "Texas", 3, "novice", 83, 80,
        "100% corn", "Clean & crisp", "Cocktail / everyday", "Mild cigar",
        "clean, black pepper, sweet corn, citrus peel, mineral, smooth",
        "2025 #1 spirit by volume in multiple US control-state markets (Royal Batch / retail data).",
        "Vodka soda, martini, member wants America's top-selling spirit name.",
        "User wants brown spirits or heavy flavor only.",
        "Recommend when the member names Tito's or wants the best-selling US vodka — clean, neutral, cocktail-ready.",
        28,
        "Tito's Handmade — America's best-selling vodka by volume. Clean corn spirit built for soda, tonic, and letting a mild cigar speak.",
    ),
    e(
        "SPI-TRK-SMIRNOFF-21", "Smirnoff", "Smirnoff No. 21 Vodka", "No. 21",
        "Vodka", "Triple-distilled vodka", "USA (multi-origin)", 2, "novice", 84, 80,
        "Grain spirit", "Neutral & clean", "Cocktail", "Mild cigar",
        "neutral, light citrus, grain, mineral, smooth, faint sweetness",
        "Top value-tier vodka contributor in 2025 US sales (Royal Batch).",
        "Budget vodka cocktails, party pours, flavored-margarita base.",
        "User wants premium wheat vodka character only.",
        "Recommend for value vodka cocktails — neutral base that will not fight a Connecticut cigar.",
        16,
        "Smirnoff No. 21 — the value vodka America still buys in volume. Neutral, mixable, and honest about what it is.",
    ),
    e(
        "SPI-TRK-NEW-AMSTERDAM", "New Amsterdam", "New Amsterdam Vodka", "Original",
        "Vodka", "Grain vodka", "California", 2, "novice", 85, 80,
        "Grain spirit", "Citrus & clean", "Cocktail", "Mild cigar",
        "citrus, clean grain, light sweetness, mineral, smooth, faint vanilla",
        "Major value/flavored vodka segment performer in 2025 (Royal Batch).",
        "House vodka, citrus cocktails, budget-conscious member.",
        "User wants single-estate craft character.",
        "Recommend when the lounge needs an approachable house vodka — citrus lift without Grey Goose pricing.",
        15,
        "New Amsterdam — citrus-leaning grain vodka in the value tier America actually buys. Fine for highballs beside a mild smoke.",
    ),
    e(
        "SPI-TRK-LUNAZUL-BLANCO", "Lunazul", "Lunazul Blanco Tequila", "Blanco",
        "Tequila", "100% agave blanco", "Jalisco, Mexico", 3, "novice", 86, 80,
        "100% Blue Weber agave", "Fresh agave", "Cocktail / neat", "Mild / medium cigar",
        "cooked agave, citrus, white pepper, mineral, light herbal, clean finish",
        "Strong accessible tequila performer in 2025 US sales (Royal Batch).",
        "Tequila beginner, margarita night, authentic agave without premium price.",
        "User wants only luxury añejo sweetness.",
        "Recommend when the member wants real blanco agave on a budget — pepper, citrus, and cooked agave.",
        22,
        "Lunazul Blanco — 100% agave authenticity without the premium sticker. The tequila Americans bought when they were not splurging on Patrón.",
    ),
    e(
        "SPI-TRK-DONJULIO-REP", "Don Julio", "Don Julio Reposado", "Reposado",
        "Tequila", "100% agave reposado", "Jalisco, Mexico", 5, "intermediate", 87, 80,
        "100% Blue Weber agave", "Oak & agave", "After dinner", "Medium-full cigar",
        "cooked agave, vanilla, caramel, oak, light pepper, honey, dried fruit",
        "Repeat-buyer reposado in 2025 premium tequila segment (Royal Batch).",
        "Member moving from cocktails to sipping tequila, medium-full cigar night.",
        "User wants only blanco crispness or ultra-luxury 1942.",
        "Recommend when the member wants Don Julio character below 1942 — vanilla, oak, and agave for sipping.",
        55,
        "Don Julio Reposado — the tequila people buy twice. Vanilla and oak over cooked agave when someone is done with shots and ready to sip.",
    ),
    e(
        "SPI-TRK-JD-OLD7", "Jack Daniel's", "Jack Daniel's Old No. 7", "Old No. 7",
        "Tennessee Whiskey", "Tennessee whiskey (charcoal mellowed)", "Tennessee", 3, "novice", 88, 80,
        "Corn, rye, malt (Lincoln County Process)", "Banana & caramel", "Everyday pour", "Natural / Habano",
        "banana, caramel, vanilla, toasted oak, light smoke, brown sugar",
        "Among most-purchased American spirits nationwide in 2025 (Royal Batch).",
        "Jack Daniel's name ask, Tennessee whiskey curious, classic bar call.",
        "User wants Kentucky bourbon or Scotch only.",
        "Recommend when the member wants the iconic Jack pour — banana bread sweetness and charcoal-mellowed Tennessee oak.",
        28,
        "Jack Daniel's Old No. 7 — the black-label Tennessee whiskey America never stopped buying. Banana, caramel, and charcoal mellow beside a Habano.",
    ),
    e(
        "SPI-TRK-JIM-BEAM-WHITE", "Jim Beam", "Jim Beam Kentucky Straight Bourbon", "White Label",
        "Bourbon", "Kentucky Straight Bourbon", "Kentucky", 2, "novice", 89, 80,
        "Corn-forward Jim Beam family mash", "Vanilla & oak", "Everyday pour", "Mild / medium cigar",
        "vanilla, caramel, oak, light corn sweetness, gentle spice, toasted nuts",
        "Household bourbon staple in 2025 American whiskey sales (Royal Batch).",
        "Bourbon beginner, Old Fashioned base, budget Kentucky pour.",
        "User wants allocated or high-proof only.",
        "Recommend as America's everyday bourbon — vanilla, caramel, and oak without pretense.",
        20,
        "Jim Beam White Label — the bourbon in every American pantry. Vanilla and caramel Kentucky honesty beside a medium cigar.",
    ),
    e(
        "SPI-TRK-MAKERS-MARK", "Maker's Mark", "Maker's Mark Kentucky Straight Bourbon", "Standard",
        "Bourbon", "Wheated bourbon", "Kentucky", 4, "intermediate", 90, 90,
        "Wheated mash (no rye)", "Vanilla & caramel", "After dinner", "Medium cigar",
        "vanilla, caramel, honey, orange peel, oak, baking spice, almond",
        "Premium bourbon steady seller for gifting and sipping in 2025 (Royal Batch).",
        "Wheated bourbon fan, gift pour, red-wax recognition, medium cigar.",
        "User wants high-rye spice bomb only.",
        "Recommend when the member wants wheated sweetness with red-wax credibility — honey, vanilla, and soft spice.",
        32,
        "Maker's Mark — wheated bourbon with the red wax everyone recognizes. Honey and vanilla over orange peel when rye feels too sharp.",
    ),
    e(
        "SPI-TRK-JAMESON-ORIG", "Jameson", "Jameson Irish Whiskey", "Original",
        "Irish Whiskey", "Blended Irish whiskey", "Ireland", 3, "novice", 91, 80,
        "Pot still & grain whiskey blend", "Honey & orchard", "Everyday pour", "Mild / medium cigar",
        "honey, green apple, vanilla, light spice, toasted wood, floral malt",
        "Top-selling imported whiskey style in US 2025 rankings (Royal Batch).",
        "Irish whiskey beginner, St. Patrick's crowd, green-bottle recognition.",
        "User wants single malt Scotch only.",
        "Recommend when the member wants the Jameson everyone knows — honey, apple, and easy Irish malt.",
        28,
        "Jameson Original — Ireland's green bottle on every American bar. Honey and green apple malt that works neat, on ice, or beside a medium cigar.",
    ),
    e(
        "SPI-TRK-HENNESSY-VS", "Hennessy", "Hennessy VS", "VS",
        "Cognac", "Cognac VS", "Cognac, France", 4, "intermediate", 92, 80,
        "Ugni Blanc distillate", "Fruit & oak", "Celebration / cocktail", "Medium-full cigar",
        "grape, oak, vanilla, almond, light spice, dried fruit, honey",
        "Top cognac by dollar sales in US 2025 (Royal Batch); VS entry tier.",
        "Hennessy name at VS tier, cognac-curious, hip-hop/culture recognition.",
        "User wants only XO luxury.",
        "Recommend when Hennessy is the ask at entry tier — grape, almond, and oak before VSOP pricing.",
        42,
        "Hennessy VS — the cognac tier America buys in volume. Grape and almond over French oak when the member wants the Hennessy name without XO money.",
    ),
]


def catalog_line(r: dict) -> str:
    abv = round(r["proof"] * 0.5, 1)
    jnote = (
        f" · Journey: {r['journey'].capitalize()}"
        if r["type"] in ("Bourbon", "Rye", "Tennessee Whiskey")
        else ""
    )
    parts = r["notes"].split(",")
    note_preview = f"{parts[0]}, {parts[1].strip()}" if len(parts) > 1 else parts[0]
    return (
        f"{r['name']} · {r['origin']} · ${r['msrp']} · {r['proof']} proof ({abv}% ABV){jnote} · "
        f"Notes: {note_preview}"
    )


def row_array(r: dict) -> list:
    abv = round(r["proof"] * 0.5, 1)
    return [
        r["sku"], r["brand"], r["name"], r["expr"], r["type"], r["style"], r["origin"],
        r["tier"], r["journey"], r["rank"], r["proof"], abv, r["mash"], r["family"],
        r["occasion"], r["pairing"], r["notes"], r["research"], r["best"], r["avoid"],
        r["why"], "High", r["source"], r["msrp"], catalog_line(r), r["blurb"],
        "US best-selling spirits 2025 (Royal Batch)", "", r["article"], "Tracker", 7,
    ]


def main() -> None:
    values = [row_array(r) for r in ROWS]
    end_row = START_ROW + len(values) - 1
    (BASE / "spirit-royalbatch-2025-rows.json").write_text(
        json.dumps(ROWS, indent=2), encoding="utf-8"
    )
    (BASE / "spirit-royalbatch-2025-sheet.json").write_text(
        json.dumps({
            "spreadsheet_id": SPREADSHEET_ID,
            "sheet_name": "Spirits",
            "first_cell_location": f"A{START_ROW}",
            "value_input_option": "USER_ENTERED",
            "values": values,
        }, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {len(values)} rows -> Spirits!A{START_ROW}:AE{end_row}")


if __name__ == "__main__":
    main()
