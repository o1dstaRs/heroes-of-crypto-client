import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Container, Texture } from "pixi.js";

import { HoCConfig } from "@heroesofcrypto/common";

import { PixiRenderableSpell } from "./RenderableSpell";

/**
 * Two spellbook-card features reach the player only through a chain of four links: the scene stores the
 * value on an `sc_hover*` field, PixiGameManager copies it into the emitted IHoverInfo, VisibleState
 * declares it, and the Popover renders it. Break any ONE and the feature goes silently dead — the helper,
 * the type and the renderer all still compile, and no test notices.
 *
 * That is not hypothetical here. The merge "preserve current visuals over main overlaps" (34703340,
 * 2026-08-23) removed `sc_hoverSpellElement` and the line that forwarded it, while leaving IHoverInfo's
 * field and the Popover's element chip in place — so the chip simply stopped appearing, with every test
 * green. The same merge dropped the offensive damage band. Both are restored here, so both get pinned.
 *
 * The wiring assertions read source for the reason magic_mirror_vfx.test.ts spells out: asserting the
 * behaviour of a renderer that nothing feeds proves nothing.
 */
const src = (name: string): string => readFileSync(join(import.meta.dir, name), "utf8");
const uiSrc = (name: string): string => readFileSync(join(import.meta.dir, "..", "ui", name), "utf8");
const pixiSrc = (name: string): string => readFileSync(join(import.meta.dir, "..", "pixi", name), "utf8");

describe("spell hover wiring reaches the Popover", () => {
    for (const [label, sceneField, hoverField] of [
        ["spell element", "sc_hoverSpellElement", "spellElement"],
        ["effect summary", "sc_hoverSpellEffectSummary", "spellEffectSummary"],
    ] as const) {
        test(`${label}: the scene carries it`, () => {
            const scene = pixiSrc("PixiScene.ts");
            expect(scene).toContain(`public ${sceneField}`);
            // cleanupHoverText must clear it, or a stale card survives the next hover.
            const cleanup = scene.slice(scene.indexOf("public cleanupHoverText("));
            expect(cleanup.slice(0, 900)).toContain(sceneField);
        });

        test(`${label}: PixiGameManager forwards it into the emitted hover info`, () => {
            expect(pixiSrc("PixiGameManager.ts")).toContain(`${hoverField}: this.m_scene.${sceneField}`);
        });

        test(`${label}: VisibleState declares it and the Popover renders it`, () => {
            expect(src("VisibleState.ts")).toContain(`${hoverField}?:`);
            expect(uiSrc("Popover/PopoverRuntime.tsx")).toContain(`hoverInfo.${hoverField}`);
        });

        test(`${label}: Sandbox sets it when a spell is hovered`, () => {
            const sandbox = src("Sandbox.ts");
            const start = sandbox.indexOf("private setSpellHoverInfo(");
            expect(start).toBeGreaterThan(-1);
            const nextMethod = sandbox.slice(start + 1).search(/\n {4}(?:private|public|protected) /);
            const body = sandbox.slice(start, nextMethod > -1 ? start + 1 + nextMethod : undefined);
            expect(body).toContain(`this.${sceneField} =`);
        });
    }
});

describe("offensive spell cards state the band, not a bare figure", () => {
    const detailsOf = (faction: string, name: string) => {
        const layer = new Container();
        const spell = new PixiRenderableSpell(
            { spellProperties: HoCConfig.getSpellConfig(faction, name), amount: 1 },
            layer,
            { spell_cell_260: Texture.WHITE },
            Texture.WHITE,
            new Map(),
        );
        try {
            return spell.getHoverDetails(5, 2, 1, 0, 0);
        } finally {
            spell.destroy();
            layer.destroy();
        }
    };

    test("an elemental offensive spell names the range its damage can land in", () => {
        const lines = detailsOf("Nature", "Lightning Strike").information.join("\n");

        // The bare pre-defence figure read as "the damage" and was wrong far more often than right — against
        // a countered element it UNDERSTATES by a third. The card says what the number is not.
        expect(lines).toContain("A target takes 0 to");
        expect(lines).toContain("element and magic resistance");
    });

    test("a buff card carries no damage band and no damage summary", () => {
        const details = detailsOf("Life", "Spiritual Armor");

        expect(details.information.join("\n")).not.toContain("A target takes 0 to");
        expect(details.effectSummary?.kind).not.toBe("damage");
    });
});
