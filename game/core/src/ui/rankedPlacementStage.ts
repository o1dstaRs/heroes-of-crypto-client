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

/** START_FIGHT is the split Setup lock only; Board/legacy placement uses the ordinary placement-ready action. */
export const rankedPlacementLockActionType = (
    snapshot: Pick<RankedPlacementStage, "placementSplit" | "placementStage">,
): PlayActionTypeValue =>
    snapshot.placementSplit && snapshot.placementStage === 0
        ? PlayActionType.START_FIGHT
        : PlayActionType.READY_PLACEMENT;
