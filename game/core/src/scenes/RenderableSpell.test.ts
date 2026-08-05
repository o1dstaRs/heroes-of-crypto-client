import { describe, expect, test } from "bun:test";

import { Container, Texture } from "pixi.js";

import { HoCConfig, ToFactionType } from "@heroesofcrypto/common";

import { getSpellCornerFrameTextureKey, PixiRenderableSpell } from "./RenderableSpell";

test("maps each magic school to the selected corner-frame artwork", () => {
    expect(getSpellCornerFrameTextureKey(ToFactionType.Chaos)).toBe("spell_corner_chaos_a");
    expect(getSpellCornerFrameTextureKey(ToFactionType.Nature)).toBe("spell_corner_nature_b");
    expect(getSpellCornerFrameTextureKey(ToFactionType.Life)).toBe("spell_corner_life_b");
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
