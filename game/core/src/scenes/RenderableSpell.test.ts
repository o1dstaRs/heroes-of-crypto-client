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
    test("shows the same combined Empower and Sylvan bonus used by the engine", () => {
        const layer = new Container();
        const spell = new PixiRenderableSpell(
            { spellProperties: HoCConfig.getSpellConfig("Nature", "Lightning Strike"), amount: 1 },
            layer,
            { spell_cell_260: Texture.WHITE },
            Texture.WHITE,
            new Map(),
        );

        try {
            const hover = spell.getHoverInfo(5, 2, 1, 0, 15).join("\n");
            expect(hover).toContain("dealing 345 damage");
        } finally {
            spell.destroy();
            layer.destroy();
        }
    });
});
