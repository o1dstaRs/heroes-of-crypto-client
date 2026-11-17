import { TeamVals, type TeamType } from "@heroesofcrypto/common";
import type { PlaySnapshot } from "../../api/play_protocol";
import type { PremiumDraftState } from "./premiumDraftAssessment";

/** Reuse the planner through setup with only this player's authorized snapshot. */
export function premiumSetupDraft(snapshot: PlaySnapshot, team: TeamType): PremiumDraftState {
    const left = team === TeamVals.LEFT;
    const own = snapshot.units.filter((unit) => unit.team === team && !unit.dead && unit.creatureId > 0);
    const hideEnemy =
        snapshot.placementSplit && snapshot.placementStage === 0 && snapshot.hideOpponentRosterDuringSetup;
    const amounts: Record<number, number> = {};
    for (const unit of own) amounts[unit.creatureId] = (amounts[unit.creatureId] ?? 0) + unit.amountAlive;
    const augments = [
        { kind: "Placement", value: (left ? snapshot.leftAugmentPlacement : snapshot.rightAugmentPlacement) ?? 0 },
        { kind: "Armor", value: (left ? snapshot.leftAugmentArmor : snapshot.rightAugmentArmor) ?? 0 },
        { kind: "Might", value: (left ? snapshot.leftAugmentMight : snapshot.rightAugmentMight) ?? 0 },
        { kind: "Empower", value: (left ? snapshot.leftAugmentEmpower : snapshot.rightAugmentEmpower) ?? 0 },
        { kind: "Sniper", value: (left ? snapshot.leftAugmentSniper : snapshot.rightAugmentSniper) ?? 0 },
        { kind: "Movement", value: (left ? snapshot.leftAugmentMovement : snapshot.rightAugmentMovement) ?? 0 },
    ];
    return {
        gameId: snapshot.gameId,
        doctrine: (left ? snapshot.leftDoctrine : snapshot.rightDoctrine) ?? 0,
        revealedMap: snapshot.gridType,
        picked: own.map((unit) => unit.creatureId),
        opponentPicked: hideEnemy
            ? []
            : snapshot.units.filter((unit) => unit.team !== team && !unit.dead).map((unit) => unit.creatureId),
        artifactTier1: (left ? snapshot.leftArtifactTier1 : snapshot.rightArtifactTier1) ?? 0,
        artifactTier2: (left ? snapshot.leftArtifactTier2 : snapshot.rightArtifactTier2) ?? 0,
        isYourTurn: false,
        setup: { placement: augments[0].value, augments, amounts },
    };
}
