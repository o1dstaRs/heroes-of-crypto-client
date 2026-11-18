import { expect, test } from "bun:test";

import { PlayActionType } from "../api/play_protocol";
import { RankedActionQueue, submitRankedHeartbeat } from "./rankedActionQueue";

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
};
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

for (const [name, type] of [
    ["movement", PlayActionType.MOVE_UNIT],
    ["melee", PlayActionType.MELEE_ATTACK],
    ["ranged attack", PlayActionType.RANGE_ATTACK],
    ["spell", PlayActionType.CAST_SPELL],
] as const) {
    test(`${name} submits without waiting for an in-flight heartbeat`, async () => {
        const queue = new RankedActionQueue();
        const pingResponse = deferred<boolean>();
        const ping = queue.submit(() => pingResponse.promise, PlayActionType.PING);
        let sent = false;
        const action = queue.submit(async () => {
            sent = true;
            return true;
        }, type);
        await flush();
        expect(sent).toBe(true);
        expect(await action).toBe(true);
        pingResponse.resolve(true);
        expect(await ping).toBe(true);
    });
}

test("heartbeats run during an action while later gameplay still waits and reads the updated sequence", async () => {
    const queue = new RankedActionQueue();
    const firstResponse = deferred<void>();
    let sequence = 7;
    const envelopes: number[] = [];
    const first = queue.submit(async () => {
        envelopes.push(sequence);
        await firstResponse.promise;
        sequence = 8;
    }, PlayActionType.SELECT_ATTACK_TYPE);
    const second = queue.submit(async () => {
        envelopes.push(sequence);
        return true;
    }, PlayActionType.RANGE_ATTACK);
    await flush();
    let pingSent = false;
    const ping = queue.submit(async () => {
        pingSent = true;
        return true;
    }, PlayActionType.PING);
    await flush();
    expect(pingSent).toBe(true);
    expect(await ping).toBe(true);
    expect(envelopes).toEqual([7]);
    firstResponse.resolve();
    await first;
    expect(await second).toBe(true);
    expect(envelopes).toEqual([7, 8]);
});

test("failed heartbeats and rejected actions never strand later input", async () => {
    const queue = new RankedActionQueue();
    const pingResponse = deferred<boolean>();
    const ping = queue.submit(() => pingResponse.promise, PlayActionType.PING).catch(() => false);
    const rejected = queue
        .submit(async () => {
            throw new Error("network interrupted");
        })
        .catch(() => false);
    const next = queue.submit(async () => true, PlayActionType.CAST_SPELL);
    expect(await rejected).toBe(false);
    expect(await next).toBe(true);
    pingResponse.reject(new Error("keep-alive timed out"));
    expect(await ping).toBe(false);
});

test("heartbeat verdicts only update sequence knowledge and a network failure remains local to the keep-alive", async () => {
    const queue = new RankedActionQueue();
    const actionResponse = deferred<void>();
    let pendingTurn = true;
    let sequence = 8;
    const action = queue.submit(async () => {
        await actionResponse.promise;
        pendingTurn = false;
    });
    const remember = (value: number) => {
        sequence = Math.max(sequence, value);
    };
    const ping = (send: () => Promise<{ accepted: boolean; sequence: number }>) =>
        queue.submit(() => submitRankedHeartbeat(send, remember), PlayActionType.PING);
    expect(await ping(async () => ({ accepted: true, sequence: 7 }))).toBe(true);
    expect(sequence).toBe(8);
    expect(await ping(async () => ({ accepted: false, sequence: 9 }))).toBe(false);
    expect(sequence).toBe(9);
    expect(
        await ping(async () => {
            throw new Error("offline");
        }),
    ).toBe(false);
    expect(pendingTurn).toBe(true);
    actionResponse.resolve();
    await action;
    expect(pendingTurn).toBe(false);
});
