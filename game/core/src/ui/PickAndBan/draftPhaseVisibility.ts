import { PickPhaseVals } from "@heroesofcrypto/common";

/** Final augment phases are zero-second route handoffs whose opponent rail is caller-configurable. */
export const isAugmentHandoffPhase = (phase: number): boolean =>
    phase === PickPhaseVals.AUGMENTS || phase === PickPhaseVals.AUGMENTS_SCOUT;

/**
 * The reusable draft view remains public by default. Ranked/private games opt out explicitly so their
 * zero-second augment handoff cannot briefly reveal the opponent roster before private Setup opens.
 */
export const shouldShowOpponentDraftRail = (phase: number, showOpponentRosterDuringAugmentHandoff = true): boolean =>
    showOpponentRosterDuringAugmentHandoff || !isAugmentHandoffPhase(phase);
