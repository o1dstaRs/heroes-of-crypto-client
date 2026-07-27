import { describe, expect, test } from "bun:test";

import { Container, Texture } from "pixi.js";

import { HoCConfig } from "@heroesofcrypto/common";

import { PixiRenderableSpell } from "./RenderableSpell";

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
