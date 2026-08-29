import { describe, expect, test } from "bun:test";
import { pierceSweepPreviewOptions } from "./pierceSweepPreview";

const attacker = (...abilities: string[]) => ({
    hasAbilityActive: (name: string) => abilities.includes(name),
});

/**
 * These expectations MIRROR the engine. If a sweep ability changes its own `nextStandingTargets` flags,
 * this preview has to move with it — common/test/abilities/pierce_sweep_contract.test.ts pins the other
 * half of the pair.
 */
describe("pierce sweep hover preview mirrors the ability that fires it", () => {
    test("Skewer Strike does not pierce a large primary target", () => {
        // skewer_strike_ability.ts: nextStandingTargets(..., false /* pierceLargeUnits */, true)
        expect(pierceSweepPreviewOptions(attacker("Aggr", "Skewer Strike", "Wardguard"))).toEqual({
            pierceLargeUnits: false,
            onlyOppositeTeam: true,
            source: "Skewer Strike",
        });
    });

    test("Fire Breath keeps the helper's defaults", () => {
        // fire_breath_ability.ts: nextStandingTargets(fromUnit, toUnit, grid, unitsHolder, targetMovePosition)
        expect(pierceSweepPreviewOptions(attacker("Fire Element", "Enchanted Skin", "Fire Breath"))).toEqual({
            pierceLargeUnits: true,
            onlyOppositeTeam: false,
            source: "Fire Breath",
        });
    });
});
