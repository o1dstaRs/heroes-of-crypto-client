import {
    AttackVals,
    FactionVals,
    GridVals,
    MovementVals,
    TeamVals,
    ToFactionName,
    type GameEvent,
    type GridType,
    type TeamType,
    type Unit,
} from "@heroesofcrypto/common";

import type { PublicUnitState, TeamName } from "./types";

type EnumLike = Record<string, string | number>;

const enumLabel = (enumLike: EnumLike, value: number): string => {
    const name = enumLike[value];
    return typeof name === "string" ? name.toLowerCase().replaceAll("_", " ") : String(value);
};

export const teamToName = (team: TeamType): TeamName => {
    if (team === TeamVals.LOWER) {
        return "LOWER";
    }
    if (team === TeamVals.UPPER) {
        return "UPPER";
    }
    throw new Error(`Unsupported team ${team}`);
};

export const teamFromName = (team: TeamName): TeamType => (team === "LOWER" ? TeamVals.LOWER : TeamVals.UPPER);

export const gridTypeName = (gridType: GridType): string => enumLabel(GridVals, gridType);

export const serializeUnit = (unit: Unit): PublicUnitState => ({
    id: unit.getId(),
    name: unit.getName(),
    team: teamToName(unit.getTeam()),
    faction: ToFactionName[unit.getFaction()] ?? enumLabel(FactionVals, unit.getFaction()),
    level: unit.getLevel(),
    size: unit.getSize(),
    cells: unit.getCells().map((cell) => ({ ...cell })),
    hp: unit.getHp(),
    maxHp: unit.getMaxHp(),
    amountAlive: unit.getAmountAlive(),
    amountDied: unit.getAmountDied(),
    attackType: enumLabel(AttackVals, unit.getAttackType()),
    selectedAttackType: enumLabel(AttackVals, unit.getAttackTypeSelection()),
    possibleAttackTypes: unit.getPossibleAttackTypes().map((attackType) => enumLabel(AttackVals, attackType)),
    movementType: enumLabel(MovementVals, unit.getMovementType()),
    speed: unit.getSpeed(),
    steps: unit.getSteps(),
    morale: unit.getMorale(),
    luck: unit.getLuck(),
    stackPower: unit.getStackPower(),
    rangeShots: unit.getRangeShots(),
    abilities: unit.getAbilities().map((ability) => ability.getName()),
    spells: unit.getSpells().map((spell) => ({ name: spell.getName(), remaining: spell.getAmount() })),
    buffs: unit.getBuffs().map((buff) => buff.getName()),
    debuffs: unit.getDebuffs().map((debuff) => debuff.getName()),
});

export const winningTeamFromEvents = (events: GameEvent[]): TeamName | undefined => {
    const finishEvent = events.find((event) => event.type === "fight_finished");
    if (finishEvent?.type !== "fight_finished") {
        return undefined;
    }
    return teamToName(finishEvent.winningTeam);
};
