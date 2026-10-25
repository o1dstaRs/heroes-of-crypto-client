import { describe, expect, test } from "bun:test";
import {
    Grid,
    GridMath,
    GridSettings,
    GridVals,
    SpellMultiplierType,
    SpellTargetType,
    TeamVals,
    type HoCMath,
    type Spell,
    type Unit,
} from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";
import { PlayAimKind } from "../api/play_protocol";
import type { AimGeometry } from "./opponentAimGeometry";

const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);

function fixture(farSide = false) {
    const grid = new Grid(settings, GridVals.NORMAL);
    if (farSide)
        grid.setScatteredMountains([
            { x: 11, y: 4 },
            { x: 11, y: 6 },
        ]);
    const units = new Map<string, Unit>();
    const add = (name: string, base: HoCMath.XY, width = 1, height = 1, team = TeamVals.RIGHT) => {
        const cells = GridMath.getFootprintCellsForAnchor(base, width, height);
        const unit = {
            getId: () => name,
            getName: () => name,
            getTeam: () => team,
            getBaseCell: () => base,
            getCells: () => cells,
            getPosition: () => GridMath.getPositionForCells(settings, cells)!,
            isDead: () => false,
        } as unknown as Unit;
        units.set(name, unit);
        expect(grid.occupyCells(cells, name, team, 1, false, false)).toBe(true);
        return unit;
    };
    const caster = add("Wandering Mage", { x: 1, y: 14 }, 1, 1, TeamVals.LEFT);
    const dragon = add("Magic Dragon", { x: 15, y: 2 }, 2, 2);
    const wolf = add("Wolf", { x: 13, y: 1 }, 2, 1);
    const satyr = add("Satyr", { x: 14, y: 0 });
    const mage = add("Battle Mage", { x: 15, y: 0 });
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        grid,
        unitsHolder: { getAllUnits: () => units },
        sc_sceneSettings: { getGridSettings: () => settings },
    }) as {
        splashedSpellTargets(spell: Spell, caster: Unit, target: Unit, aimedTarget?: Unit): Unit[];
        renderOpponentAim(): void;
    };
    return { caster, dragon, wolf, satyr, mage, scene };
}

describe("Fireball splash preview uses the accepted impact cell", () => {
    for (const intercepted of [false, true]) {
        test(`${intercepted ? "intercepted" : "direct"} Dragon hit previews Wolf and spares Mage and Satyr`, () => {
            const s = fixture();
            const spell = { getName: () => "Fireball" } as Spell;
            const splash = s.scene.splashedSpellTargets(spell, s.caster, s.dragon, intercepted ? s.mage : s.dragon);
            expect(splash.map((unit) => unit.getId())).toEqual([s.wolf.getId()]);
        });
    }

    test("Ring of Fire still surrounds the entire Dragon footprint", () => {
        const s = fixture();
        const spell = { getName: () => "Ring of Fire" } as Spell;
        const splash = s.scene.splashedSpellTargets(spell, s.caster, s.dragon);
        expect(splash.map((unit) => unit.getId()).sort()).toEqual(
            [s.wolf, s.satyr, s.mage].map((unit) => unit.getId()).sort(),
        );
    });

    test("a far-side aiming edge previews splash around the first Dragon cell struck", () => {
        const s = fixture(true);
        const spell = { getName: () => "Fireball" } as Spell;
        const splash = s.scene.splashedSpellTargets(spell, s.caster, s.dragon);
        expect(splash.map((unit) => unit.getId())).toEqual([s.wolf.getId()]);
    });

    test("the opponent's relayed ray stops at the same first Dragon cell as its splash", () => {
        const s = fixture(true);
        const spell = {
            getName: () => "Fireball",
            isBuff: () => false,
            getSpellTargetType: () => SpellTargetType.ANY_ENEMY,
            getMultiplierType: () => SpellMultiplierType.UNIT_AMOUNT_DAMAGE,
        } as Spell;
        Object.assign(s.caster, { getBookSpellByName: () => spell });
        const painted: AimGeometry[] = [];
        Object.assign(s.scene, {
            currentActiveUnit: s.caster,
            opponentAim: {
                kind: PlayAimKind.SPELL,
                unitId: s.caster.getId(),
                spellName: "Fireball",
                targetUnitId: s.dragon.getId(),
                expiresAt: performance.now() + 10_000,
            },
            canControlCurrentActiveUnit: () => false,
            isPlayingActionAnimation: () => false,
            attackHandler: { evaluateRangeAttack: () => undefined },
            hoverManager: { clearOpponentIntentSilhouette: () => undefined },
            opponentAimOverlay: { paint: (geometry: AimGeometry) => painted.push(geometry), graphics: {} },
        });
        s.scene.renderOpponentAim();
        expect(painted).toHaveLength(1);
        expect(GridMath.getCellForPosition(settings, painted[0].ray!.to)).toEqual({ x: 14, y: 2 });
        expect(painted[0].cells.every((cell) => cell.y > 0)).toBe(true);
    });
});
