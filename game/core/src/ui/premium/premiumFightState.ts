import { PlayPhase, type PlaySnapshot } from "../../api/play_protocol";
import type { PremiumAdvice, PremiumTurnAdvice } from "../../api/premium_client";

export const premiumFightTurnKey = (snapshot: PlaySnapshot): string =>
    `${snapshot.gameId}:${snapshot.phase}:${snapshot.latestSequence}:${snapshot.currentLap}:${snapshot.currentUnitId}`;

export const canSuggestPremiumTurn = (snapshot: PlaySnapshot, team: number): boolean =>
    snapshot.phase === PlayPhase.PLAY &&
    !snapshot.fightFinished &&
    snapshot.units.some((unit) => unit.id === snapshot.currentUnitId && unit.team === team && !unit.dead) &&
    !snapshot.players.some((player) => player.team === team && player.aiControlled);

export const currentPremiumTurn = (advice: PremiumAdvice, snapshot: PlaySnapshot): PremiumTurnAdvice | undefined => {
    const turn = advice.turn;
    return advice.entitlement.active &&
        advice.stage === "fight" &&
        turn?.sequence === snapshot.latestSequence &&
        turn.lap === snapshot.currentLap &&
        turn.unitId === snapshot.currentUnitId
        ? turn
        : undefined;
};
