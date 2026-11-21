import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { UnitSpells, unitSpellEntries } from "./UnitSpells";

test("shows remaining rune charges and keeps exhausted spells identifiable", () => {
    const html = renderToStaticMarkup(
        <UnitSpells
            unitName="Blacksmith"
            spells={["System:Armor Rune", "System:Armor Rune", "System:Weapon Rune"]}
            size={64}
        />,
    );
    expect(html).toContain('aria-label="Blacksmith magic spells"');
    expect(html).toContain('aria-label="Craft, 0 remaining"');
    expect(html).toContain('aria-label="Armor Rune, 2 remaining"');
    expect(html).toContain('aria-label="Weapon Rune, 1 remaining"');
    expect(html).toContain('alt="Craft"');
    expect(html).not.toContain('role="button"');
});

test("every spellcaster lists its own spells, not only the Blacksmith", () => {
    const healer = unitSpellEntries("Healer", ["Life:Heal", "Life:Heal", "Life:Mass Heal"]);
    expect(healer.map(({ name, remaining }) => [name, remaining])).toEqual([
        ["Heal", 2],
        ["Spiritual Armor", 0],
        ["Blessing", 0],
        ["Mass Heal", 1],
    ]);
    expect(healer.every(({ icon }) => !!icon)).toBe(true);
    expect(healer[0].description).toContain("Requires stack power");
    const mage = unitSpellEntries("Battle Mage", ["Chaos:Fire Strike", "Chaos:Meteorite"]);
    expect(mage.map(({ name }) => name)).toEqual(["Fire Strike", "Meteorite"]);
    expect(mage.every(({ icon }) => !!icon)).toBe(true);
});

test("a spell gained in play is listed after the drafted ones; non-casters show no Magic panel", () => {
    expect(unitSpellEntries("Battle Mage", ["Chaos:Fire Strike", "Life:Courage"]).map(({ name }) => name)).toEqual([
        "Fire Strike",
        "Meteorite",
        "Courage",
    ]);
    expect(unitSpellEntries("Squire", [])).toEqual([]);
    expect(renderToStaticMarkup(<UnitSpells unitName="Squire" spells={[]} size={64} />)).toBe("");
});

test("more than three spells share the same row width and move their names into the tooltips", () => {
    const spells = ["Chaos:Smoke", "Chaos:Misfortune", "Chaos:Fireforged Sword", "Chaos:Fireball"];
    const html = renderToStaticMarkup(<UnitSpells unitName="Wandering Mage" spells={spells} size={64} />);
    expect(html).toContain('aria-label="Fireball, 1 remaining"');
    expect(html).toContain('aria-label="Fireforged Sword, 1 remaining"');
    // Four tiles in the width of three: 3 x 64 + 2 gaps of 8 = 208 = 4 tiles + 3 gaps, so 46px each.
    expect(html).toContain("width:46px");
    expect(html).not.toContain(">Fireball</");
});
