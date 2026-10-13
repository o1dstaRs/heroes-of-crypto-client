import { expect, test } from "bun:test";

import { decodePlaySnapshot, PlayPhase } from "../../api/play_protocol";
import type { PremiumAdvice, PremiumTurnPreview } from "../../api/premium_client";
import { startPremiumTurnPreview } from "./premiumTurnRequest";

const snapshot = {
    ...decodePlaySnapshot(new Uint8Array()),
    gameId: "game",
    phase: PlayPhase.PLAY,
    latestSequence: 7,
    currentLap: 2,
    currentUnitId: "actor",
};
const advice: PremiumAdvice = {
    entitlement: { active: true, reason: "test" },
    revision: "7",
    stage: "fight",
    turn: {
        sequence: 7,
        lap: 2,
        unitId: "actor",
        status: "ready",
        options: [{ id: "wait", label: "Wait", reasons: [], actions: [{ type: "wait_turn", unitId: "actor" }] }],
    },
};
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

test("automatically loads once for the revision and clears the board when released", async () => {
    const published: (PremiumTurnPreview | undefined)[] = [];
    let calls = 0;
    const stop = startPremiumTurnPreview(
        snapshot,
        (turn) => published.push(turn),
        async () => {
            calls++;
            return advice;
        },
    );
    await flush();
    expect(calls).toBe(1);
    expect(published).toEqual([undefined, { ...advice.turn!, gameId: "game" }]);
    stop();
    expect(published.at(-1)).toBeUndefined();
});

test("an aborted slow response cannot repaint the next unit's board", async () => {
    const published: (PremiumTurnPreview | undefined)[] = [];
    let signal: AbortSignal | undefined;
    let resolve!: (advice: PremiumAdvice) => void;
    const stop = startPremiumTurnPreview(
        snapshot,
        (turn) => published.push(turn),
        (_gameId, requestSignal) => {
            signal = requestSignal;
            return new Promise((done) => {
                resolve = done;
            });
        },
    );
    stop();
    resolve(advice);
    await flush();
    expect(signal?.aborted).toBe(true);
    expect(published.every((turn) => turn === undefined)).toBe(true);
});

test("advice for a stale revision or revoked entitlement cannot paint the board", async () => {
    for (const response of [
        { ...advice, turn: { ...advice.turn!, sequence: 6 } },
        { ...advice, entitlement: { active: false, reason: "expired" } },
    ]) {
        const published: (PremiumTurnPreview | undefined)[] = [];
        const stop = startPremiumTurnPreview(
            snapshot,
            (turn) => published.push(turn),
            () => Promise.resolve(response),
        );
        await flush();
        expect(published.every((turn) => turn === undefined)).toBe(true);
        stop();
    }
});
