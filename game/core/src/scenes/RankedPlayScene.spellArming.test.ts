import { afterEach, describe, expect, test } from "bun:test";
import { Container, Texture } from "pixi.js";

import {
    AbilityFactory,
    AttackHandler,
    AttackVals,
    EffectFactory,
    FightStateManager,
    GameActionEngine,
    Grid,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    MoveHandler,
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
    type GameAction,
    type ISceneLog,
    type TeamType,
} from "@heroesofcrypto/common";

import { RankedPlayScene } from "./RankedPlayScene";
import { RenderableUnit } from "./RenderableUnit";
import type { PixiRenderableSpell } from "./RenderableSpell";
import type { AuthoritativeGameSnapshot } from "../game_action_transport";

const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
const manager = FightStateManager.getInstance();
const originalFight = manager.getFightProperties();
afterEach(() => manager.setFightProperties(originalFight));

function fixture(team: TeamType, charges: number) {
    manager.reset();
    const fight = manager.getFightProperties();
    fight.startFight();
    fight.startTurn(team, 1000);
    const effects = new EffectFactory();
    const grid = new Grid(settings, GridVals.NORMAL);
    const unitsHolder = new UnitsHolder(grid);
    const layer = new Container();
    const create = (faction: string, name: string, seat: TeamType, cell: { x: number; y: number }) => {
        const props = HoCConfig.getCreatureConfig(seat, faction, name, "", name === "Magic Dragon" ? 1 : 1000);
        if (name === "Magic Dragon") {
            props.spells.splice(0, props.spells.length, ...Array(charges).fill("Nature:Lightning Strike"));
        }
        const unit = RenderableUnit.fromBase(
            Unit.createUnit(props, settings, seat, UnitVals.CREATURE, new AbilityFactory(effects), effects, false),
            () => Texture.WHITE,
        );
        const position = GridMath.getPositionForCells(settings, unit.getFootprintCellsForAnchor(cell))!;
        unit.setPosition(position.x, position.y);
        unit.setStackPower(3);
        grid.occupyCells(unit.getCells(), unit.getId(), seat, unit.getAttackRange(), true, true);
        unitsHolder.addUnit(unit);
        return unit;
    };
    const caster = create("Nature", "Magic Dragon", team, { x: 2, y: 2 });
    const enemy = create("Might", "Berserker", team === TeamVals.LEFT ? TeamVals.RIGHT : TeamVals.LEFT, {
        x: 12,
        y: 12,
    });
    caster.refreshPossibleAttackTypes(true);
    caster.selectAttackType(AttackVals.MELEE_MAGIC);
    caster.ensureSpellBookRendering(layer, new Map());
    caster.renderSpells(1);
    const submitted: GameAction[] = [];
    let pendingCast = false;
    const log = { updateLog() {} } as unknown as ISceneLog;
    const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
        viewerTeam: team,
        sc_gameActionTransport: (action: GameAction) => {
            if (pendingCast) return { handled: true, completed: false, message: "Waiting for server turn update" };
            submitted.push(action);
            pendingCast = action.type === "cast_spell";
            return { handled: true, completed: true };
        },
        currentActiveUnit: caster,
        currentActiveSpell: undefined as PixiRenderableSpell | undefined,
        sc_renderSpellBookOverlay: true,
        sc_sceneSettings: { getGridSettings: () => settings },
        sc_sceneLog: log,
        grid,
        gridMatrix: grid.getMatrix(),
        unitsHolder,
        pixiApp: { worldToScreen: (x: number, y: number) => ({ x, y }) },
        getLogicalBattlefieldPoint: (point: { x: number; y: number }) => point,
        closeSpellBook() {
            this.sc_renderSpellBookOverlay = false;
        },
        // A card selection must not submit a control action even while its response would be pending.
        applyGameAction(action: GameAction) {
            submitted.push(action);
            return true;
        },
        updateCurrentMovePath() {},
        buttonManager: { refreshButtons() {} },
        hoverManager: { clearHoverSilhouette() {}, clearAttackVisuals() {} },
        dungeonVisuals: { clearScatteredMountainHighlight() {} },
        isBoardInputLockedByAI: () => false,
        getUnitAtPosition: () => enemy,
        isAttackBlockedByAggr: () => undefined,
    });
    const card = caster.getBookSpellByName("Lightning Strike")!;
    const bounds = card.getSprite().getBounds();
    const select = () => scene.MouseDown({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 });
    return { scene, caster, enemy, submitted, select, grid, unitsHolder, fight, log, layer };
}

describe("ranked spell selection", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        for (const charges of [3, 2]) {
            test(`team ${team}, ${charges} charges: one card selection and one target click submit only the cast`, () => {
                const f = fixture(team, charges);
                try {
                    f.select();
                    expect(f.scene.currentActiveSpell?.getName()).toBe("Lightning Strike");
                    expect(f.caster.getAttackTypeSelection()).toBe(AttackVals.MAGIC);
                    expect(f.submitted).toEqual([]);
                    f.scene.MouseDown(f.enemy.getPosition());
                    expect(f.submitted).toEqual([
                        {
                            type: "cast_spell",
                            casterId: f.caster.getId(),
                            spellName: "Lightning Strike",
                            targetId: f.enemy.getId(),
                            targetCell: f.enemy.getBaseCell(),
                        },
                    ]);
                    // A repeat click before the authoritative response cannot submit a second cast.
                    f.scene.MouseDown(f.enemy.getPosition());
                    expect(f.submitted).toHaveLength(1);

                    // The authoritative copy can still be in its melee mode: a cast is self-contained.
                    f.caster.selectAttackType(AttackVals.MELEE_MAGIC);
                    const before = f.enemy.getCumulativeHp();
                    const engine = new GameActionEngine({
                        grid: f.grid,
                        unitsHolder: f.unitsHolder,
                        fightProperties: f.fight,
                        moveHandler: new MoveHandler(settings, f.grid, f.unitsHolder),
                        getCurrentActiveUnitId: () => f.caster.getId(),
                        sceneLog: f.log,
                        attackHandler: new AttackHandler(settings, f.grid, f.log, {
                            add() {},
                            get: () => [],
                            has: () => false,
                            clear() {},
                        }),
                    });
                    const result = engine.apply(f.submitted[0]);
                    expect(result.completed).toBe(true);
                    expect(result.events.filter((event) => event.type === "spell_cast")).toHaveLength(1);
                    expect(f.enemy.getCumulativeHp()).toBeLessThan(before);
                    expect(
                        f.caster
                            .getSpells()
                            .find((spell) => spell.getName() === "Lightning Strike")
                            ?.getAmount(),
                    ).toBe(charges - 1);
                } finally {
                    f.layer.destroy({ children: true });
                }
            });
        }
    }

    for (const scenario of ["armed spell", "manual melee on the same turn", "new turn"] as const) {
        test(`a full snapshot rebuild preserves ${scenario}`, () => {
            const f = fixture(TeamVals.LEFT, 2);
            try {
                if (scenario === "armed spell") f.select();
                const active = RenderableUnit.fromBase(
                    Unit.createUnit(
                        structuredClone(f.caster.getAllProperties()),
                        settings,
                        TeamVals.LEFT,
                        UnitVals.CREATURE,
                        new AbilityFactory(new EffectFactory()),
                        new EffectFactory(),
                        false,
                    ),
                    () => Texture.WHITE,
                );
                active.setStackPower(3);
                active.refreshPossibleAttackTypes(true);
                active.selectAttackType(scenario === "armed spell" ? AttackVals.MELEE_MAGIC : AttackVals.MAGIC);
                active.ensureSpellBookRendering(f.layer, new Map());
                Object.assign(f.scene, {
                    rankedTurnActivationKey: `spell-rebuild:2:${active.getId()}:1000`,
                    lastAuthoritativeSequence: 0,
                    lastPlacementUnitIdsKey: "",
                    lastPlacementStateByUnitId: new Map(),
                    rememberStatusSnapshot() {},
                    processDebuffPops() {},
                    applyRankedDamageStatistics() {},
                    applyAuthoritativeSceneLog() {},
                    isPlayingActionAnimation: () => false,
                    createBoardSignature: () => "rebuilt",
                    applyRankedTimer() {},
                    applyRankedSnapshotMetadata() {},
                    applyAuthoritativeNarrowing() {},
                    renderNewlyAppliedArmageddon() {},
                    renderNewlyAppliedPyre() {},
                    renderNewlyAppliedMorale() {},
                    renderNewlyAppliedPoison() {},
                    shatterNewlyDeadUnits() {},
                    capturePlacementSelection: () => ({ hasActiveSelection: false }),
                    hydrateSceneState() {
                        f.scene.currentActiveSpell = undefined;
                        f.scene.currentActiveUnit = active;
                    },
                    applyScatteredMountainsFromSnapshot() {},
                    refreshUnits() {},
                    reconcileAuraEffectsFromSnapshot() {},
                    syncRankedVisibleTurnState() {},
                    applyRankedFightStats() {},
                });
                const snapshot: AuthoritativeGameSnapshot = {
                    gameId: "spell-rebuild",
                    viewerTeam: TeamVals.LEFT,
                    phase: 2,
                    gridType: GridVals.NORMAL,
                    currentLap: 2,
                    fightStarted: true,
                    fightFinished: false,
                    currentUnitId: active.getId(),
                    currentTurnTeam: TeamVals.LEFT,
                    currentTurnStartMs: scenario === "new turn" ? 2000 : 1000,
                    latestSequence: 1,
                    narrowingLayers: 0,
                    centerDried: false,
                    units: [],
                    upNext: [],
                };
                f.scene.applyAuthoritativeSnapshot(snapshot, { forceBoardRebuild: true });
                expect(f.scene.currentActiveSpell).toBe(
                    scenario === "armed spell" ? active.getBookSpellByName("Lightning Strike") : undefined,
                );
                expect(active.getAttackTypeSelection()).toBe(
                    scenario === "manual melee on the same turn" ? AttackVals.MELEE_MAGIC : AttackVals.MAGIC,
                );
                expect(f.submitted).toEqual([]);
            } finally {
                f.layer.destroy({ children: true });
            }
        });
    }

    test("an observer or a different active unit cannot change a caster's local mode", () => {
        const f = fixture(TeamVals.LEFT, 2);
        try {
            const scene = f.scene as unknown as {
                viewerTeam?: TeamType;
                currentActiveUnit: RenderableUnit;
                selectArmedSpellAttackType(caster: RenderableUnit): boolean;
            };
            scene.viewerTeam = undefined;
            expect(scene.selectArmedSpellAttackType(f.caster)).toBe(false);
            scene.viewerTeam = TeamVals.RIGHT;
            expect(scene.selectArmedSpellAttackType(f.caster)).toBe(false);
            scene.viewerTeam = TeamVals.LEFT;
            scene.currentActiveUnit = f.enemy;
            expect(scene.selectArmedSpellAttackType(f.caster)).toBe(false);
            expect(f.caster.getAttackTypeSelection()).toBe(AttackVals.MELEE_MAGIC);
            expect(f.submitted).toEqual([]);
        } finally {
            f.layer.destroy({ children: true });
        }
    });
});
