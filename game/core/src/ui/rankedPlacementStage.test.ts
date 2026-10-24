import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";

import { PlayActionType, PlayPhase } from "../api/play_protocol";
import {
    isRankedBoardPlacementStage,
    observerPlacementRosterIds,
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

describe("spectator placement rosters", () => {
    const boardUnits = [
        { team: TeamVals.LEFT, creatureId: 31, dead: false },
        { team: TeamVals.RIGHT, creatureId: 46, dead: false },
        { team: TeamVals.LEFT, creatureId: 48, dead: false },
        { team: TeamVals.LEFT, creatureId: 16, dead: true },
        { team: TeamVals.LEFT, creatureId: 0, dead: false },
    ];

    test("lists only the creatures the snapshot already exposes for that team", () => {
        const board = { phase: PlayPhase.PLACEMENT, fightStarted: false, units: boardUnits };

        expect(observerPlacementRosterIds(board, TeamVals.LEFT)).toEqual([31, 48]);
        expect(observerPlacementRosterIds(board, TeamVals.RIGHT)).toEqual([46]);
    });

    test("shows nothing while the server withholds a private Setup roster", () => {
        expect(
            observerPlacementRosterIds({ phase: PlayPhase.PLACEMENT, fightStarted: false, units: [] }, TeamVals.LEFT),
        ).toEqual([]);
    });

    test("stops once the fight starts, where the board shows the armies", () => {
        expect(
            observerPlacementRosterIds({ phase: PlayPhase.PLAY, fightStarted: true, units: boardUnits }, TeamVals.LEFT),
        ).toEqual([]);
        expect(
            observerPlacementRosterIds(
                { phase: PlayPhase.PLACEMENT, fightStarted: true, units: boardUnits },
                TeamVals.LEFT,
            ),
        ).toEqual([]);
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

describe("ranked board placement stage (fail-open)", () => {
    test("legacy combined placement is always a board stage", () => {
        expect(isRankedBoardPlacementStage({ placementSplit: false, placementStage: 0 })).toBe(true);
    });

    test("split Setup (stage 0) is not a board stage", () => {
        expect(isRankedBoardPlacementStage({ placementSplit: true, placementStage: 0 })).toBe(false);
    });

    test("every split stage past Setup is a board stage — including ones newer than 1", () => {
        expect(isRankedBoardPlacementStage({ placementSplit: true, placementStage: 1 })).toBe(true);
        // The old `=== 1` gate stripped the READY footer from any later board sub-stage,
        // leaving no confirm control on screen at all. Fail open instead.
        expect(isRankedBoardPlacementStage({ placementSplit: true, placementStage: 2 })).toBe(true);
    });
});

describe("augments belong to the separate setup screen", () => {
    const source = readFileSync(join(import.meta.dir, "RankedGameViewRuntime.tsx"), "utf8");

    test("board placement shows the chosen build without an augment editor", () => {
        expect(source).not.toContain("<SandboxToggleContainer");
        expect(source).toContain("<RankedAugmentSummary");
        expect(source).toContain("Your augments");
        expect(source).toContain("<SynergiesRow synergies={synergies}");
    });

    test("the setup screen retains its authoritative picker and completion gate", () => {
        expect(source).toContain("<SideToggleContainer");
        expect(source).toContain("authoritativeSelections={augmentAuthoritativeSelections}");
        expect(source).toContain("onReadyChange={setAugmentReady}");
    });
});
