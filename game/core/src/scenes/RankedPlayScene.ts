import {
    allFactions,
    getFactionOf,
    HoCConfig,
    TeamVals,
    ToFactionName,
    type AttackType,
    type CreatureId,
    type GameAction,
    type GridType,
    type TeamType,
    type UnitProperties,
} from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot, AuthoritativeUnitState } from "../game_action_transport";
import type { IFightDeathEntry, IFightStatsReport, IFightStatsSample } from "./VisibleState";
import { UNIT_ID_TO_NAME } from "../ui/unit_ui_constants";
import { Sandbox, type SandboxSceneState, type SandboxSceneUnitState, type SceneActionEngine } from "./Sandbox";
import type { UnitsOverlay } from "./UnitsOverlay";

export class RankedPlayScene extends Sandbox {
    private lastAuthoritativeSequence = -1;
    private lastBoardSignature = "";
    private viewerTeam?: TeamType;
    public override getUnitsOverlay(): UnitsOverlay | undefined {
        return undefined;
    }
    public override selectAuthoritativeUnit(unitId: string): void {
        this.selectSceneUnitForPlacement(unitId);
    }
    public override applyAuthoritativeSnapshot(snapshot: AuthoritativeGameSnapshot): void {
        const boardSignature = this.createBoardSignature(snapshot);
        if (snapshot.latestSequence < this.lastAuthoritativeSequence) {
            return;
        }
        this.lastAuthoritativeSequence = snapshot.latestSequence;
        if (boardSignature === this.lastBoardSignature) {
            return;
        }
        this.lastBoardSignature = boardSignature;
        this.viewerTeam = snapshot.viewerTeam === undefined ? undefined : (snapshot.viewerTeam as TeamType);
        const selectedUnitId = this.sc_selectedUnitProperties?.id;
        const units = snapshot.units.flatMap((unit) => {
            const restored = this.toSandboxUnitState(unit);
            return restored ? [restored] : [];
        });

        this.hydrateSceneState({
            gridType: snapshot.gridType as GridType,
            currentLap: snapshot.currentLap,
            fightStarted: snapshot.fightStarted,
            fightFinished: snapshot.fightFinished,
            currentUnitId: snapshot.currentUnitId || undefined,
            units,
        } satisfies SandboxSceneState);
        this.applyFinishedVisibleState(snapshot, units);
        if (selectedUnitId && !snapshot.fightStarted && !snapshot.fightFinished) {
            this.selectSceneUnitForPlacement(selectedUnitId);
        }
    }
    public override applyAuthoritativeReplaySnapshot(snapshot: AuthoritativeGameSnapshot): void {
        this.lastAuthoritativeSequence = snapshot.latestSequence - 1;
        this.lastBoardSignature = "";
        this.applyAuthoritativeSnapshot(snapshot);
    }
    public override startScene(): boolean {
        this.createActionEngine().apply({ type: "start_fight" });
        return false;
    }
    public override rematchLastFight(): boolean {
        return false;
    }
    public override canPlayCurrentSandboxReplay(): boolean {
        return false;
    }
    protected override shouldRenderUnplacedUnitBench(unitState: SandboxSceneUnitState): boolean {
        return this.viewerTeam === undefined || unitState.team === this.viewerTeam;
    }
    private applyFinishedVisibleState(snapshot: AuthoritativeGameSnapshot, units: SandboxSceneUnitState[]): void {
        const winner = snapshot.winnerTeam as TeamType | undefined;
        if (
            !snapshot.fightFinished ||
            (winner !== TeamVals.LOWER && winner !== TeamVals.UPPER) ||
            !this.sc_visibleState
        ) {
            return;
        }

        const fightStats = this.buildFinishedFightStats(
            winner,
            units,
            Math.max(1, Math.floor(snapshot.currentLap || 1)),
        );
        if (fightStats.lowerStartTotal <= 0 || fightStats.upperStartTotal <= 0) {
            return;
        }

        this.sc_visibleState.hasFinished = true;
        this.sc_visibleState.teamWin = winner;
        this.sc_visibleState.fightStats = fightStats;
        this.sc_visibleState.lapNumber = fightStats.totalLaps;
        this.sc_visibleStateUpdateNeeded = true;
    }
    private buildFinishedFightStats(winner: TeamType, units: SandboxSceneUnitState[], lap: number): IFightStatsReport {
        const lowerDeaths = this.buildDeathEntries(units, TeamVals.LOWER as TeamType);
        const upperDeaths = this.buildDeathEntries(units, TeamVals.UPPER as TeamType);
        const lowerStartTotal = this.startTotal(units, TeamVals.LOWER as TeamType);
        const upperStartTotal = this.startTotal(units, TeamVals.UPPER as TeamType);
        const lowerKilledTotal = this.killedTotal(units, TeamVals.LOWER as TeamType);
        const upperKilledTotal = this.killedTotal(units, TeamVals.UPPER as TeamType);
        const series: IFightStatsSample[] = [
            { lap: 1, lowerKilled: 0, upperKilled: 0, lowerKilledPct: 0, upperKilledPct: 0 },
            {
                lap,
                lowerKilled: lowerKilledTotal,
                upperKilled: upperKilledTotal,
                lowerKilledPct: this.percent(lowerKilledTotal, lowerStartTotal),
                upperKilledPct: this.percent(upperKilledTotal, upperStartTotal),
            },
        ];

        return {
            winner,
            series,
            lowerDeaths,
            upperDeaths,
            lowerStartTotal,
            upperStartTotal,
            lowerKilledTotal,
            upperKilledTotal,
            totalLaps: lap,
        };
    }
    private buildDeathEntries(units: SandboxSceneUnitState[], team: TeamType): IFightDeathEntry[] {
        const byName = new Map<string, IFightDeathEntry>();
        for (const unit of units.filter((candidate) => candidate.team === team)) {
            const died = Math.max(0, Math.floor(unit.properties.amount_died));
            if (died <= 0) {
                continue;
            }
            const current = byName.get(unit.properties.name);
            const start = Math.max(0, Math.floor(unit.properties.amount_alive)) + died;
            if (current) {
                current.died += died;
                current.start += start;
            } else {
                byName.set(unit.properties.name, {
                    name: unit.properties.name,
                    smallTextureName: unit.properties.small_texture_name,
                    died,
                    start,
                    team,
                });
            }
        }
        return [...byName.values()].sort((a, b) => b.died - a.died);
    }
    private startTotal(units: SandboxSceneUnitState[], team: TeamType): number {
        return units
            .filter((unit) => unit.team === team)
            .reduce(
                (sum, unit) =>
                    sum +
                    Math.max(0, Math.floor(unit.properties.amount_alive)) +
                    Math.max(0, Math.floor(unit.properties.amount_died)),
                0,
            );
    }
    private killedTotal(units: SandboxSceneUnitState[], team: TeamType): number {
        return units
            .filter((unit) => unit.team === team)
            .reduce((sum, unit) => sum + Math.max(0, Math.floor(unit.properties.amount_died)), 0);
    }
    private percent(value: number, total: number): number {
        if (total <= 0) {
            return 0;
        }
        return Math.round((value / total) * 1000) / 10;
    }
    protected override createActionEngine(): SceneActionEngine {
        return {
            apply: (action: GameAction) => {
                const result = this.dispatchExternalGameAction(action);
                if (!result.handled) {
                    return {
                        completed: false,
                        events: [],
                        message: "Ranked transport is not connected",
                        rejectionReason: "unsupported_action",
                    };
                }
                if (result.message) {
                    this.sc_sceneLog.updateLog(result.message);
                }
                return {
                    completed: result.completed,
                    events: [],
                    message: result.message,
                };
            },
        };
    }
    private createBoardSignature(snapshot: AuthoritativeGameSnapshot): string {
        return JSON.stringify({
            phase: snapshot.phase,
            gridType: snapshot.gridType,
            currentLap: snapshot.currentLap,
            fightStarted: snapshot.fightStarted,
            fightFinished: snapshot.fightFinished,
            currentUnitId: snapshot.currentUnitId,
            currentTurnTeam: snapshot.currentTurnTeam,
            viewerTeam: snapshot.viewerTeam,
            winnerTeam: snapshot.winnerTeam,
            units: snapshot.units.map((unit) => ({
                id: unit.id,
                team: unit.team,
                creatureId: unit.creatureId,
                amountAlive: unit.amountAlive,
                amountDied: unit.amountDied,
                hp: unit.hp,
                maxHp: unit.maxHp,
                attackType: unit.attackType,
                baseCell: unit.baseCell,
                cells: unit.cells,
                dead: unit.dead,
                placed: unit.placed,
                stackPower: unit.stackPower,
            })),
        });
    }
    private toSandboxUnitState(unitState: AuthoritativeUnitState): SandboxSceneUnitState | undefined {
        const properties = this.getUnitPropertiesFromAuthoritativeState(unitState);
        if (!properties) {
            return undefined;
        }

        return {
            properties,
            team: unitState.team as TeamType,
            placed: unitState.placed,
            dead: unitState.dead,
            cells: unitState.cells,
            baseCell: unitState.baseCell,
            attackType: unitState.attackType as AttackType,
        };
    }
    private getUnitPropertiesFromAuthoritativeState(unitState: AuthoritativeUnitState): UnitProperties | undefined {
        const unitName = UNIT_ID_TO_NAME[unitState.creatureId] ?? unitState.name;
        const team = unitState.team as TeamType;
        const candidateFactions =
            unitState.creatureId > 0 ? [getFactionOf(unitState.creatureId as CreatureId)] : allFactions;

        for (const faction of candidateFactions) {
            try {
                const baseProperties = HoCConfig.getCreatureConfig(
                    team,
                    ToFactionName[faction],
                    unitName,
                    "",
                    Math.max(0, Math.floor(unitState.amountAlive)),
                );
                const hp = unitState.hp > 0 ? unitState.hp : unitState.dead ? 0 : baseProperties.hp;
                return {
                    ...baseProperties,
                    id: unitState.id,
                    team,
                    hp,
                    max_hp: unitState.maxHp || baseProperties.max_hp,
                    amount_alive: Math.max(0, Math.floor(unitState.amountAlive)),
                    amount_died: Math.max(0, Math.floor(unitState.amountDied)),
                    attack_type_selected:
                        unitState.attackType > 0
                            ? (unitState.attackType as AttackType)
                            : baseProperties.attack_type_selected,
                    stack_power: unitState.stackPower || baseProperties.stack_power,
                } as UnitProperties;
            } catch {
                // Legacy snapshots may not carry a usable creature id, so fall through factions.
            }
        }

        this.sc_sceneLog.updateLog(`Cannot restore ${unitName} from ranked snapshot`);
        return undefined;
    }
}
