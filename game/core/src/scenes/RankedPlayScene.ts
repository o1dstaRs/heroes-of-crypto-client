import {
    allFactions,
    getFactionOf,
    HoCConfig,
    ToFactionName,
    type AttackType,
    type CreatureId,
    type GameAction,
    type GridType,
    type TeamType,
    type UnitProperties,
} from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot, AuthoritativeUnitState } from "../game_action_transport";
import { UNIT_ID_TO_NAME } from "../ui/unit_ui_constants";
import { Sandbox, type SandboxSceneState, type SandboxSceneUnitState, type SceneActionEngine } from "./Sandbox";
import type { UnitsOverlay } from "./UnitsOverlay";

export class RankedPlayScene extends Sandbox {
    private lastAuthoritativeSequence = -1;
    private lastBoardSignature = "";
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

        this.hydrateSceneState({
            gridType: snapshot.gridType as GridType,
            currentLap: snapshot.currentLap,
            fightStarted: snapshot.fightStarted,
            fightFinished: snapshot.fightFinished,
            currentUnitId: snapshot.currentUnitId || undefined,
            units: snapshot.units.flatMap((unit) => {
                const restored = this.toSandboxUnitState(unit);
                return restored ? [restored] : [];
            }),
        } satisfies SandboxSceneState);
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
