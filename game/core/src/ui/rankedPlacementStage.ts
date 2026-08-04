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

/** The placement sidebar roster appears on Board, never behind the augment modal. */
export const shouldShowRankedPlacementRosters = (
    snapshot: RankedPlacementStage,
    augmentOverlayOpen: boolean,
): boolean =>
    snapshot.phase === PlayPhase.PLACEMENT &&
    !augmentOverlayOpen &&
    (!snapshot.placementSplit || snapshot.placementStage === 1);

/** START_FIGHT is the split Setup lock only; Board/legacy placement uses the ordinary placement-ready action. */
export const rankedPlacementLockActionType = (
    snapshot: Pick<RankedPlacementStage, "placementSplit" | "placementStage">,
): PlayActionTypeValue =>
    snapshot.placementSplit && snapshot.placementStage === 0
        ? PlayActionType.START_FIGHT
        : PlayActionType.READY_PLACEMENT;
