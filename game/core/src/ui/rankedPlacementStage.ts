import { PlayActionType, PlayPhase, type PlayActionTypeValue } from "../api/play_protocol";

interface RankedPlacementStage {
    phase: number;
    placementSplit: boolean;
    placementStage: number;
}

interface RankedSetupRosterPolicy {
    placementSplit: boolean;
    placementStage: number;
    hideOpponentRosterDuringSetup?: boolean;
}

/** The privacy flag applies only to stage 0 of the split placement flow. */
export const shouldHideRankedSetupOpponentRoster = (snapshot: RankedSetupRosterPolicy): boolean =>
    snapshot.hideOpponentRosterDuringSetup === true &&
    snapshot.placementSplit === true &&
    snapshot.placementStage === 0;

/** Every stage of the split flow past Setup (stage 0) is a board stage. FAIL-OPEN on purpose:
 *  a gate written as `=== 1` silently stripped the READY footer and rosters from any later board
 *  sub-stage, leaving the player with no way to confirm placement at all. */
export const isRankedBoardPlacementStage = (
    snapshot: Pick<RankedPlacementStage, "placementSplit" | "placementStage">,
): boolean => !snapshot.placementSplit || snapshot.placementStage !== 0;

/** The placement sidebar roster appears on Board, never behind the augment modal. */
export const shouldShowRankedPlacementRosters = (
    snapshot: RankedPlacementStage,
    augmentOverlayOpen: boolean,
): boolean => snapshot.phase === PlayPhase.PLACEMENT && !augmentOverlayOpen && isRankedBoardPlacementStage(snapshot);

/**
 * Whether the sidebar shows the LIVE augment picker rather than the read-only recap.
 *
 * Augments stay adjustable while you position the board. That is the SERVER's rule, not a UI nicety:
 * validateAction gates the AUGMENT action on team ownership alone, and play_session states it outright —
 * "Setup choices (augments/synergies) stay EDITABLE through the board stage — a player may re-spend their
 * points while positioning, right up until their own board-ready" — adding that "the client hides those
 * controls after ready, so only the UI was holding the rule up". When the augment step became its own
 * screen the sidebar was left with a recap only, which silently withdrew that ability.
 *
 * Two exclusions, both real rather than defensive: the Setup step's own full-screen picker must not run
 * beside a second live picker on the same build, and once you lock in (your own ready) the server stops
 * accepting changes, so the recap is then the honest thing to show. Observers never pick.
 */
export const shouldShowRankedAugmentPicker = (
    snapshot: Pick<RankedPlacementStage, "phase">,
    augmentOverlayOpen: boolean,
    isObserver: boolean,
    ready: boolean,
): boolean => snapshot.phase === PlayPhase.PLACEMENT && !isObserver && !augmentOverlayOpen && !ready;

/** START_FIGHT is the split Setup lock only; Board/legacy placement uses the ordinary placement-ready action. */
export const rankedPlacementLockActionType = (
    snapshot: Pick<RankedPlacementStage, "placementSplit" | "placementStage">,
): PlayActionTypeValue =>
    snapshot.placementSplit && snapshot.placementStage === 0
        ? PlayActionType.START_FIGHT
        : PlayActionType.READY_PLACEMENT;
