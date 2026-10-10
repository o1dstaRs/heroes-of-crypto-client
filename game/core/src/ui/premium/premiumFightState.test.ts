import { expect, test } from "bun:test";

import { decodePlaySnapshot, PlayPhase, type PlayUnitState } from "../../api/play_protocol";
import type { PremiumAdvice } from "../../api/premium_client";
import { canSuggestPremiumTurn, currentPremiumTurn, premiumFightTurnKey } from "./premiumFightState";

const snapshot = {
    ...decodePlaySnapshot(new Uint8Array()),
    gameId: "fight",
    phase: PlayPhase.PLAY,
    fightStarted: true,
    currentUnitId: "active",
    latestSequence: 8,
    currentLap: 2,
    units: [{ id: "active", team: 2, dead: false } as PlayUnitState],
    players: [{ playerId: "player", team: 2, connected: true, aiControlled: false, lastSeenMs: 0 }],
};
const advice: PremiumAdvice = {
    entitlement: { active: true, reason: "premium" },
    revision: "revision",
    stage: "fight",
    turn: { sequence: 8, lap: 2, unitId: "active", status: "ready", options: [] },
};

test("fight suggestions require the player's live, human-controlled turn", () => {
    expect(canSuggestPremiumTurn(snapshot, 2)).toBe(true);
    expect(canSuggestPremiumTurn(snapshot, 1)).toBe(false);
    expect(canSuggestPremiumTurn({ ...snapshot, phase: PlayPhase.PLACEMENT }, 2)).toBe(false);
    expect(canSuggestPremiumTurn({ ...snapshot, fightFinished: true }, 2)).toBe(false);
    expect(canSuggestPremiumTurn({ ...snapshot, units: [{ ...snapshot.units[0], dead: true }] }, 2)).toBe(false);
    expect(canSuggestPremiumTurn({ ...snapshot, players: [{ ...snapshot.players[0], aiControlled: true }] }, 2)).toBe(
        false,
    );
});

test("late advice cannot survive a move, repeated activation, changed unit, or revoked entitlement", () => {
    expect(currentPremiumTurn(advice, snapshot)).toEqual(advice.turn);
    for (const next of [
        { ...snapshot, latestSequence: 9 },
        { ...snapshot, currentLap: 3 },
        { ...snapshot, currentUnitId: "next" },
    ]) {
        expect(currentPremiumTurn(advice, next)).toBeUndefined();
        expect(premiumFightTurnKey(next)).not.toBe(premiumFightTurnKey(snapshot));
    }
    expect(
        currentPremiumTurn({ ...advice, entitlement: { active: false, reason: "expired" } }, snapshot),
    ).toBeUndefined();
    expect(currentPremiumTurn({ ...advice, turn: undefined }, snapshot)).toBeUndefined();
    expect(premiumFightTurnKey({ ...snapshot, gameId: "another" })).not.toBe(premiumFightTurnKey(snapshot));
});
