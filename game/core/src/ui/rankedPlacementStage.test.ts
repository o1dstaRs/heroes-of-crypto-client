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
    shouldShowRankedAugmentPicker,
    shouldShowRankedPlacementRosters,
} from "./rankedPlacementStage";

describe("ranked Setup opponent-roster policy", () => {
    test.each([
        ["keeps public/default Setup visible", true, 0, false, false],
        ["hides only an explicitly private split Setup", true, 0, true, true],
        ["does not extend Setup privacy into Board placement", true, 1, true, false],
        ["ignores an out-of-scope privacy flag on legacy combined placement", false, 0, true, false],
    ] as const)("%s", (_case, placementSplit, placementStage, hideOpponentRosterDuringSetup, hidden) => {
        expect(
            shouldHideRankedSetupOpponentRoster({ placementSplit, placementStage, hideOpponentRosterDuringSetup }),
        ).toBe(hidden);
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

/**
 * Augments must stay adjustable in the sidebar while positioning — the regression this pins is that the
 * ability silently vanished when the augment step became its own screen, even though the SERVER never
 * stopped accepting the change (validateAction gates AUGMENT on team ownership alone, and play_session
 * says setup choices "stay EDITABLE through the board stage ... right up until their own board-ready").
 */
describe("shouldShowRankedAugmentPicker", () => {
    test.each([
        ["shows the live picker while positioning the board", PlayPhase.PLACEMENT, false, false, false, true],
        // Two live pickers on one build would let the same points be spent twice over.
        ["stays hidden behind the Setup step's own full-screen picker", PlayPhase.PLACEMENT, true, false, false, false],
        [
            "collapses to the recap once the player locks in, which is where the server stops accepting",
            PlayPhase.PLACEMENT,
            false,
            false,
            true,
            false,
        ],
        ["never offers picking to an observer", PlayPhase.PLACEMENT, false, true, false, false],
        ["is placement-only — never during the fight", PlayPhase.PLAY, false, false, false, false],
    ] as const)("%s", (_case, phase, augmentOverlayOpen, observer, ready, shown) => {
        expect(shouldShowRankedAugmentPicker({ phase }, augmentOverlayOpen, observer, ready)).toBe(shown);
    });
});

/**
 * The two augment pickers have different SHAPES and each belongs in one place.
 *
 * SideToggleContainer expands every augment card at once — right on the full-screen Setup step, wrong in
 * the narrow sidebar, where it stacks three tall radio groups and pushes the artifacts and the rest of the
 * panel off the bottom. SandboxToggleContainer is the compact form: a row of augment icons with only the
 * chosen augment's options underneath. Both drive the same picker underneath, so this is layout only.
 */
describe("the ranked sidebar uses the compact augment picker", () => {
    const source = readFileSync(join(import.meta.dir, "RankedGameViewRuntime.tsx"), "utf8");

    test("the sidebar mounts the compact container, still wired to the authoritative build and commit gate", () => {
        const sidebar = source.slice(
            source.indexOf("augmentsEditableInSidebar ? ("),
            source.indexOf("{/* The augment step is its own full screen"),
        );
        expect(sidebar).toContain("<SandboxToggleContainer");
        expect(sidebar).not.toContain("<SideToggleContainer");
        // The Setup step still gets the expanded cards — it has the room for them.
        expect(source).toContain("<SideToggleContainer");

        // Layout change only: dropping either prop would silently show a blank picker with a full budget,
        // or leave the "Lock in augments" button unable to tell when the points are spent.
        const compact = sidebar.slice(sidebar.indexOf("<SandboxToggleContainer"));
        expect(compact).toContain("authoritativeSelections={augmentAuthoritativeSelections}");
        expect(compact).toContain("onReadyChange={setAugmentReady}");
        // Ranked hides the free artifact picker (artifacts are drafted); the co-op sandbox shows it.
        expect(compact).toContain("showArtifactPicker={skipAugmentStep}");
    });
});
