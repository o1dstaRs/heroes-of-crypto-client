import { describe, expect, test } from "bun:test";

import { Container, Texture } from "pixi.js";

import { HoCConfig } from "@heroesofcrypto/common";

import { PixiRenderableSpell } from "./RenderableSpell";

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
        expect(cardLines("Nature", "Meteorite", 5)).toContain("Requires stack power 5");
    });

    test("an unmet minimum also states the caster's own power", () => {
        expect(cardLines("Nature", "Meteorite", 2)).toContain("Requires stack power 5 — yours is 2");
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

describe("PixiRenderableSpell card hit area", () => {
    test("the spell icon remains hoverable on both tilted pages when the idle frame has no fill", () => {
        const layer = new Container();
        const spell = new PixiRenderableSpell(
            { spellProperties: HoCConfig.getSpellConfig("Nature", "Lightning Strike"), amount: 1 },
            layer,
            { spell_cell_260: Texture.WHITE },
            Texture.WHITE,
            new Map(),
        );

        try {
            for (const page of [1, 4]) {
                spell.renderOnPage(page, 5);
                const iconBounds = spell.getSprite().getBounds();
                expect(
                    spell.isHover(
                        {
                            x: (iconBounds.minX + iconBounds.maxX) / 2,
                            y: (iconBounds.minY + iconBounds.maxY) / 2,
                        },
                        5,
                    ),
                ).toBeTrue();
            }
        } finally {
            spell.destroy();
            layer.destroy();
        }
    });

    test("reuses its amount text style and skips unchanged frame redraws", () => {
        const layer = new Container();
        const spell = new PixiRenderableSpell(
            { spellProperties: HoCConfig.getSpellConfig("Nature", "Lightning Strike"), amount: 1 },
            layer,
            { spell_cell_260: Texture.WHITE },
            Texture.WHITE,
            new Map(),
        );

        try {
            const amountText = (spell as unknown as { amountText: { style: object } }).amountText;
            const renderAmountOwner = spell as unknown as {
                renderAmount: (cellX: number, cellY: number, enabled: boolean) => void;
            };
            const renderAmount = renderAmountOwner.renderAmount.bind(spell);
            let amountRenderCount = 0;
            renderAmountOwner.renderAmount = (cellX, cellY, enabled) => {
                amountRenderCount++;
                renderAmount(cellX, cellY, enabled);
            };
            const style = amountText.style;
            spell.renderOnPage(1, 5);
            spell.renderOnPage(1, 5);
            expect(amountText.style).toBe(style);
            expect(amountRenderCount).toBe(1);

            spell.syncAmount(2);
            spell.renderOnPage(1, 5);
            expect(amountRenderCount).toBe(2);
        } finally {
            spell.destroy();
            layer.destroy();
        }
    });
});
