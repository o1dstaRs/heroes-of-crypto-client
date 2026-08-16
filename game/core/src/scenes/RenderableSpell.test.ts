import { describe, expect, test } from "bun:test";

import { Container, Texture } from "pixi.js";

import { HoCConfig, ToFactionType } from "@heroesofcrypto/common";

import { getSpellCornerFrameTextureKey, PixiRenderableSpell } from "./RenderableSpell";

test("maps each magic school to the selected corner-frame artwork", () => {
    expect(getSpellCornerFrameTextureKey(ToFactionType.Chaos)).toBe("spell_corner_chaos_a");
    expect(getSpellCornerFrameTextureKey(ToFactionType.Nature)).toBe("spell_corner_nature_b");
    expect(getSpellCornerFrameTextureKey(ToFactionType.Life)).toBe("spell_corner_life_b");
});

describe("PixiRenderableSpell stack-requirement line", () => {
    const cardLines = (faction: string, name: string, ownerStackPower: number): string => {
        const layer = new Container();
        const spell = new PixiRenderableSpell(
            { spellProperties: HoCConfig.getSpellConfig(faction, name), amount: 1 },
            layer,
            { spell_cell_260: Texture.WHITE },
            Texture.WHITE,
            new Map(),
        );
        try {
            return spell.getHoverInfo(ownerStackPower, 2, 1, 0, 0).join("\n");
        } finally {
            spell.destroy();
            layer.destroy();
        }
    };

    test("a real minimum shows on the card even when the caster already meets it", () => {
        // Meteorite requires stack power 5 — the card must teach the gate BEFORE the player fails it.
        expect(cardLines("Chaos", "Meteorite", 5)).toContain("Requires stack power 5");
    });

    test("an unmet minimum also states the caster's own power", () => {
        expect(cardLines("Chaos", "Meteorite", 2)).toContain("Requires stack power 5 — yours is 2");
    });

    test("a trivial minimum of 1 stays silent", () => {
        expect(cardLines("Nature", "Lightning Strike", 5)).not.toContain("Requires stack power");
    });
});

describe("PixiRenderableSpell magic-damage hover", () => {
    const hoverOf = (
        faction: string,
        name: string,
        ownerStackPower: number,
        casterAmountAlive: number,
        magicDamageBonusPercentage = 0,
    ): string => {
        const layer = new Container();
        const spell = new PixiRenderableSpell(
            { spellProperties: HoCConfig.getSpellConfig(faction, name), amount: 1 },
            layer,
            { spell_cell_260: Texture.WHITE },
            Texture.WHITE,
            new Map(),
        );

        try {
            return spell.getHoverInfo(ownerStackPower, casterAmountAlive, 1, 0, magicDamageBonusPercentage).join("\n");
        } finally {
            spell.destroy();
            layer.destroy();
        }
    };

    test("shows the same combined Empower and Sylvan bonus used by the engine", () => {
        expect(hoverOf("Nature", "Lightning Strike", 5, 2, 15)).toContain("dealing 345 damage");
    });

    // The card's damage is PRE-DEFENCE and always was, but it used to be printed bare — and against the
    // element a spell counters it is not even an upper bound: a card reading 300 lands 450 on a Water
    // Element (4,967 of 5,624 measured casts disagreed with the bare figure). So the card now states the
    // band the cast can actually land in, computed from the same element table the cast resolves through.
    test("states the band a target can actually take, not just the pre-defence figure", () => {
        // Battle Mage x50: Fire Strike is 6 per caster = 300, and a Water Element takes half again as much.
        const fireStrike = hoverOf("Chaos", "Fire Strike", 5, 50);
        expect(fireStrike).toContain("dealing 300 damage");
        expect(fireStrike).toContain("A target takes 0 to 450 of it, by its element and magic resistance.");

        // Stack-powered book, same treatment: 30 * 2 * 5 = 300, +15% = 345, countered element 517.
        expect(hoverOf("Nature", "Lightning Strike", 5, 2, 15)).toContain("A target takes 0 to 517 of it");
    });

    test("a spell with no damage of its own gets no band line", () => {
        expect(hoverOf("Life", "Spiritual Armor", 5, 10)).not.toContain("A target takes 0 to");
    });
});
