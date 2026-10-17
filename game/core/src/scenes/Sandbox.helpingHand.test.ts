import { describe, expect, mock, test } from "bun:test";
import {
    AbilityFactory,
    AttackHandler,
    EffectFactory,
    FightStateManager,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
} from "@heroesofcrypto/common";
import { Container } from "pixi.js";

import { Sandbox } from "./Sandbox";
import type { RenderableUnit } from "./RenderableUnit";
import { HelpingHandLinks } from "./sandbox/HelpingHandLinks";

const fixture = () => {
    FightStateManager.getInstance().reset();
    const settings = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const grid = new Grid(settings, GridVals.NORMAL);
    const unitsHolder = new UnitsHolder(grid);
    const effectFactory = new EffectFactory();
    const abilityFactory = new AbilityFactory(effectFactory);
    const add = (faction: string, name: string, x: number) => {
        const base = Unit.createUnit(
            HoCConfig.getCreatureConfig(TeamVals.LEFT, faction, name, "", 12),
            settings,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            abilityFactory,
            effectFactory,
            false,
        );
        const unit = Object.assign(base, {
            getVisualCenter: () => base.getPosition(),
            hasAnimationState: () => false,
            getShatterInfo: () => undefined,
            destroyVisuals: mock(),
        });
        const position = GridMath.getPositionForCell(
            { x, y: 3 },
            settings.getMinX(),
            settings.getStep(),
            settings.getHalfStep(),
        );
        unit.setPosition(position.x, position.y);
        unit.setStackPower(5);
        unitsHolder.addUnit(unit);
        grid.occupyCells(unit.getCells(), unit.getId(), unit.getTeam(), unit.getAttackRange(), true, true);
        return unit;
    };
    const caster = add("Nature", "Satyr", 3);
    const target = add("Life", "Squire", 6);
    const log = { updateLog: mock(), getLog: () => "", hasBeenUpdated: () => false, clear: mock() };
    const handler = new AttackHandler(settings, grid, log, {
        add: mock(),
        get: () => [],
        has: () => false,
        clear: mock(),
    });
    expect(
        handler.handleMagicAttack(
            grid.getMatrix(),
            unitsHolder,
            caster.getSpells().find((spell) => spell.getName() === "Helping Hand"),
            caster,
            target,
        ).completed,
    ).toBe(true);
    unitsHolder.refreshStackPowerForAllUnits();
    const root = new Container();
    const links = new HelpingHandLinks({
        getUnits: () => unitsHolder.getAllUnits(),
        getGridSettings: () => settings,
        attachToWorldRoot: (graphics) => root.addChild(graphics),
    });
    links.update(0);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder,
        dyingVisualUnits: new Set(),
        snapshotRenderableUnits: () => unitsHolder.getAllUnits(),
        combatVisuals: { endHelpingHandLinksForUnit: (id: string) => links.endForUnit(id) },
    }) as {
        destroyReplayAttackUnitsAtImpact(ids: string[]): void;
        preparePyreDeaths(events: unknown[], units: ReadonlyMap<string, Unit>): void;
        playCustomDeathAnimation(unit: RenderableUnit): boolean;
        renderPyreExplosion: (event: unknown, delay: number, removeBody: () => void) => void;
    };
    return { caster, target, unitsHolder, links, root, scene };
};

describe("Helping Hand impact presentation", () => {
    test.each(["caster", "target"] as const)(
        "ranked %s death ends the transfer at impact before logical deletion",
        (endpoint) => {
            const f = fixture();
            try {
                expect(f.links.active).toBe(true);
                expect(f[endpoint].isDead()).toBe(false);
                f.scene.destroyReplayAttackUnitsAtImpact([f[endpoint].getId()]);
                expect(f.links.active).toBe(false);
                expect(f.target.getUnitProperties().helping_hand_caster_id).toBeUndefined();
                expect(f.target.hasBuffActive("Helping Hand")).toBe(false);
                expect(f.caster.hasDebuffActive("Helping Hand")).toBe(false);
                expect(f.target.getMaxHp()).toBe(9);
                expect(f.caster.getMaxHp()).toBe(15);
                expect(f[endpoint].destroyVisuals).toHaveBeenCalledTimes(1);
                expect(f.unitsHolder.getAllUnits().has(f[endpoint].getId())).toBe(true);
                f.links.update(1 / 60);
                expect(f.links.active).toBe(false);
            } finally {
                f.links.clear();
                f.root.destroy({ children: true });
            }
        },
    );

    test("a Last Fuse death ends its link before the explosion cleanup finishes", () => {
        const f = fixture();
        try {
            const removeBodies: (() => void)[] = [];
            f.scene.renderPyreExplosion = (_event, _delay, removeBody) => removeBodies.push(removeBody);
            f.scene.preparePyreDeaths(
                [{ type: "pyre_exploded", unitId: f.target.getId(), position: f.target.getPosition(), hits: [] }],
                f.unitsHolder.getAllUnits(),
            );
            f.scene.playCustomDeathAnimation(f.target as unknown as RenderableUnit);
            expect(f.links.active).toBe(false);
            expect(removeBodies).toHaveLength(1);
            removeBodies[0]();
            expect(f.target.destroyVisuals).toHaveBeenCalledTimes(1);
            expect(f.caster.hasDebuffActive("Helping Hand")).toBe(false);
        } finally {
            f.links.clear();
            f.root.destroy({ children: true });
        }
    });
});
