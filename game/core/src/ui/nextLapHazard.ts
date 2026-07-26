import { HoCConstants } from "@heroesofcrypto/common";

import type { IVisibleState } from "../scenes/VisibleState";

/**
 * Board hazards that fire between laps rather than on anybody's turn: the map closing in, and the
 * armageddon waves that chip every stack once the fight has gone long. Both land AFTER the current lap
 * finishes, so the player can still act on the warning — reposition out of the doomed border ring, or
 * push for the kill before attrition decides it.
 */
export type NextLapHazardKind = "armageddon" | "narrowing";

export interface INextLapHazard {
    kind: NextLapHazardKind;
    /** Short line for a always-visible badge. */
    label: string;
    /** Longer sentence for a tooltip. */
    detail: string;
}

/**
 * What (if anything) hits when this lap ends. Armageddon outranks narrowing: once the waves start they
 * repeat every lap and are the more urgent read, so a lap that would do both announces the meteors.
 *
 * The two predicates were duplicated in MessageBox and UpNextOverlay, each rendering a hover-only icon;
 * this is the single copy they now share, so a rule change can't update one warning and miss the other.
 */
export const nextLapHazard = (visibleState: IVisibleState | undefined): INextLapHazard | undefined => {
    const lapNumber = visibleState?.lapNumber;
    if (!lapNumber) {
        return undefined;
    }

    if (lapNumber >= HoCConstants.NUMBER_OF_LAPS_FIRST_ARMAGEDDON) {
        return {
            kind: "armageddon",
            label: "Armageddon next lap",
            detail: "An armageddon wave damages every stack on the board when this lap ends.",
        };
    }

    const { numberOfLapsTillNarrowing, numberOfLapsTillStopNarrowing, lapsNarrowed } = visibleState;
    if (
        numberOfLapsTillNarrowing !== undefined &&
        lapNumber < numberOfLapsTillStopNarrowing &&
        lapNumber % numberOfLapsTillNarrowing === 0 &&
        lapsNarrowed < HoCConstants.MAX_NARROWING_LAPS_TOTAL
    ) {
        return {
            kind: "narrowing",
            label: "Map narrows next lap",
            detail: "The board's outer ring closes in when this lap ends. Units caught on it are destroyed.",
        };
    }

    return undefined;
};
