import { getSynergyReference } from "../../src/resources";
import type { DraftCreatureState, PublicDraftState, PublicMatchState, PublicUnitState, TeamName } from "../../src/types";
import { actionChoices } from "./action_selection";
import type { HarnessAction, HarnessPhase, HarnessState, HarnessStyle } from "./types";

const isDraftState = (state: HarnessState): state is PublicDraftState => "draftPhase" in state;

const cellText = (cells: Array<{ x: number; y: number }>): string =>
    cells.map((cell) => `${cell.x},${cell.y}`).join(";") || "none";

const listText = (items: string[] | undefined, fallback = "none"): string =>
    items?.length ? items.join(", ") : fallback;

const creatureText = (creature: DraftCreatureState): string =>
    `${creature.name} L${creature.level} ${creature.faction} hp ${creature.hp} speed ${creature.speed} ` +
    `attack ${creature.attack} dmg ${creature.damage.min}-${creature.damage.max} role ${creature.attackType} ` +
    `abilities ${listText(creature.abilities)} spells ${listText(creature.spells)}`;

const unitText = (unit: PublicUnitState, activeUnitId?: string): string => {
    const active = unit.id === activeUnitId ? " ACTIVE" : "";
    const spells = unit.spells.map((spell) => `${spell.name}:${spell.remaining}`);
    return (
        `${unit.team}${active} ${unit.name} L${unit.level} ${unit.faction} at ${cellText(unit.cells)} ` +
        `hp ${unit.hp}/${unit.maxHp} alive ${unit.amountAlive} speed ${unit.speed} steps ${unit.steps} ` +
        `attack ${unit.attackType}/${unit.selectedAttackType} shots ${unit.rangeShots} ` +
        `abilities ${listText(unit.abilities)} spells ${listText(spells)} buffs ${listText(unit.buffs)} debuffs ${listText(unit.debuffs)}`
    );
};

const summarizeEvaluation = (action: HarnessAction): string => {
    const evaluation = action.evaluation as
        | {
              targetName?: string;
              targetValue?: number;
              priorityScore?: number;
              damage?: { min: number; max: number; targetTotalHp: number; killsTarget: boolean };
              retaliation?: boolean;
              spell?: {
                  name: string;
                  targetType: string;
                  powerType: string;
                  estimatedValue: number;
                  remaining: number;
                  isMass: boolean;
                  isSummon: boolean;
              };
              value?: number;
              level?: number;
              faction?: string;
              role?: string;
              deniesOpponent?: boolean;
              notes?: string[];
          }
        | undefined;
    if (!evaluation) {
        return "";
    }

    const parts: string[] = [];
    if (typeof evaluation.value === "number") {
        parts.push(`value ${evaluation.value}`);
    }
    if (evaluation.level) {
        parts.push(`level ${evaluation.level}`);
    }
    if (evaluation.faction) {
        parts.push(`faction ${evaluation.faction}`);
    }
    if (evaluation.role) {
        parts.push(`role ${evaluation.role}`);
    }
    if (evaluation.deniesOpponent) {
        parts.push("denies opponent");
    }
    if (evaluation.targetName) {
        parts.push(`target ${evaluation.targetName}`);
    }
    if (typeof evaluation.targetValue === "number") {
        parts.push(`targetValue ${evaluation.targetValue}`);
    }
    if (typeof evaluation.priorityScore === "number") {
        parts.push(`priority ${evaluation.priorityScore}`);
    }
    if (evaluation.damage) {
        parts.push(
            `damage ${evaluation.damage.min}-${evaluation.damage.max} vs hp ${evaluation.damage.targetTotalHp}` +
                (evaluation.damage.killsTarget ? " lethal" : ""),
        );
    }
    if (typeof evaluation.retaliation === "boolean") {
        parts.push(evaluation.retaliation ? "retaliation risk" : "no retaliation");
    }
    if (evaluation.spell) {
        parts.push(
            `spell ${evaluation.spell.name} ${evaluation.spell.targetType}/${evaluation.spell.powerType} ` +
                `value ${evaluation.spell.estimatedValue} remaining ${evaluation.spell.remaining}` +
                (evaluation.spell.isMass ? " mass" : "") +
                (evaluation.spell.isSummon ? " summon" : ""),
        );
    }
    if (evaluation.notes?.length) {
        parts.push(`notes ${evaluation.notes.join(", ")}`);
    }
    return parts.length ? ` [${parts.join("; ")}]` : "";
};

const choiceLines = (actions: HarnessAction[]): string[] =>
    actionChoices(actions).map((choice, index) => {
        const action = actions[index];
        const tags = action.tacticalTags.length ? ` tags ${action.tacticalTags.join(", ")}` : "";
        const risks = action.risks.length ? ` risks ${action.risks.join(", ")}` : "";
        return `${choice.label}. ${choice.summary}${tags}${risks}${summarizeEvaluation(action)}`;
    });

const fightMechanicsNotes = (): string[] => {
    const synergies = getSynergyReference();
    return [
        "Goal: destroy every enemy stack before your own army is destroyed.",
        "The legal choices below are authoritative; choose exactly one listed label.",
        "Usually prefer lethal damage, removing enemy turns, valuable targets, strong summons/control, and safe ranged pressure.",
        "Wait only when delaying creates a better same-lap action. Defend/end only when no useful pressure exists.",
        `Synergy thresholds by same-faction unit count: ${Object.entries(synergies.thresholds)
            .map(([units, level]) => `${units}->${level}`)
            .join(", ")}.`,
        `Faction notes: ${synergies.notes.join(" ")}`,
    ];
};

const draftMechanicsNotes = (): string[] => {
    const synergies = getSynergyReference();
    return [
        "Draft goal: build six creature stacks per team: two level 1, two level 2, one level 3, and one level 4.",
        "The first action is LOWER choosing an initial pair with one level 1 and one level 2 creature.",
        "The opposing team receives an automatic initial pair, then UPPER gets an extended pick and extended ban.",
        "After that, teams alternate pick and ban actions until each army is complete.",
        "The legal choices below already enforce required level, unavailable creatures, pair indexes, and safe ban legality.",
        "Prefer complementary roles: frontline durability, ranged pressure, caster/support, speed/tempo, and a high-impact threat.",
        "Ranged pressure is a primary draft axis in this version: try to out-pick the opponent in ranged units, not just match them.",
        "Tsar Cannon and Gargantuan are premium ranged threats: secure one when legal and useful, otherwise ban them or make sure they are already unavailable.",
        "Ban high-value level 4 units, strong ranged/caster units, or faction-relevant options that complete the opponent plan.",
        `Synergy thresholds by same-faction unit count: ${Object.entries(synergies.thresholds)
            .map(([units, level]) => `${units}->${level}`)
            .join(", ")}.`,
        `Faction notes: ${synergies.notes.join(" ")}`,
    ];
};

const draftLines = (state: PublicDraftState): string[] => [
    `Draft match ${state.matchId} version ${state.stateVersion}.`,
    `Phase ${state.draftPhase}; active teams ${state.activeTeams.join(",") || "none"}; required level ${
        state.requiredLevel ?? "any"
    }.`,
    `LOWER picked: ${state.lower.picked.map((creature) => creature.name).join(", ") || "none"}.`,
    `UPPER picked: ${state.upper.picked.map((creature) => creature.name).join(", ") || "none"}.`,
    `Banned: ${state.banned.map((creature) => creature.name).join(", ") || "none"}.`,
    state.initialCreaturePairs.length
        ? `Initial pairs: ${state.initialCreaturePairs
              .map((pair, index) => `${index + 1}) ${pair.map((creature) => creatureText(creature)).join(" + ")}`)
              .join(" | ")}.`
        : "",
].filter(Boolean);

const fightLines = (state: PublicMatchState): string[] => {
    const unitsById = new Map(state.units.map((unit) => [unit.id, unit]));
    return [
        `Fight match ${state.matchId} version ${state.stateVersion}.`,
        `Phase ${state.phase}; active team ${state.activeTeam ?? "none"}; lap ${state.grid.currentLap}; grid ${
            state.grid.type
        } size ${state.grid.size}; narrowed layers ${state.grid.narrowedLayers}.`,
        "Units:",
        ...state.units.map((unit) => `- ${unitText(unit, state.activeUnitId)}`),
        `Turn order: ${
            state.turnOrderPreview
                .map((unitId) => unitsById.get(unitId))
                .filter((unit): unit is PublicUnitState => !!unit)
                .map((unit) => `${unit.team} ${unit.name}`)
                .join(" -> ") || "none"
        }.`,
        `Last events: ${state.lastEvents.map((event) => event.type).join(", ") || "none"}.`,
    ];
};

export const buildModelChoicePrompt = (input: {
    phase: HarnessPhase;
    team: TeamName;
    style: HarnessStyle;
    state: HarnessState;
    legalActions: HarnessAction[];
    includeMechanicsContext: boolean;
}): string => {
    const mechanicsNotes = input.includeMechanicsContext
        ? isDraftState(input.state)
            ? draftMechanicsNotes()
            : fightMechanicsNotes()
        : [];
    const stateLines = isDraftState(input.state) ? draftLines(input.state) : fightLines(input.state);
    const lines = [
        `You are choosing one legal Heroes of Crypto action for team ${input.team}.`,
        `Style: ${input.style}.`,
        ...mechanicsNotes,
        ...stateLines,
        "Legal choices:",
        ...choiceLines(input.legalActions),
        "Return only one choice label, such as A. Do not explain. Do not invent a move.",
    ];

    return lines.join("\n");
};
