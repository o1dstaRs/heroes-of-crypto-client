/*
 * -----------------------------------------------------------------------------
 * This file is part of the browser implementation of the Heroes of Crypto game client.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import {
    AbilityFactory,
    DEFAULT_AI_VERSION,
    FightStateManager,
    GameActionEngine,
    GridMath,
    HoCConfig,
    HoCLib,
    MINDLESS_AI_VERSION,
    SpellHelper,
    TeamVals,
    ToFactionName,
    TurnEngine,
    Unit,
    UnitVals,
    getAIStrategy,
    getEnemiesCellsWithinMovementRange,
    isMindlessAiUnit,
    type AttackHandler,
    type FactionType,
    type FightProperties,
    type GameAction,
    type Grid,
    type IDamageStatistic,
    type IDecisionContext,
    type MoveHandler,
    type PathHelper,
    type Spell,
    type TeamType,
    type UnitsHolder,
} from "@heroesofcrypto/common";
import type { HoCMath } from "@heroesofcrypto/common";

import { createDecisionPathCatalog } from "../../../heroes-of-crypto-common/src/ai/decision_path_catalog";
import { SearchRollbackError } from "../../../heroes-of-crypto-common/src/simulation/search_driver";
import { createV08A19SearchDriver } from "../../../heroes-of-crypto-common/src/simulation/v0_8_a19_search";
import type { SearchDriver } from "../../../heroes-of-crypto-common/src/simulation/search_driver";

import { runAiSearchSimulation } from "./aiSearchGuard";
import { DamageStatisticHolder } from "./DamageStats";
import type { SceneLog } from "./SceneLog";
import { createSummonedUnitProperties } from "./summonedUnitProperties";

export interface ISandboxAiSearchHost {
    grid: Grid;
    unitsHolder: UnitsHolder;
    pathHelper: PathHelper;
    attackHandler: AttackHandler;
    moveHandler: MoveHandler;
    sceneLog: SceneLog;
    abilityFactory: AbilityFactory;
    fightProperties(): FightProperties;
    canLandRangeAttack(unit: Unit): boolean;
    isBarrelCellAllowed(team: TeamType, cell: HoCMath.XY): boolean;
    canPlaceUnit(unit: Unit, cells: HoCMath.XY[], action: Extract<GameAction, { type: "place_unit" }>): boolean;
    canSplitUnit(unit: Unit): boolean;
}

interface ISearchSlot {
    driver: SearchDriver;
    fightProperties: FightProperties;
    lastLap: number;
    fightReady: boolean;
    bindActiveUnit(id: string): string;
    restoreActiveUnit(id: string): void;
}

const slots = new WeakMap<UnitsHolder, ISearchSlot>();

function sandboxSearchSeed(unitsHolder: UnitsHolder): number {
    let hash = 0x811c9dc5;
    for (const id of [...unitsHolder.getAllUnits().keys()].sort()) {
        for (let index = 0; index < id.length; index += 1) {
            hash ^= id.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193);
        }
    }
    return hash >>> 0 || 1;
}

function releaseSlot(slot: ISearchSlot | undefined): void {
    if (!slot) return;
    try {
        slot.driver.onMatchEnd();
    } catch {
        // The sealed profile does not write an audit. A failed close must not block the next battle.
    }
}

function createSlot(host: ISandboxAiSearchHost, fightProperties: FightProperties, lap: number): ISearchSlot {
    const { grid, unitsHolder, pathHelper, attackHandler, moveHandler, sceneLog, abilityFactory } = host;
    const holder = attackHandler.getDamageStatisticHolder();
    if (!(holder instanceof DamageStatisticHolder)) {
        throw new Error("A19 search requires the scene damage log");
    }
    let searchActiveUnitId = "";
    let statsSnapshot: ReturnType<DamageStatisticHolder["snapshot"]> | undefined;
    let statsToken: IDamageStatistic[] | undefined;
    const knownPathsForActive = () => {
        const active = unitsHolder.getAllUnits().get(searchActiveUnitId);
        if (!active) return undefined;
        if (!active.canMove()) return new Map();
        FightStateManager.getInstance().setFightProperties(fightProperties);
        unitsHolder.refreshStackPowerForAllUnits();
        const ranges = new Map<string, number>();
        for (const candidate of unitsHolder.getAllUnits().values()) {
            if (!candidate.isDead()) ranges.set(candidate.getId(), candidate.getAttackRange());
        }
        grid.rebuildAggrBoards(ranges);
        const enemyTeam = active.getTeam() === TeamVals.LEFT ? TeamVals.RIGHT : TeamVals.LEFT;
        return pathHelper.getMovePath(
            active.getBaseCell(),
            grid.getMatrix(),
            active.getSteps(),
            grid.getAggrMatrixByTeam(enemyTeam),
            active.canFly(),
            active.isSmallSize(),
            active.canTraverseLava(),
            active.hasAbilityActive("In Its Own World"),
            active.getFootprintWidth(),
            active.getFootprintHeight(),
        ).knownPaths;
    };
    const enemiesWithinMovement = (): HoCMath.XY[] | undefined => {
        const active = unitsHolder.getAllUnits().get(searchActiveUnitId);
        if (!active) return undefined;
        const cells = getEnemiesCellsWithinMovementRange(active, {
            grid,
            matrix: grid.getMatrix(),
            unitsHolder,
            pathHelper,
        });
        return cells.length ? cells : undefined;
    };
    const engineContext = {
        fightProperties,
        grid,
        unitsHolder,
        moveHandler,
        sceneLog,
        attackHandler,
        canLandRangeAttack: (unit: Unit) => host.canLandRangeAttack(unit),
        getCurrentActiveUnitId: () => searchActiveUnitId || undefined,
        getCurrentActiveKnownPaths: knownPathsForActive,
        getCurrentEnemiesCellsWithinMovementRange: enemiesWithinMovement,
        getSummonTargetCell: (caster: Unit, spell: Spell) => {
            const summonFootprint = HoCConfig.getCreatureFootprint(
                ToFactionName[spell.getSummonUnitRace()],
                spell.getSummonUnitName(),
            );
            return SpellHelper.firstSummonableAnchor(
                spell,
                grid.getMatrix(),
                GridMath.getCellsAroundFootprint(grid.getSettings(), caster.getCells()),
                summonFootprint.width,
                summonFootprint.height,
            );
        },
        createSummonedUnit: ({
            team,
            faction,
            unitName,
            amount,
        }: {
            team: TeamType;
            faction: FactionType;
            unitName: string;
            amount: number;
        }) => {
            try {
                const properties = createSummonedUnitProperties(team, faction, unitName, amount);
                return Unit.createUnit(
                    { ...properties, id: HoCLib.createSecureUuid(), team },
                    grid.getSettings(),
                    team,
                    UnitVals.CREATURE,
                    abilityFactory,
                    abilityFactory.getEffectsFactory(),
                    true,
                );
            } catch {
                return undefined;
            }
        },
        canPlaceBarrel: (team: TeamType, cell: HoCMath.XY) => host.isBarrelCellAllowed(team, cell),
        canPlaceUnit: (unit: Unit, cells: HoCMath.XY[], action: Extract<GameAction, { type: "place_unit" }>) =>
            host.canPlaceUnit(unit, cells, action),
        canSplitUnit: (unit: Unit) => host.canSplitUnit(unit),
        createSplitUnit: (sourceUnit: Unit, amount: number) => {
            if (amount <= 0) return undefined;
            const sourceProperties = sourceUnit.getUnitProperties();
            return Unit.createUnit(
                structuredClone({
                    ...sourceProperties,
                    id: HoCLib.createSecureUuid(),
                    team: sourceUnit.getTeam(),
                    hp: sourceProperties.max_hp,
                    amount_alive: amount,
                    amount_died: 0,
                    attack_type_selected: sourceProperties.attack_type,
                }),
                grid.getSettings(),
                sourceUnit.getTeam(),
                UnitVals.CREATURE,
                abilityFactory,
                abilityFactory.getEffectsFactory(),
                false,
            );
        },
    };
    const driver = createV08A19SearchDriver(
        {
            engine: new GameActionEngine(engineContext),
            turnEngine: new TurnEngine({
                fightProperties,
                grid,
                unitsHolder,
                moveHandler,
                sceneLog,
                canLandRangeAttack: (unit) => host.canLandRangeAttack(unit),
                getCurrentActiveUnitId: () => searchActiveUnitId || undefined,
            }),
            grid,
            unitsHolder,
            fightProperties,
            pathHelper,
            attackHandler,
            strategyForTeam: () => getAIStrategy(DEFAULT_AI_VERSION),
            getActiveUnitId: () => searchActiveUnitId,
            setActiveUnitId: (id) => {
                searchActiveUnitId = id;
            },
            damageDealtThisLap: () => holder.has(fightProperties.getCurrentLap()),
            captureDamageStats: () => {
                statsSnapshot = holder.snapshot();
                statsToken = statsSnapshot.damageStatistics.map((statistic) => ({ ...statistic }));
                return statsToken;
            },
            restoreDamageStats: (saved) => {
                if (statsSnapshot && statsToken === saved) {
                    holder.restore(statsSnapshot);
                    return;
                }
                holder.clear();
                for (const statistic of saved) holder.add({ ...statistic });
            },
        },
        {
            seed: sandboxSearchSeed(unitsHolder),
            greenVersion: DEFAULT_AI_VERSION,
            redVersion: DEFAULT_AI_VERSION,
        },
    );
    return {
        driver,
        fightProperties,
        lastLap: lap,
        fightReady: false,
        bindActiveUnit(id: string): string {
            const previous = searchActiveUnitId;
            searchActiveUnitId = id;
            return previous;
        },
        restoreActiveUnit(id: string): void {
            searchActiveUnitId = id;
        },
    };
}

function driverFor(host: ISandboxAiSearchHost): ISearchSlot {
    const fightProperties = host.fightProperties();
    const lap = fightProperties.getCurrentLap();
    const existing = slots.get(host.unitsHolder);
    if (existing && existing.fightProperties === fightProperties && lap >= existing.lastLap) {
        existing.lastLap = lap;
        return existing;
    }
    releaseSlot(existing);
    const created = createSlot(host, fightProperties, lap);
    slots.set(host.unitsHolder, created);
    return created;
}

/**
 * Re-decide one live turn with the shipped v0.8 A19 search. Rollouts use a raw engine on the same units
 * and restore them before returning. A failed restore keeps the policy plan; the board may already be
 * the pre-search state or, if restoration itself failed, no longer proven.
 */
export function searchSandboxAiDecision(
    host: ISandboxAiSearchHost,
    unit: Unit,
    version: string,
    incumbent: GameAction[],
    decision: IDecisionContext,
): GameAction[] {
    if (version === MINDLESS_AI_VERSION || isMindlessAiUnit(unit)) return incumbent;
    let slot: ISearchSlot | undefined;
    const wasSuppressed = host.sceneLog.isSuppressed();
    host.sceneLog.setSuppressed(true);
    try {
        slot = driverFor(host);
        const fightProperties = host.fightProperties();
        if (!slot.fightReady && fightProperties.hasFightStarted()) {
            slot.driver.onFightReady();
            slot.fightReady = true;
        }
        FightStateManager.getInstance().setFightProperties(fightProperties);
        const current = slot;
        const previousActive = current.bindActiveUnit(unit.getId());
        try {
            const decisionPathCatalog = createDecisionPathCatalog(host.grid, host.pathHelper, unit, decision.matrix);
            // The client typecheck reads common's built declarations, which can lag the source type.
            // SearchDriver's source still reads both fields, so attach them without an object-literal check.
            const searchedDecision = Object.assign({}, decision, {
                decisionPathCatalog,
                decisionOrigin: "root" as const,
            });
            return runAiSearchSimulation(() =>
                current.driver.chooseDecision(unit, version, incumbent, searchedDecision),
            );
        } finally {
            current.restoreActiveUnit(previousActive);
        }
    } catch (error) {
        releaseSlot(slot);
        if (slot) slots.delete(host.unitsHolder);
        console.error(
            error instanceof SearchRollbackError
                ? "A19 search could not restore the board; keeping the policy plan"
                : "A19 search failed; keeping the policy plan",
            error,
        );
        return incumbent;
    } finally {
        host.sceneLog.setSuppressed(wasSuppressed);
    }
}
