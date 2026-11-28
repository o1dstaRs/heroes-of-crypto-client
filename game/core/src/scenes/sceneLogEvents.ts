import {
    AttackVals,
    GridMath,
    HoCConstants,
    HoCLib,
    TeamVals,
    type AttackType,
    type GameEvent,
    type HoCMath,
} from "@heroesofcrypto/common";

/** Convert an authoritative system-move world position back to the destination cell shown in the fight log. */
export const rankedSystemMoveSceneLogLine = (
    unitName: string,
    reason: Extract<GameEvent, { type: "unit_moved_by_system" }>["reason"],
    position: HoCMath.XY,
    gridSettings: Parameters<typeof GridMath.getCellForPosition>[0],
): string => {
    const cell = GridMath.getCellForPosition(gridSettings, position);
    return `${unitName} moved by ${reason} to(${cell.x}, ${cell.y})`;
};

/** World coordinates in the journal are converted to the cell label used by the battle log. */
export function sceneLogMovementLine(name: string, cell?: HoCMath.XY): string {
    return cell ? `${name} moved to(${cell.x}, ${cell.y})` : `${name} moved to`;
}

/**
 * One scene-log line per buff/debuff/effect the action landed (or a debuff a target resisted), from
 * the authoritative `effects_applied` event — the ONLY source that names every recipient of a mass
 * cast and every on-hit rider (Stun, Break, Poison, …) in ranked. `suppress` holds "unitId|name"
 * pairs already told by the entry's own cast line ("cast Riot on Pikeman"), so a single-target cast
 * is not narrated twice.
 */
export const effectsAppliedSceneLogLines = (
    event: GameEvent,
    unitNames: ReadonlyMap<string, string>,
    flagForUnit: (unitId: string) => string = () => "",
    suppress: ReadonlySet<string> = new Set(),
): string[] => {
    if (event.type !== "effects_applied") {
        return [];
    }
    const lines: string[] = [];
    for (const entry of event.applications) {
        if (!entry.resisted && suppress.has(`${entry.unitId}|${entry.name}`)) {
            continue;
        }
        const name = unitNames.get(entry.unitId) ?? "Unit";
        const flag = flagForUnit(entry.unitId);
        let text: string;
        if (entry.resisted) {
            text = `${name} resisted ${entry.name}${entry.resistedBy ? ` (${entry.resistedBy})` : ""}`;
        } else if (entry.kind === "buff" && entry.sourceUnitId) {
            text = `${name} copied ${entry.name} from ${unitNames.get(entry.sourceUnitId) ?? "Unit"}`;
        } else {
            const verb = entry.kind === "buff" ? "gains" : entry.kind === "debuff" ? "suffers" : "got";
            // A duration at or past the whole-fight cap reads as "permanent" — no lap suffix.
            const lapSuffix =
                entry.laps && entry.laps > 0 && entry.laps < HoCConstants.NUMBER_OF_LAPS_TOTAL
                    ? ` for ${HoCLib.getLapString(entry.laps)}`
                    : "";
            text = `${name} ${verb} ${entry.name}${lapSuffix}`;
        }
        lines.push(flag ? `${flag} ${text}` : text);
    }
    return lines;
};

/**
 * The "unitId|name" pairs a journal entry's spell_cast events already narrate ("cast Riot on
 * Pikeman"), used to keep effectsAppliedSceneLogLines from repeating them.
 */
export const spellCastNarratedPairs = (events: readonly GameEvent[]): Set<string> => {
    const pairs = new Set<string>();
    for (const event of events) {
        if (event.type === "spell_cast" && event.targetId) {
            pairs.add(`${event.targetId}|${event.spellName}`);
        }
    }
    return pairs;
};

function attackTypeLabel(attackType: AttackType): string {
    if (attackType === AttackVals.RANGE) {
        return "range";
    }
    if (attackType === AttackVals.MAGIC || attackType === AttackVals.MELEE_MAGIC) {
        return "magic";
    }
    if (attackType === AttackVals.MELEE) {
        return "melee";
    }
    return "new";
}

/** Journal messages about board changes and turn boundaries shared by native and ranked play. */
export function sceneLogBoardEventLine(
    event: GameEvent,
    unitNames: ReadonlyMap<string, string>,
    getGridSettings: () => Parameters<typeof GridMath.getCellForPosition>[0],
): string | undefined {
    const nameOf = (unitId: string) => unitNames.get(unitId) ?? "Unit";
    switch (event.type) {
        case "lap_initialized":
            return `Lap ${event.lap} started`;
        case "lap_flipped":
            return `Lap ${event.currentLap} started`;
        case "center_dried":
            return "Center dried";
        case "center_obstacle_cleared":
            return "Center obstacle cleared";
        case "narrowing_applied":
            return "Map narrowed";
        case "unit_moved_by_system":
            return rankedSystemMoveSceneLogLine(nameOf(event.unitId), event.reason, event.position, getGridSettings());
        case "unit_destroyed":
            switch (event.reason) {
                case "dead_cleanup":
                    return `${nameOf(event.unitId)} died`;
                case "armageddon":
                    return `${nameOf(event.unitId)} destroyed by Armageddon`;
                case "poison":
                    return `${nameOf(event.unitId)} succumbed to poison`;
                case "narrowing":
                    return `${nameOf(event.unitId)} destroyed by narrowing`;
            }
            return undefined;
        case "armageddon_applied":
            return `${nameOf(event.unitId)} received (${event.damage}) from Armageddon`;
        case "attack_type_selected":
            return `${nameOf(event.unitId)} selected ${attackTypeLabel(event.attackType)} attack`;
        case "unit_moved":
            return sceneLogMovementLine(nameOf(event.unitId), event.targetCells[0] ?? event.path.at(-1));
        case "fight_finished":
            return event.winningTeam === TeamVals.NO_TEAM
                ? "Fight finished! Draw!"
                : `Fight finished! ${event.winningTeam === TeamVals.LEFT ? "Green" : "Red"} team wins!`;
        default:
            return undefined;
    }
}
