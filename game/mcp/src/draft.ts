import {
    AbilityFactory,
    AttackVals,
    CreaturePoolByLevel,
    CreatureVals,
    EffectFactory,
    FactionVals,
    GridMath,
    HoCConfig,
    HoCLib,
    MovementVals,
    PickHelper,
    TeamVals,
    ToFactionName,
    Unit,
    UnitVals,
    allCreatureIds,
    getFactionOf,
    getLevelOf,
    type CreatureId,
    type GridSettings,
    type TeamType,
} from "@heroesofcrypto/common";

import { RuleBasedDraftAI, scoreDraftAction } from "./model_ai";
import type {
    AIDraftDecision,
    AIReason,
    AIStyle,
    DraftAction,
    DraftCreatureState,
    DraftPhaseName,
    EvaluatedDraftAction,
    PublicDraftState,
    SubmitDraftActionResult,
    TeamName,
} from "./types";

const DRAFT_UNIT_TOTAL_EXP = 1000;
const TARGET_LEVEL_COUNTS = [0, ...CreaturePoolByLevel] as const;

type DraftStep = {
    phase: DraftPhaseName;
    team: TeamName;
};

const DRAFT_STEPS: DraftStep[] = [
    { phase: "initial_pick", team: "LOWER" },
    { phase: "extended_pick", team: "UPPER" },
    { phase: "extended_ban", team: "UPPER" },
    { phase: "pick", team: "LOWER" },
    { phase: "ban", team: "LOWER" },
    { phase: "pick", team: "UPPER" },
    { phase: "ban", team: "UPPER" },
    { phase: "pick", team: "LOWER" },
    { phase: "ban", team: "LOWER" },
    { phase: "pick", team: "UPPER" },
    { phase: "ban", team: "UPPER" },
    { phase: "pick", team: "LOWER" },
    { phase: "ban", team: "LOWER" },
    { phase: "pick", team: "UPPER" },
    { phase: "ban", team: "UPPER" },
    { phase: "pick", team: "LOWER" },
];

const DEFAULT_INITIAL_PAIRS: Array<[number, number]> = [
    [CreatureVals.SQUIRE, CreatureVals.VALKYRIE],
    [CreatureVals.CENTAUR, CreatureVals.HARPY],
];

type EnumLike = Record<string, string | number>;

const enumLabel = (enumLike: EnumLike, value: number): string => {
    const name = enumLike[value];
    return typeof name === "string" ? name.toLowerCase().replaceAll("_", " ") : String(value);
};

const toTitleCase = (value: string): string =>
    value
        .toLowerCase()
        .split("_")
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(" ");

export const creatureNameFromId = (creatureId: number): string => {
    const enumName = CreatureVals[creatureId];
    return typeof enumName === "string" ? toTitleCase(enumName) : `Creature ${creatureId}`;
};

const getCreatureFactionName = (creatureId: number): string => {
    const faction = getFactionOf(creatureId as CreatureId);
    return ToFactionName[faction] ?? enumLabel(FactionVals, faction);
};

const creatureRole = (creature: DraftCreatureState): string => {
    if (creature.spells.length) {
        return "caster";
    }
    if (creature.attackRange > 1 || creature.attackType === "range") {
        return "ranged";
    }
    if (creature.hp >= 80 || creature.armor >= 15 || creature.size > 1) {
        return "frontline";
    }
    return "skirmisher";
};

const draftTagsForCreature = (creature: DraftCreatureState): string[] => {
    const tags = new Set<string>();
    if (creature.attack > 0 || creature.damage.max > 0) {
        tags.add("damage");
    }
    if (creature.attackRange > 1 || creature.attackType === "range") {
        tags.add("ranged");
    }
    if (creature.spells.length) {
        tags.add("caster");
    }
    if (creature.hp >= 80 || creature.armor >= 15 || creature.size > 1) {
        tags.add("durable");
    }
    if (creature.speed >= 7 || creature.steps >= 5) {
        tags.add("tempo");
    }
    return [...tags];
};

export const createDraftCreatureState = (creatureId: number): DraftCreatureState => {
    const faction = getCreatureFactionName(creatureId);
    const name = creatureNameFromId(creatureId);
    const properties = HoCConfig.getCreatureConfig(TeamVals.NO_TEAM, faction, name, "", 0, DRAFT_UNIT_TOTAL_EXP);
    const attackType = enumLabel(AttackVals, properties.attack_type);
    const movementType = enumLabel(MovementVals, properties.movement_type);
    const averageDamage = (properties.attack_damage_min + properties.attack_damage_max) / 2;
    const totalHp = properties.amount_alive * properties.max_hp;
    const draftValue =
        properties.level * 42 +
        properties.speed * 5 +
        properties.steps * 3 +
        properties.base_attack * 2 +
        averageDamage * Math.max(1, properties.amount_alive) * 0.08 +
        totalHp * 0.04 +
        properties.base_armor * 1.5 +
        properties.magic_resist * 0.6 +
        properties.range_shots * 2 +
        (properties.attack_range > 1 ? 18 : 0) +
        properties.spells.length * 26 +
        properties.abilities.length * 6 +
        (properties.size > 1 ? 10 : 0);

    return {
        id: creatureId,
        name,
        faction,
        level: properties.level,
        size: properties.size,
        hp: properties.max_hp,
        speed: properties.speed,
        steps: properties.steps,
        armor: properties.base_armor,
        attackType,
        attack: properties.base_attack,
        damage: {
            min: properties.attack_damage_min,
            max: properties.attack_damage_max,
        },
        attackRange: properties.attack_range,
        rangeShots: properties.range_shots,
        shotDistance: properties.shot_distance,
        magicResist: properties.magic_resist,
        movementType,
        spells: [...properties.spells],
        abilities: [...properties.abilities],
        draftValue: Math.round(draftValue),
    };
};

export const createUnitFromCreatureId = (creatureId: number, team: TeamType, gridSettings: GridSettings): Unit => {
    const faction = getCreatureFactionName(creatureId);
    const name = creatureNameFromId(creatureId);
    const effectFactory = new EffectFactory();
    const abilityFactory = new AbilityFactory(effectFactory);
    const properties = HoCConfig.getCreatureConfig(team, faction, name, "", 0, DRAFT_UNIT_TOTAL_EXP);

    return Unit.createUnit(
        { ...properties, id: HoCLib.createSecureUuid(), team },
        gridSettings,
        team,
        UnitVals.CREATURE,
        abilityFactory,
        effectFactory,
        false,
    );
};

export class HeadlessDraft {
    private readonly matchId: string;
    private readonly initialPairs: Array<[number, number]>;
    private readonly pickedByTeam: Record<TeamName, number[]> = {
        LOWER: [],
        UPPER: [],
    };
    private readonly revealsRemainingByTeam: Record<TeamName, number> = {
        LOWER: 1,
        UPPER: 1,
    };
    private banned: number[] = [];
    private stepIndex = 0;
    private stateVersion = 0;
    public constructor(options: { matchId?: string; initialPairs?: Array<[number, number]> } = {}) {
        this.matchId = options.matchId ?? `mcp-draft-${Date.now()}`;
        this.initialPairs = options.initialPairs ?? DEFAULT_INITIAL_PAIRS;
    }
    public getId(): string {
        return this.matchId;
    }
    public getState(): PublicDraftState {
        return this.toPublicState();
    }
    public isComplete(): boolean {
        return this.currentStep() === undefined;
    }
    public getPickedCreatures(team: TeamName): number[] {
        return [...this.pickedByTeam[team]];
    }
    public listLegalActions(team?: TeamName): DraftAction[] {
        const step = this.currentStep();
        if (!step || (team && team !== step.team)) {
            return [];
        }

        if (step.phase === "initial_pick") {
            return this.createInitialPairActions(step);
        }
        if (step.phase === "extended_ban" || step.phase === "ban") {
            return this.createBanActions(step);
        }
        if (step.phase === "extended_pick" || step.phase === "pick") {
            return this.createPickActions(step);
        }
        return [];
    }
    public evaluateActions(options: { style?: AIStyle; team?: TeamName } = {}): EvaluatedDraftAction[] {
        const step = this.currentStep();
        if (!step) {
            return [];
        }

        const team = options.team ?? step.team;
        const style = options.style ?? "balanced";
        return this.listLegalActions(team)
            .map((action) => ({ ...action, score: scoreDraftAction(action, style) }))
            .sort((left, right) => {
                const scoreDelta = right.score - left.score;
                if (scoreDelta !== 0) {
                    return scoreDelta;
                }
                return left.id.localeCompare(right.id);
            })
            .map((action, index) => ({ ...action, rank: index + 1 }));
    }
    public chooseAction(options: { reason: AIReason; style?: AIStyle; team?: TeamName }): AIDraftDecision {
        const step = this.currentStep();
        if (!step) {
            throw new Error("Draft is already complete");
        }

        const team = options.team ?? step.team;
        const legalActions = this.listLegalActions(team);
        return new RuleBasedDraftAI().chooseDraftAction({
            matchId: this.matchId,
            reason: options.reason,
            style: options.style,
            state: this.toPublicState(),
            legalActions,
            team,
        });
    }
    public submitAction(input: { team: TeamName; actionId: string }): SubmitDraftActionResult {
        const step = this.currentStep();
        if (!step) {
            return this.rejected("Draft is already complete");
        }
        if (input.team !== step.team) {
            return this.rejected(`It is ${step.team}'s draft action`);
        }

        const selectedAction = this.listLegalActions(input.team).find((action) => action.id === input.actionId);
        if (!selectedAction) {
            return this.rejected("The requested draft action is not legal in the current state");
        }

        if (selectedAction.kind === "pick_initial_pair") {
            for (const creatureId of selectedAction.creatureIds ?? []) {
                this.pickedByTeam[input.team].push(creatureId);
            }
            this.assignAutomaticInitialPair(input.team);
        } else if (selectedAction.kind === "pick_unit") {
            if (selectedAction.creatureId === undefined) {
                return this.rejected("Pick action is missing a creature id");
            }
            this.pickedByTeam[input.team].push(selectedAction.creatureId);
        } else if (selectedAction.kind === "ban_unit") {
            if (selectedAction.creatureId === undefined) {
                return this.rejected("Ban action is missing a creature id");
            }
            this.banned.push(selectedAction.creatureId);
        } else if (selectedAction.kind === "reveal") {
            this.revealsRemainingByTeam[input.team] = Math.max(0, this.revealsRemainingByTeam[input.team] - 1);
        }

        this.stepIndex += 1;
        this.stateVersion += 1;

        const state = this.toPublicState();
        return {
            completed: state.phase === "complete",
            state,
            nextLegalActions: state.phase === "complete" ? [] : this.listLegalActions(),
        };
    }
    private createInitialPairActions(step: DraftStep): DraftAction[] {
        return this.initialPairs.flatMap((pair, pairIndex) => {
            const blocked = pair.some((creatureId) => this.isCreatureUnavailable(creatureId));
            if (blocked) {
                return [];
            }

            const creatures = pair.map(createDraftCreatureState);
            const value = creatures.reduce((sum, creature) => sum + creature.draftValue, 0);
            const tags = [...new Set(creatures.flatMap(draftTagsForCreature))];
            return [
                {
                    id: this.actionId(step.team, "pair", pairIndex),
                    kind: "pick_initial_pair",
                    team: step.team,
                    summary: `Pick initial pair ${pairIndex + 1}: ${creatures.map((creature) => creature.name).join(" + ")}`,
                    pairIndex,
                    creatureIds: [...pair],
                    tacticalTags: tags,
                    risks: [],
                    evaluation: {
                        value,
                        role: tags.includes("ranged") ? "mixed ranged opener" : "balanced opener",
                        notes: creatures.map(
                            (creature) =>
                                `${creature.name} is a level ${creature.level} ${creature.faction} ${creatureRole(creature)}`,
                        ),
                    },
                },
            ];
        });
    }
    private createPickActions(step: DraftStep): DraftAction[] {
        const allowedLevels = this.allowedPickLevels(step.team);
        return allCreatureIds
            .filter((creatureId) => allowedLevels.includes(getLevelOf(creatureId)))
            .filter((creatureId) => this.canPickCreature(step.team, creatureId))
            .map((creatureId) => {
                const creature = createDraftCreatureState(creatureId);
                const tags = draftTagsForCreature(creature);
                return {
                    id: this.actionId(step.team, "pick", creatureId),
                    kind: "pick_unit",
                    team: step.team,
                    summary: `Pick ${creature.name}, level ${creature.level} ${creature.faction} ${creatureRole(creature)}`,
                    creatureId,
                    creatureIds: [creatureId],
                    targetLevel: creature.level,
                    tacticalTags: tags,
                    risks: [],
                    evaluation: {
                        value: creature.draftValue,
                        level: creature.level,
                        faction: creature.faction,
                        role: creatureRole(creature),
                        notes: [
                            `${creature.attackType} attack, speed ${creature.speed}, armor ${creature.armor}`,
                            ...(creature.spells.length ? [`spells: ${creature.spells.join(", ")}`] : []),
                            ...(creature.abilities.length ? [`abilities: ${creature.abilities.join(", ")}`] : []),
                        ],
                    },
                };
            });
    }
    private assignAutomaticInitialPair(team: TeamName): void {
        const opponent = team === "LOWER" ? "UPPER" : "LOWER";
        const existing = this.pickedByTeam[opponent];
        if (existing.length) {
            return;
        }

        const pair =
            this.initialPairs.find((candidate) =>
                candidate.every((creatureId) => !this.isCreatureUnavailable(creatureId)),
            ) ?? this.createFallbackInitialPair();
        for (const creatureId of pair) {
            this.pickedByTeam[opponent].push(creatureId);
        }
    }
    private createFallbackInitialPair(): [number, number] {
        const levelOne = allCreatureIds.find(
            (creatureId) => getLevelOf(creatureId) === 1 && !this.isCreatureUnavailable(creatureId),
        );
        const levelTwo = allCreatureIds.find(
            (creatureId) => getLevelOf(creatureId) === 2 && !this.isCreatureUnavailable(creatureId),
        );
        if (levelOne === undefined || levelTwo === undefined) {
            throw new Error("Cannot assign an automatic initial pair");
        }
        return [levelOne, levelTwo];
    }
    private allowedPickLevels(team: TeamName): number[] {
        return [1, 2, 3, 4].filter((level) => {
            const targetCount = TARGET_LEVEL_COUNTS[level] ?? 0;
            const pickedAtLevel = this.pickedByTeam[team].filter(
                (pickedId) => getLevelOf(pickedId as CreatureId) === level,
            ).length;
            return pickedAtLevel < targetCount;
        });
    }
    private createBanActions(step: DraftStep): DraftAction[] {
        return allCreatureIds
            .filter((creatureId) => this.canBanCreature(creatureId))
            .map((creatureId) => {
                const creature = createDraftCreatureState(creatureId);
                const opponent = step.team === "LOWER" ? "UPPER" : "LOWER";
                const opponentFactions = new Set(
                    this.pickedByTeam[opponent].map((pickedId) => createDraftCreatureState(pickedId).faction),
                );
                const deniesOpponent = opponentFactions.has(creature.faction) || creature.draftValue >= 120;
                const tags = draftTagsForCreature(creature);
                return {
                    id: this.actionId(step.team, "ban", creatureId),
                    kind: "ban_unit",
                    team: step.team,
                    summary: `Ban ${creature.name}, level ${creature.level} ${creature.faction} ${creatureRole(creature)}`,
                    creatureId,
                    creatureIds: [creatureId],
                    targetLevel: creature.level,
                    tacticalTags: tags,
                    risks: [],
                    evaluation: {
                        value: Math.round(creature.draftValue * (deniesOpponent ? 0.9 : 0.65)),
                        level: creature.level,
                        faction: creature.faction,
                        role: creatureRole(creature),
                        deniesOpponent,
                        notes: [
                            deniesOpponent
                                ? "removes a high-value or faction-relevant opponent option"
                                : "removes a generally strong option",
                        ],
                    },
                };
            });
    }
    private canPickCreature(team: TeamName, creatureId: CreatureId): boolean {
        const level = getLevelOf(creatureId);
        if (this.isCreatureUnavailable(creatureId)) {
            return false;
        }
        const targetCount = TARGET_LEVEL_COUNTS[level] ?? 0;
        return (
            this.pickedByTeam[team].filter((pickedId) => getLevelOf(pickedId as CreatureId) === level).length <
            targetCount
        );
    }
    private canBanCreature(creatureId: CreatureId): boolean {
        if (this.isCreatureUnavailable(creatureId)) {
            return false;
        }

        const level = getLevelOf(creatureId);
        const allKnownPicked = [...this.pickedByTeam.LOWER, ...this.pickedByTeam.UPPER];
        const stillNeededAtLevel = this.remainingNeededAtLevel(level);
        const availableAfterBan = allCreatureIds.filter(
            (id) => getLevelOf(id) === level && !this.isCreatureUnavailable(id) && id !== creatureId,
        ).length;

        return (
            availableAfterBan >= stillNeededAtLevel &&
            PickHelper.canBanCreatureLevel(level, this.banned, allKnownPicked, allKnownPicked)
        );
    }
    private remainingNeededAtLevel(level: number): number {
        return (["LOWER", "UPPER"] as TeamName[]).reduce((sum, team) => {
            const pickedAtLevel = this.pickedByTeam[team].filter(
                (creatureId) => getLevelOf(creatureId as CreatureId) === level,
            ).length;
            return sum + Math.max(0, (TARGET_LEVEL_COUNTS[level] ?? 0) - pickedAtLevel);
        }, 0);
    }
    private isCreatureUnavailable(creatureId: number): boolean {
        return (
            this.banned.includes(creatureId) ||
            this.pickedByTeam.LOWER.includes(creatureId) ||
            this.pickedByTeam.UPPER.includes(creatureId)
        );
    }
    private toPublicState(): PublicDraftState {
        const step = this.currentStep();
        return {
            matchId: this.matchId,
            stateVersion: this.stateVersion,
            phase: step ? "draft" : "complete",
            draftPhase: step?.phase ?? "complete",
            activeTeams: step ? [step.team] : [],
            initialCreaturePairs: this.initialPairs.map((pair) => [
                createDraftCreatureState(pair[0]),
                createDraftCreatureState(pair[1]),
            ]),
            banned: this.banned.map(createDraftCreatureState),
            lower: {
                team: "LOWER",
                picked: this.pickedByTeam.LOWER.map(createDraftCreatureState),
                revealsRemaining: this.revealsRemainingByTeam.LOWER,
            },
            upper: {
                team: "UPPER",
                picked: this.pickedByTeam.UPPER.map(createDraftCreatureState),
                revealsRemaining: this.revealsRemainingByTeam.UPPER,
            },
            completedMatchId: step ? undefined : this.matchId,
        };
    }
    private currentStep(): DraftStep | undefined {
        return DRAFT_STEPS[this.stepIndex];
    }
    private actionId(team: TeamName, prefix: string, value: number): string {
        return `draft:${this.stateVersion}:${team}:${prefix}:${value}`;
    }
    private rejected(message: string): SubmitDraftActionResult {
        return {
            completed: false,
            message,
            state: this.toPublicState(),
            nextLegalActions: [],
        };
    }
}

export const placeDraftUnit = (
    gridSettings: GridSettings,
    unit: Unit,
    baseCell: { x: number; y: number },
): { x: number; y: number }[] => {
    const cells = unit.isSmallSize()
        ? [baseCell]
        : [
              baseCell,
              { x: baseCell.x + 1, y: baseCell.y },
              { x: baseCell.x, y: baseCell.y + 1 },
              { x: baseCell.x + 1, y: baseCell.y + 1 },
          ];
    const position = GridMath.getPositionForCells(gridSettings, cells);
    if (!position) {
        throw new Error(`Cannot place ${unit.getName()} at ${baseCell.x}:${baseCell.y}`);
    }
    unit.setPosition(position.x, position.y);
    return cells;
};
