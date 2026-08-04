import { describe, expect, test } from "bun:test";

import { PlayActionType, PlayPhase } from "../api/play_protocol";
import {
    rankedPlacementLockActionType,
    shouldHideRankedSetupOpponentRoster,
    shouldShowRankedPlacementRosters,
} from "./rankedPlacementStage";

describe("ranked Setup opponent-roster policy", () => {
    test("keeps public/default Setup visible", () => {
        expect(
            shouldHideRankedSetupOpponentRoster({
                placementSplit: true,
                placementStage: 0,
                hideOpponentRosterDuringSetup: false,
            }),
        ).toBe(false);
    });

    test("hides only an explicitly private split Setup", () => {
        expect(
            shouldHideRankedSetupOpponentRoster({
                placementSplit: true,
                placementStage: 0,
                hideOpponentRosterDuringSetup: true,
            }),
        ).toBe(true);
    });

    test("does not extend Setup privacy into Board placement", () => {
        expect(
            shouldHideRankedSetupOpponentRoster({
                placementSplit: true,
                placementStage: 1,
                hideOpponentRosterDuringSetup: true,
            }),
        ).toBe(false);
    });

    test("ignores an out-of-scope privacy flag on legacy combined placement", () => {
        expect(
            shouldHideRankedSetupOpponentRoster({
                placementSplit: false,
                placementStage: 0,
                hideOpponentRosterDuringSetup: true,
            }),
        ).toBe(false);
    });
});

describe("ranked opponent roster visibility", () => {
    test("keeps the placement sidebar hidden throughout split augment setup", () => {
        const setup = { phase: PlayPhase.PLACEMENT, placementSplit: true, placementStage: 0 };

        expect(shouldShowRankedPlacementRosters(setup, true)).toBe(false);
        expect(shouldShowRankedPlacementRosters(setup, false)).toBe(false);
    });

    test("shows the opponent only after split board placement opens and the augment modal closes", () => {
        const board = { phase: PlayPhase.PLACEMENT, placementSplit: true, placementStage: 1 };

        expect(shouldShowRankedPlacementRosters(board, true)).toBe(false);
        expect(shouldShowRankedPlacementRosters(board, false)).toBe(true);
    });

    test("keeps legacy combined placement hidden behind its augment modal", () => {
        const legacy = { phase: PlayPhase.PLACEMENT, placementSplit: false, placementStage: 0 };

        expect(shouldShowRankedPlacementRosters(legacy, true)).toBe(false);
        expect(shouldShowRankedPlacementRosters(legacy, false)).toBe(true);
    });

    test("never renders the placement roster during the fight", () => {
        const fight = { phase: PlayPhase.PLAY, placementSplit: true, placementStage: 1 };

        expect(shouldShowRankedPlacementRosters(fight, false)).toBe(false);
    });
});

describe("ranked placement lock action", () => {
    test("uses START_FIGHT for the split Setup lock", () => {
        expect(rankedPlacementLockActionType({ placementSplit: true, placementStage: 0 })).toBe(
            PlayActionType.START_FIGHT,
        );
    });

    test("keeps READY_PLACEMENT for Board and legacy combined placement", () => {
        expect(rankedPlacementLockActionType({ placementSplit: true, placementStage: 1 })).toBe(
            PlayActionType.READY_PLACEMENT,
        );
        expect(rankedPlacementLockActionType({ placementSplit: false, placementStage: 0 })).toBe(
            PlayActionType.READY_PLACEMENT,
        );
    });
});
