/*
 * -----------------------------------------------------------------------------
 * Pure helpers for the sandbox scene log's per-line team colour flag (🟢 LOWER / 🔴 UPPER). The sandbox
 * log is the engine's plain text ("<UnitName> …"), so we resolve a line's side by the unit name it
 * leads with. A creature type fielded by BOTH teams is "ambiguous" by name alone — but the unit whose
 * turn it is, is a known instance, so its real team is used for lines that lead with its name (which is
 * the bulk of them). Kept pure here so the ambiguity / longest-match / active-unit logic is testable
 * without standing up a Pixi scene. Ranked doesn't use this — it flags by unit id from events.
 * -----------------------------------------------------------------------------
 */

import { TeamVals } from "@heroesofcrypto/common";

export type TeamOrAmbiguous = number | "ambiguous";

/**
 * Fold a unit's (name, team) into the accumulating name→team index. A name first seen records its team;
 * a name later seen on a different team becomes "ambiguous" (and stays that way). Reset the map per
 * fight so a creature fielded on a different team last fight doesn't linger as ambiguous.
 */
export function indexUnitTeam(teamByName: Map<string, TeamOrAmbiguous>, name: string, team: number): void {
    const existing = teamByName.get(name);
    if (existing === undefined) {
        teamByName.set(name, team);
    } else if (existing !== "ambiguous" && existing !== team) {
        teamByName.set(name, "ambiguous");
    }
}

/**
 * Resolve a scene-log line to its team flag. Picks the longest unit name that prefixes the line (so
 * "Wolf Rider" isn't shadowed by "Wolf"); returns "" for lines that aren't about a unit. When the
 * matched name is the active unit's, the active unit's real team wins — disambiguating a creature
 * mirrored on both teams for that unit's own move/attack lines (the common case, AI- or player-driven).
 */
export function resolveLineTeamFlag(
    line: string,
    teamByName: ReadonlyMap<string, TeamOrAmbiguous>,
    active?: { name: string; team: number },
): string {
    let bestName: string | undefined;
    for (const name of teamByName.keys()) {
        if (line.startsWith(name) && (bestName === undefined || name.length > bestName.length)) {
            bestName = name;
        }
    }
    if (bestName === undefined) {
        return "";
    }
    const team = active && bestName === active.name ? active.team : teamByName.get(bestName);
    if (team === TeamVals.LOWER) {
        return "🟢";
    }
    if (team === TeamVals.UPPER) {
        return "🔴";
    }
    return "";
}
