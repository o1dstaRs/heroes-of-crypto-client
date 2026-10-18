import { describe, expect, test } from "bun:test";

import { LiveAimSender, OpponentAimReceiver, type AimContext } from "./live_aim";
import {
    PlayAimKind,
    PlayEventKind,
    PlayPhase,
    type PlayAim,
    type PlayEvent,
    type PlaySnapshot,
} from "./play_protocol";

function fixture(blocked = false) {
    let now = 0;
    let nextId = 0;
    const timers = new Map<number, { at: number; callback: () => void }>();
    const sent: { aim: PlayAim; context: AimContext; at: number }[] = [];
    const completions: (() => void)[] = [];
    let context: AimContext | undefined = { unitId: "actor", playerId: "player", sequence: 10 };
    const sender = new LiveAimSender(
        () => context,
        (aim, ctx) => {
            sent.push({ aim, context: ctx, at: now });
            return blocked ? new Promise<void>((resolve) => completions.push(resolve)) : Promise.resolve();
        },
        {
            now: () => now,
            setTimeout: (callback, delay) => {
                const id = ++nextId;
                timers.set(id, { at: now + delay, callback });
                return id as unknown as ReturnType<typeof setTimeout>;
            },
            clearTimeout: (id) => {
                timers.delete(id as unknown as number);
            },
        },
    );
    const advance = async (ms: number) => {
        await Promise.resolve();
        await Promise.resolve();
        const end = now + ms;
        for (let count = 0; count < 10000; count++) {
            const timer = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
            if (!timer || timer[1].at > end) break;
            now = timer[1].at;
            timers.delete(timer[0]);
            timer[1].callback();
            await Promise.resolve();
            await Promise.resolve();
        }
        now = end;
        await Promise.resolve();
    };
    return {
        sender,
        sent,
        completions,
        timers,
        advance,
        setContext: (value?: AimContext) => {
            context = value;
        },
    };
}

const move = (x: number): PlayAim => ({ kind: PlayAimKind.MOVE, unitId: "actor", cell: { x, y: 4 } });

describe("live aim traffic", () => {
    test("idle scenes send nothing; a stable aim renews once per second", async () => {
        const f = fixture();
        f.sender.update(undefined);
        await f.advance(5000);
        expect(f.sent).toHaveLength(0);
        f.sender.update(move(3));
        await f.advance(74);
        expect(f.sent).toHaveLength(0);
        await f.advance(3001);
        expect(f.sent.map((entry) => entry.at)).toEqual([5075, 6075, 7075, 8075]);
        f.sender.dispose();
        expect(f.timers.size).toBe(0);
    });

    test("moving continuously cannot starve previews or exceed five sends per second", async () => {
        const f = fixture();
        for (let i = 0; i < 120; i++) {
            f.sender.update(move(i % 16));
            await f.advance(16);
        }
        expect(f.sent.length).toBeGreaterThanOrEqual(8);
        for (let i = 1; i < f.sent.length; i++) expect(f.sent[i].at - f.sent[i - 1].at).toBeGreaterThanOrEqual(200);
        f.sender.dispose();
    });

    test("border jitter and clears use the same rate limit and preserve the last target", async () => {
        const f = fixture();
        f.sender.update(move(2));
        await f.advance(100);
        for (let i = 0; i < 100; i++) {
            f.sender.update(i % 2 ? move(4) : undefined);
            await f.advance(10);
        }
        f.sender.update(move(7));
        await f.advance(250);
        expect(f.sent.length).toBeLessThanOrEqual(7);
        expect(f.sent.at(-1)?.aim).toEqual(move(7));
        for (let i = 1; i < f.sent.length; i++) expect(f.sent[i].at - f.sent[i - 1].at).toBeGreaterThanOrEqual(200);
        const clears = f.sent.filter((entry) => entry.aim.kind === PlayAimKind.CLEAR).length;
        f.sender.update(undefined);
        await f.advance(2000);
        expect(f.sent.at(-1)?.aim.kind).toBe(PlayAimKind.CLEAR);
        expect(f.sent.filter((entry) => entry.aim.kind === PlayAimKind.CLEAR)).toHaveLength(clears + 1);
        f.sender.dispose();
    });

    test("a slow connection has one request in flight and retains only the latest replacement", async () => {
        const f = fixture(true);
        f.sender.update(move(1));
        await f.advance(100);
        for (let i = 2; i <= 10; i++) {
            f.sender.update(move(i));
            await f.advance(100);
        }
        expect(f.sent).toHaveLength(1);
        f.completions.shift()!();
        await f.advance(100);
        expect(f.sent).toHaveLength(2);
        expect(f.sent[1].aim).toEqual(move(10));
        f.sender.dispose();
        f.completions.shift()!();
        await f.advance(2000);
        expect(f.sent).toHaveLength(2);
    });

    test("a context change drops queued hints, including a new action by the same unit", async () => {
        const f = fixture();
        f.sender.update(move(2));
        f.sender.reset();
        f.setContext({ unitId: "actor", playerId: "player", sequence: 11 });
        await f.advance(3000);
        expect(f.sent).toHaveLength(0);
        f.sender.update(move(6));
        await f.advance(100);
        expect(f.sent[0].context.sequence).toBe(11);
        f.setContext({ unitId: "next", playerId: "player", sequence: 12 });
        await f.advance(2000);
        expect(f.sent).toHaveLength(1);
        f.sender.dispose();
    });

    test("hiding the tab or losing the seat drops pending and renewal traffic", async () => {
        const f = fixture();
        f.sender.update(move(3));
        await f.advance(100);
        f.setContext(undefined);
        await f.advance(4000);
        expect(f.sent).toHaveLength(1);
        expect(f.timers.size).toBe(0);
        f.sender.dispose();
    });

    test("all modes and cancellations replace one another in the same channel", async () => {
        const f = fixture();
        for (const kind of Object.values(PlayAimKind)) {
            f.sender.update({ ...move(5), kind, spellName: kind === PlayAimKind.SPELL ? "Fire Wall" : undefined });
            await f.advance(250);
        }
        expect(f.sent.map((entry) => entry.aim.kind)).toEqual([2, 3, 4, 5]);
        f.sender.dispose();
    });
});

const snapshot = { phase: PlayPhase.PLAY, currentUnitId: "actor", latestSequence: 10 } as PlaySnapshot;
const event = (overrides: Partial<PlayEvent> = {}): PlayEvent => ({
    kind: PlayEventKind.MOVE_INTENT,
    sequence: 10,
    gameId: "game",
    playerId: "player",
    serverTimeMs: 100,
    rejectionReason: "",
    message: "",
    intent: {
        unitId: "actor",
        active: true,
        aimKind: PlayAimKind.RANGED,
        intentSequence: 1,
        aimCell: { x: 5, y: 4 },
        targetSide: 4,
        leaseMs: 1800,
    },
    ...overrides,
});

describe("opponent aim freshness", () => {
    test("a received lease accounts for transport age", () => {
        expect(new OpponentAimReceiver().read(event(), snapshot, 5000, 300)).toMatchObject({
            kind: PlayAimKind.RANGED,
            cell: { x: 5, y: 4 },
            targetSide: 4,
            expiresAt: 6500,
        });
    });

    test("duplicates, reordered packets, and expired leases cannot revive a cleared preview", () => {
        const receiver = new OpponentAimReceiver();
        const packet = event();
        expect(receiver.read(packet, snapshot, 0)).toBeDefined();
        expect(receiver.read(packet, snapshot, 1)).toBeUndefined();
        const clear = event({ intent: { ...packet.intent!, aimKind: PlayAimKind.CLEAR, intentSequence: 3 } });
        expect(receiver.read(clear, snapshot, 2)?.kind).toBe(PlayAimKind.CLEAR);
        expect(receiver.read(event({ intent: { ...packet.intent!, intentSequence: 2 } }), snapshot, 3)).toBeUndefined();
        expect(
            receiver.read(event({ intent: { ...packet.intent!, intentSequence: 4 } }), snapshot, 4, 1800),
        ).toBeUndefined();
    });

    for (const invalid of [
        { currentUnitId: "next" },
        { latestSequence: 11 },
        { latestSequence: 9 },
        { phase: PlayPhase.PLACEMENT },
        { fightFinished: true },
    ])
        test(`ignores an incompatible board ${JSON.stringify(invalid)}`, () => {
            expect(new OpponentAimReceiver().read(event(), { ...snapshot, ...invalid }, 0)).toBeUndefined();
        });

    test("fresh board contexts accept a reset ordering counter", () => {
        const receiver = new OpponentAimReceiver();
        receiver.read(event({ intent: { ...event().intent!, intentSequence: 99 } }), snapshot, 0);
        expect(receiver.read(event({ sequence: 11 }), { ...snapshot, latestSequence: 11 }, 1)).toBeDefined();
    });
});
