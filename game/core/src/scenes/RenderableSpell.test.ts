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

describe("PixiRenderableSpell effect summary", () => {
    const summaryOf = (
        faction: string,
        name: string,
        ownerStackPower: number,
        casterAmountAlive: number,
        casterCumulativeMaxHp = 1,
        magicDamageBonusPercentage = 0,
        healingBonusPercentage = 0,
    ) => {
        const layer = new Container();
        const spell = new PixiRenderableSpell(
            { spellProperties: HoCConfig.getSpellConfig(faction, name), amount: 1 },
            layer,
            { spell_cell_260: Texture.WHITE },
            Texture.WHITE,
            new Map(),
        );

        try {
            return spell.getHoverDetails(
                ownerStackPower,
                casterAmountAlive,
                casterCumulativeMaxHp,
                0,
                magicDamageBonusPercentage,
                healingBonusPercentage,
            ).effectSummary;
        } finally {
            spell.destroy();
            layer.destroy();
        }
    };

    test("highlights calculated spell damage", () => {
        expect(summaryOf("Nature", "Lightning Strike", 5, 2, 1, 15)).toEqual({
            kind: "damage",
            label: "Spell damage",
            value: "345",
            detail: "Before resistance and element",
        });
    });

    test("highlights healing in HP", () => {
        expect(summaryOf("Life", "Heal", 1, 2)).toEqual({
            kind: "healing",
            label: "Healing",
            value: "10 HP",
        });
        expect(summaryOf("Life", "Mass Heal", 3, 3, 1, 0, 50)).toEqual({
            kind: "healing",
            label: "Healing per ally",
            value: "11 HP",
        });
    });

    test("highlights buff and debuff percentages", () => {
        expect(summaryOf("Life", "Spiritual Armor", 1, 2)).toEqual({
            kind: "buff",
            label: "Buff",
            value: "+30%",
        });
        expect(summaryOf("Death", "Quagmire", 1, 2)).toEqual({
            kind: "debuff",
            label: "Debuff",
            value: "−25%",
        });
    });

    test("highlights max-HP terrain damage and smoke reduction", () => {
        expect(summaryOf("Chaos", "Fire Wall", 4, 2)).toEqual({
            kind: "damage",
            label: "Damage per cell",
            value: "25% max HP",
            detail: "Friend or foe",
        });
        expect(summaryOf("Chaos", "Smoke", 4, 2)).toEqual({
            kind: "debuff",
            label: "Ranged damage",
            value: "−50%",
            detail: "When the shot crosses smoke",
        });
    });

    test("does not invent a percentage for non-numeric status spells", () => {
        expect(summaryOf("Chaos", "Misfortune", 1, 2)).toBeUndefined();
    });
});
