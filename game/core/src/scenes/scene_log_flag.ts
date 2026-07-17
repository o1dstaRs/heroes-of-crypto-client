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
 * "Wolf Rider" isn't shadowed by "Wolf"); returns "" for lines that aren't about a unit. A few lines
 * lead with a count instead of the unit name ("4 Beholder killed by Petrifying Gaze") — those are
 * about the RECEIVER, so we also try matching after stripping a leading "<n> " count, colouring the
 * line by the struck unit's team. When the matched name is the active unit's, the active unit's real
 * team wins — disambiguating a creature mirrored on both teams for that unit's own lines.
 */
export function resolveLineTeamFlag(
    line: string,
    teamByName: ReadonlyMap<string, TeamOrAmbiguous>,
    active?: { name: string; team: number },
): string {
    // Lines like "4 Beholder killed by Petrifying Gaze" lead with a kill count, not the unit name.
    const countStripped = line.replace(/^\d+\s+/, "");
    let bestName: string | undefined;
    for (const name of teamByName.keys()) {
        if (
            (line.startsWith(name) || countStripped.startsWith(name)) &&
            (bestName === undefined || name.length > bestName.length)
        ) {
            bestName = name;
        }
    }
    if (bestName === undefined) {
        return "";
    }

    let team: TeamOrAmbiguous | undefined = teamByName.get(bestName);
    if (active) {
        const afterName = countStripped.slice(bestName.length);
        if (/^\s+resp\b/.test(afterName)) {
            // A response line ("<Responder> resp <Attacker> …") is authored by the RESPONDER — the unit
            // that was attacked, i.e. the active (acting) unit's opponent. In a mirror match the name
            // can't tell the two instances apart, but the responder is always the enemy of the active
            // unit, so its side is the opposite of the active unit's.
            team = oppositeTeam(active.team);
        } else if (bestName === active.name && !/\bdied\b|killed by/.test(countStripped)) {
            // The active unit's own action line (moved / ⚔️ / 🏹 / applied / skips / Morale …). Its real
            // team disambiguates a creature mirrored on both sides. Death / "killed by" lines are skipped
            // because they name the VICTIM, which may be either mirrored instance.
            team = active.team;
        }
    }

    if (team === TeamVals.LOWER) {
        return "🟢";
    }
    if (team === TeamVals.UPPER) {
        return "🔴";
    }
    return "";
}

/** The other side. Two-team game: LOWER <-> UPPER. */
function oppositeTeam(team: number): number {
    return team === TeamVals.LOWER ? TeamVals.UPPER : TeamVals.LOWER;
}
