import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FIGHT_EVENT_VFX } from "./fight_vfx_catalog";

/**
 * Lightning Strike's card says the spell "calls lightning down on an enemy", but it used to render through
 * the same amber spawnFireBurn every other offensive spell shares — the wrong element for an AIR spell, and
 * visually indistinguishable from Fire Strike landing on the same cell.
 *
 * These assertions pin the WIRING from source rather than the prose, for the reason magic_mirror_vfx.test.ts
 * spells out: a VFX whose call site is dropped in a later conflict resolution leaves the helper, constants
 * and documentation in place and goes silently dead with every test still green. The effect firing is what
 * has to be pinned, so the checks below assert the call sits inside renderSpellDamageVfx — the shared helper
 * the live cast paths and the ranked replay path all go through, which is why this plays in ranked too.
 */
const sceneSource = (name: string): string => readFileSync(join(import.meta.dir, name), "utf8");

const renderSpellDamageVfxBody = (): string => {
    const sandbox = sceneSource("Sandbox.ts");
    const start = sandbox.indexOf("protected renderSpellDamageVfx(");
    expect(start).toBeGreaterThan(-1);
    // Bound at the next method, never a fixed character count: a window that has to be widened every time
    // the method grows fails for reasons unrelated to what it is pinning.
    const nextMethod = sandbox.slice(start + 1).search(/\n {4}(?:protected|private|public) /);
    return sandbox.slice(start, nextMethod > -1 ? start + 1 + nextMethod : undefined);
};

describe("Lightning Strike VFX wiring", () => {
    test("rides the spell_cast event, which ranked renders on its replay path", () => {
        const spellCast = FIGHT_EVENT_VFX.spell_cast;

        expect(spellCast.rendered).toBe(true);
        expect(spellCast.ranked).toBe("replay");
        expect(spellCast.note).toContain("spawnLightningStrike");
    });

    test("CombatVisuals still provides the effect", () => {
        expect(sceneSource("sandbox/CombatVisuals.ts")).toContain("public spawnLightningStrike(");
    });

    test("renderSpellDamageVfx calls it for the spell", () => {
        const body = renderSpellDamageVfxBody();

        expect(body).toContain("LIGHTNING_STRIKE_SPELL_NAME");
        expect(body).toContain("this.combatVisuals.spawnLightningStrike(hitPosition, cellSize)");
    });

    test("the bolt replaces the fire burst rather than landing on top of it", () => {
        const body = renderSpellDamageVfxBody();
        const bolt = body.indexOf("spawnLightningStrike(hitPosition");
        const burn = body.indexOf("spawnFireBurn(hitPosition");

        expect(bolt).toBeGreaterThan(-1);
        expect(burn).toBeGreaterThan(-1);
        // The two must be the branches of ONE if/else: a Lightning Strike that also puffs amber is the exact
        // thing this change set out to remove.
        const between = body.slice(bolt, burn);
        expect(between).toContain("} else {");
    });

    test("the spell name is a named constant, not an inline string in the render path", () => {
        const sandbox = sceneSource("Sandbox.ts");

        expect(sandbox).toContain('const LIGHTNING_STRIKE_SPELL_NAME = "Lightning Strike"');
        // Exactly one definition and one use: a second literal spelling would drift apart from the config.
        expect(sandbox.match(/"Lightning Strike"/g)).toHaveLength(1);
    });
});

describe("Lightning Strike bolt geometry", () => {
    const combatVisuals = (): string => sceneSource("sandbox/CombatVisuals.ts");

    test("descends from above the victim, in a y-up world", () => {
        const source = combatVisuals();
        const start = source.indexOf("private drawLightningColumn(");
        expect(start).toBeGreaterThan(-1);
        const body = source.slice(start, source.indexOf("private stepLightningStrikes(", start));

        // The column is built from the sky DOWN to the target: y is target.y + height at t=0, target.y at
        // t=1. If this ever flips, the bolt erupts out of the creature into the sky instead.
        expect(body).toContain("y: target.y + height * (1 - t)");
        expect(body).toContain("STRIKE_HEIGHT_CELLS");
    });

    test("terminates exactly on the creature, with the wander tapering to zero", () => {
        const source = combatVisuals();
        const start = source.indexOf("private drawLightningColumn(");
        const body = source.slice(start, source.indexOf("private stepLightningStrikes(", start));

        // (1 - t) is what keeps the last point at target.x: a constant wander would let the bolt land beside
        // the unit the damage number floats over.
        expect(body).toContain("spread * (1 - t)");
    });

    test("keeps its own palette so it never reads as Thunderbird's chain arc", () => {
        const source = combatVisuals();

        expect(source).toContain("const STRIKE_CORE = 0xffffff");
        // The chain ability stays violet; the spell stays white-blue. Same colour would make "the bird
        // chained me" and "a spell hit me" indistinguishable without reading the log.
        expect(source).toContain("const CHAIN_GLOW = 0x7a2dff");
        expect(source).not.toContain("const STRIKE_GLOW = 0x7a2dff");
    });
});
