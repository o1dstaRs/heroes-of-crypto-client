import {
    effectsAppliedSceneLogLines,
    sceneLogBoardEventLine,
    sceneLogMovementLine,
    spellCastNarratedPairs,
} from "../../core/src/scenes/sceneLogEvents";
import { formatTurnLogHeader } from "../../core/src/scenes/sceneLogTurnHeaders";
import { indexUnitTeam, resolveLineTeamFlag, type TeamOrAmbiguous } from "../../core/src/scenes/scene_log_flag";
import { PBTypes } from "../../heroes-of-crypto-common/src/generated/protobuf/v1/types";
import type { AttackType, TeamType } from "../../heroes-of-crypto-common/src/generated/protobuf/v1/types_gen";
import { getEnemiesCellsWithinMovementRange } from "../../heroes-of-crypto-common/src/ai/candidates";
import {
    GameActionEngine,
    type IGameActionEngineContext,
} from "../../heroes-of-crypto-common/src/engine/action_engine";
import type { GameAction } from "../../heroes-of-crypto-common/src/engine/actions";
import type { GameEvent } from "../../heroes-of-crypto-common/src/engine/events";
import { TurnEngine } from "../../heroes-of-crypto-common/src/engine/turn_engine";
import { ToFactionName } from "../../heroes-of-crypto-common/src/factions/faction_type";
import type { FightProperties } from "../../heroes-of-crypto-common/src/fights/fight_properties";
import type { Grid } from "../../heroes-of-crypto-common/src/grid/grid";
import { AttackHandler } from "../../heroes-of-crypto-common/src/handlers/attack_handler";
import { MoveHandler } from "../../heroes-of-crypto-common/src/handlers/move_handler";
import { PathHelper } from "../../heroes-of-crypto-common/src/grid/path_helper";
import {
    createCombatFactories,
    createUnitFromSpec,
    deterministicSimulationId,
    makeRng,
} from "../../heroes-of-crypto-common/src/simulation/army";
import type { UnitsHolder } from "../../heroes-of-crypto-common/src/units/units_holder";
import { getRandomInt, setDeterministicRandomSource } from "../../heroes-of-crypto-common/src/utils/lib";
import type { XY } from "../../heroes-of-crypto-common/src/utils/math";
import { battleDigest } from "../../heroes-of-crypto-common/zig/parity/digest";

const { TeamVals } = PBTypes;

interface Step {
    kind: GameAction["type"] | "advance";
    seed: number;
    nextSeed: number;
    active: number | null;
    actor: number | null;
    target: number | null;
    cell: XY | null;
    from: XY | null;
    point: XY | null;
    path: XY[];
    cells: XY[];
    side: number | null;
    mode: AttackType | null;
    spell: string | null;
    orientation: number | null;
    reason: Extract<GameAction, { type: "end_turn" }>["reason"] | null;
    lava: boolean;
    damage: boolean;
}

/** The web engine narrates accepted calls from the native journal. Its state is never used to play the fight. */
export class SandboxBattleLog {
    private readonly actionEngine: GameActionEngine;
    private readonly turnEngine: TurnEngine;
    private readonly unitIds: string[] = [];
    private readonly unitNames = new Map<string, string>();
    private readonly unitTeams = new Map<string, TeamType>();
    private readonly teamByName = new Map<string, TeamOrAmbiguous>();
    private readonly lines: string[] = [];
    private active?: string;
    private heading?: string;
    private summonSequence = 0;

    public constructor(
        private readonly grid: Grid,
        private readonly unitsHolder: UnitsHolder,
        private readonly fightProperties: FightProperties,
        seed: number,
    ) {
        const settings = grid.getSettings();
        const pathHelper = new PathHelper(settings);
        const { abilityFactory, effectFactory } = createCombatFactories();
        const sceneLog = {
            updateLog: (line?: string) => {
                if (line) this.add(line);
            },
            getLog: () => this.lines.slice().reverse().join("\n"),
            hasBeenUpdated: () => this.lines.length > 0,
        };
        const attackHandler = new AttackHandler(settings, grid, sceneLog, {
            add() {},
            get: () => [],
            has: () => false,
            clear() {},
        });
        const context: IGameActionEngineContext = {
            fightProperties,
            grid,
            unitsHolder,
            moveHandler: new MoveHandler(settings, grid, unitsHolder),
            sceneLog,
            attackHandler,
            getCurrentActiveUnitId: () => this.active,
            canLandRangeAttack: (unit) =>
                attackHandler.canLandRangeAttack(unit, grid.getEnemyAggrMatrixByUnitId(unit.getId())),
            getCurrentEnemiesCellsWithinMovementRange: () => {
                const unit = this.active ? unitsHolder.getAllUnits().get(this.active) : undefined;
                if (!unit) return undefined;
                return getEnemiesCellsWithinMovementRange(unit, {
                    grid,
                    matrix: grid.getMatrix(),
                    unitsHolder,
                    pathHelper,
                    attackHandler,
                    fightProperties,
                });
            },
            createSummonedUnit: ({ team, faction, unitName, amount, caster, sourceAbility }) =>
                createUnitFromSpec(
                    { faction: ToFactionName[faction], creatureName: unitName, level: 0, size: 0, amount },
                    team,
                    settings,
                    abilityFactory,
                    effectFactory,
                    true,
                    deterministicSimulationId(
                        "summon",
                        seed,
                        team,
                        faction,
                        unitName,
                        caster.getId(),
                        sourceAbility ?? "spell",
                        this.summonSequence++,
                    ),
                ),
            runtime: {
                rng: { int: getRandomInt },
                clock: { nowMillis: () => 0 },
                ids: { nextId: () => deterministicSimulationId("sandbox-log", seed, this.summonSequence++) },
            },
        };
        this.actionEngine = new GameActionEngine(context);
        this.turnEngine = new TurnEngine(context);
        this.indexUnits();
    }

    private indexUnits(): void {
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            const id = unit.getId();
            if (this.unitNames.has(id)) continue;
            this.unitIds.push(id);
            this.unitNames.set(id, unit.getName());
            this.unitTeams.set(id, unit.getTeam());
            indexUnitTeam(this.teamByName, unit.getName(), unit.getTeam());
        }
    }

    private add(line: string): void {
        this.indexUnits();
        const unit = this.active ? this.unitsHolder.getAllUnits().get(this.active) : undefined;
        const flag = resolveLineTeamFlag(line, this.teamByName, unit && { name: unit.getName(), team: unit.getTeam() });
        this.lines.push(flag ? `${flag} ${line}` : line);
    }

    private flag(unitId: string): string {
        const team = this.unitTeams.get(unitId);
        return team === TeamVals.LEFT ? "🟢" : team === TeamVals.RIGHT ? "🔴" : "";
    }

    private unitLine(unitId: string, line: string): string {
        const flag = this.flag(unitId);
        return flag ? `${flag} ${line}` : line;
    }

    private finishStep(events: readonly GameEvent[], firstLine: number): void {
        this.indexUnits();
        const narrated = new Set(this.lines.slice(firstLine));
        const castPairs = spellCastNarratedPairs(events);
        const beforeAction = new Set<string>();
        const withoutFlag = (line: string) => line.replace(/^(?:🟢|🔴) /u, "");
        const alreadyWritten = (line: string) => narrated.has(line) || narrated.has(withoutFlag(line));
        for (const event of events) {
            const unitId = "unitId" in event ? event.unitId : undefined;
            const name = unitId ? (this.unitNames.get(unitId) ?? "Unit") : "Unit";
            const boardLine = sceneLogBoardEventLine(event, this.unitNames, () => this.grid.getSettings());
            if (boardLine) {
                const line = unitId ? this.unitLine(unitId, boardLine) : boardLine;
                if (!alreadyWritten(line)) {
                    if (event.type === "unit_moved" || event.type === "lap_flipped") {
                        beforeAction.add(line);
                    } else {
                        this.lines.push(line);
                    }
                }
            }
            switch (event.type) {
                case "unit_attacked":
                case "obstacle_attacked": {
                    const destination = event.approachPath?.at(-1);
                    if (destination) {
                        const actor = this.unitNames.get(event.attackerId) ?? "Unit";
                        beforeAction.add(this.unitLine(event.attackerId, sceneLogMovementLine(actor, destination)));
                    }
                    break;
                }
                case "effects_applied":
                    for (const line of effectsAppliedSceneLogLines(
                        event,
                        this.unitNames,
                        (id) => this.flag(id),
                        castPairs,
                    )) {
                        if (!alreadyWritten(line) && !alreadyWritten(line.replace(" resisted ", " resisted from "))) {
                            this.lines.push(line);
                        }
                    }
                    break;
                // The engine emits the cast event for these spells and only logs individual outcomes.
                case "spell_cast":
                    if (["Smoke", "Vine Throw", "Craft"].includes(event.spellName)) {
                        const caster = this.unitNames.get(event.casterId) ?? "Unit";
                        const target = event.targetId ? ` on ${this.unitNames.get(event.targetId) ?? "Unit"}` : "";
                        beforeAction.add(this.unitLine(event.casterId, `${caster} cast ${event.spellName}${target}`));
                    }
                    break;
                case "turn_completed":
                case "unit_destroyed":
                    if (this.active === event.unitId) this.active = undefined;
                    if (this.heading === event.unitId) this.heading = undefined;
                    break;
                case "fight_finished":
                    this.active = undefined;
                    break;
                case "next_unit_selected": {
                    this.active = event.unitId;
                    if (this.heading === event.unitId) break;
                    this.heading = event.unitId;
                    this.lines.push(
                        formatTurnLogHeader(this.flag(event.unitId), name, this.fightProperties.getCurrentLap()),
                    );
                    const unit = this.unitsHolder.getAllUnits().get(event.unitId);
                    if (unit && !unit.isSkippingThisTurn() && unit.hasStatusApplied("Paralysis")) {
                        this.lines.push(this.unitLine(event.unitId, `${name} is paralyzed and cannot move this turn`));
                    }
                    break;
                }
                // These effects resolve at activation. Place their narration under the incoming turn's header.
                case "poison_ticked":
                case "unit_skipped": {
                    const text =
                        event.type === "poison_ticked"
                            ? `${name} takes ${event.damage} poison damage`
                            : event.reason === "timeout"
                              ? `${name} turn timed out`
                              : `${name} skips turn`;
                    const prior = this.lines.findIndex((line, i) => i >= firstLine && withoutFlag(line) === text);
                    if (prior >= firstLine) this.lines.splice(prior, 1);
                    this.lines.push(this.unitLine(event.unitId, text));
                    break;
                }
            }
        }
        this.lines.splice(firstLine, 0, ...beforeAction);
    }

    private action(step: Step): GameAction {
        const actor = step.actor === null ? "" : this.unitIds[step.actor];
        const target = step.target === null ? undefined : this.unitIds[step.target];
        if (step.kind !== "start_fight" && (!actor || (step.target !== null && !target))) {
            throw new Error(`Unknown log actor or target for ${step.kind}`);
        }
        switch (step.kind) {
            case "start_fight":
                return { type: step.kind };
            case "end_turn":
                return { type: step.kind, unitId: actor, reason: step.reason ?? undefined };
            case "wait_turn":
            case "defend_turn":
                return { type: step.kind, unitId: actor };
            case "select_attack_type":
                return { type: step.kind, unitId: actor, attackType: step.mode! };
            case "move_unit":
                return {
                    type: step.kind,
                    unitId: actor,
                    path: step.path,
                    targetCells: step.cells,
                    hasLavaCell: step.lava,
                };
            case "melee_attack":
                return {
                    type: step.kind,
                    attackerId: actor,
                    targetId: target!,
                    attackFrom: step.from!,
                    path: step.path,
                    hasLavaCell: step.lava,
                };
            case "range_attack":
                return {
                    type: step.kind,
                    attackerId: actor,
                    targetId: target ?? "",
                    aimCell: step.cell ?? undefined,
                    aimSide: step.side ?? undefined,
                    targetPosition: step.point ?? undefined,
                };
            case "obstacle_attack":
                return {
                    type: step.kind,
                    attackerId: actor,
                    targetPosition: step.point!,
                    attackFrom: step.from ?? undefined,
                    path: step.path,
                    hasLavaCell: step.lava,
                };
            case "area_throw_attack":
                return { type: step.kind, attackerId: actor, targetCell: step.cell! };
            case "cast_spell":
                return {
                    type: step.kind,
                    casterId: actor,
                    targetId: target,
                    targetCell: step.cell ?? undefined,
                    spellName: step.spell!,
                    targetOrientation: step.orientation ?? undefined,
                };
            default:
                throw new Error(`Unexpected log action ${step.kind}`);
        }
    }

    public advance(steps: Step[]) {
        this.lines.length = 0;
        try {
            for (const step of steps) {
                const random = makeRng(step.seed);
                let nextSeed = step.seed;
                setDeterministicRandomSource(() => {
                    nextSeed = (nextSeed + 0x6d2b79f5) >>> 0;
                    return random();
                });
                if (step.kind === "start_fight") this.lines.push("Fight started!");
                const firstLine = this.lines.length;
                const result =
                    step.kind === "advance"
                        ? this.turnEngine.advanceAfterNoActiveUnit({ damageDealtThisLap: step.damage })
                        : this.actionEngine.apply(this.action(step));
                if (("completed" in result && !result.completed) || nextSeed !== step.nextSeed) {
                    throw new Error(`Web combat result differs at ${step.kind}`);
                }
                this.finishStep(result.events, firstLine);
                if (this.active !== (step.active === null ? undefined : this.unitIds[step.active])) {
                    throw new Error(`Web turn differs at ${step.kind}`);
                }
            }
            const digest = battleDigest(
                { grid: this.grid, unitsHolder: this.unitsHolder, fightProperties: this.fightProperties },
                { setup: true, terrain: true, spells: true, batch6b: true },
            );
            return { lines: this.lines, digest: JSON.stringify(digest) };
        } finally {
            setDeterministicRandomSource(undefined);
        }
    }
}
