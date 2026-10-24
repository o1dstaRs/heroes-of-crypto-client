import { expect, test } from "bun:test";
import { Sandbox } from "./Sandbox";
import { OneInTheFieldTriggers } from "./sandbox/OneInTheFieldTriggers";
import { PETRIFYING_GAZE_DURATION_MS } from "./sandbox/PetrifyingGazePops";
import { CombatVisuals } from "./sandbox/CombatVisuals";

const flush = async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
};
test.each([false, true])(
    "gaze waits for contact and first reaction, shows isolated damage once, lethal=%s",
    async (lethal) => {
        const log: string[] = [];
        const unit = (id: string) => ({
            getId: () => id,
            getName: () => "Orc",
            hasAbilityActive: () => false,
            isDead: () => lethal && id === "B",
            isPlayingOneShotAnimation: () => false,
            getAnimationTextureKey: () => undefined,
            getVisualCenter: () => ({ x: id === "A" ? 0 : 100, y: 0 }),
            getDamagePredictionAnchor: () => ({ x: 100, y: 100 }),
            presentDamageCasualties: (n: number) => log.push(`loss:${n}`),
        });
        const a = unit("A"),
            b = unit("B");
        let contact!: () => void, land!: () => void, reveal!: () => void, firstHit!: () => void;
        let hits = 0;
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            oneInTheFieldTriggers: new OneInTheFieldTriggers(),
            sc_sceneSettings: { getGridSettings: () => ({}) },
            unitsHolder: {
                getAllUnits: () =>
                    new Map([
                        ["A", a],
                        ["B", b],
                    ]),
            },
            isSceneDestroyed: () => false,
            prepareDirectionalAttackState: () => "attack",
            offsetReplayDamagePosition: (p: unknown) => p,
            delayReplay: (duration: number) =>
                new Promise<void>((resolve) => {
                    expect(duration).toBe(PETRIFYING_GAZE_DURATION_MS);
                    expect(duration).toBe(650);
                    reveal = resolve;
                }),
            combatVisuals: {
                showFloatingDamage: (
                    _p: unknown,
                    n: number,
                    _d: unknown,
                    _k: unknown,
                    _f: unknown,
                    _s: unknown,
                    anchor: unknown,
                ) => {
                    if (n === 45) expect(anchor).toEqual(b.getDamagePredictionAnchor());
                    log.push(`damage:${n}`);
                },
                spawnPetrifyingGazePop: () => {
                    log.push("gaze");
                    return Promise.resolve(() => log.push("finish-primary-numbers"));
                },
            },
            playReplayOneShot: (_unit: unknown, state: string) => {
                log.push(state);
                if (state === "hit" && ++hits === 1)
                    return new Promise<void>((resolve) => {
                        firstHit = resolve;
                    });
                return Promise.resolve();
            },
            playReplayProjectile: (_a: unknown, _b: unknown, _p: unknown, impact: () => void) => {
                contact = impact;
                return new Promise<void>((resolve) => {
                    land = resolve;
                });
            },
        });
        const entry = { source: "petrifying_gaze", unitId: "B", position: { x: 100, y: 0 }, amount: 45, unitsDied: 1 };
        const pending = scene.playCombatExchange(
            a,
            b,
            { attackType: "range", damage: { secondary: [entry] } },
            [{ attackerId: "A", targetId: "B", response: false, hitIndex: 0, lethal, amount: 120, unitsDied: 2 }],
            () => log.push("death"),
        );
        await flush();
        expect(log).not.toContain("gaze");
        contact();
        await flush();
        expect(log.filter((s) => s === "gaze" || s.startsWith("damage"))).toEqual(["damage:120", "gaze"]);
        expect(log).not.toContain("death");
        // Exercise either completion order: neither reaction nor head may be interrupted.
        if (lethal) reveal();
        else firstHit();
        await flush();
        expect(log).not.toContain("damage:45");
        if (lethal) firstHit();
        else reveal();
        land();
        await pending;
        expect(log.filter((s) => s.startsWith("damage"))).toEqual(["damage:120", "damage:45"]);
        expect(log.filter((s) => s === "hit")).toHaveLength(lethal ? 1 : 2);
        expect(log).toContain("finish-primary-numbers");
        expect(log.indexOf("finish-primary-numbers")).toBeLessThan(log.indexOf("damage:45"));
        if (lethal) expect(log.indexOf("death")).toBeGreaterThan(log.indexOf("damage:45"));
        // Replay/ranked fallback sees the same authoritative entry and must not duplicate the number.
        await scene.presentPetrifyingGaze(entry, { x: 0, y: 0 }, b);
        expect(log.filter((s) => s === "damage:45")).toHaveLength(1);
    },
);

test("cancelled scene cannot show the delayed gaze hit", async () => {
    let finish!: () => void;
    let destroyed = false;
    const log: string[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => ({}) },
        combatVisuals: { spawnPetrifyingGazePop: async () => {}, showFloatingDamage: () => log.push("damage") },
        delayReplay: () =>
            new Promise<void>((resolve) => {
                finish = resolve;
            }),
        isSceneDestroyed: () => destroyed,
    });
    const pending = scene.presentPetrifyingGaze(
        { source: "petrifying_gaze", amount: 12, unitsDied: 1 },
        { x: 0, y: 0 },
        { getVisualCenter: () => ({ x: 1, y: 1 }) },
    );
    await flush();
    destroyed = true;
    finish();
    await pending;
    expect(log).toEqual([]);
});

test("gaze uses the luck flag anchor and removes its head before the secondary damage", async () => {
    const flag = { x: 120, y: 230 };
    let follow!: () => { x: number; y: number };
    const finished: string[] = [];
    const visuals = Object.assign(Object.create(CombatVisuals.prototype), {
        context: { getGridSettings: () => ({ getCellSize: () => 128 }) },
        floatingTexts: [],
        petrifyingGazePops: {
            spawn: async (_id: string, _cell: number, getAnchor: typeof follow) => {
                follow = getAnchor;
            },
            finish: (id: string) => finished.push(id),
        },
    });
    const finish = await visuals.spawnPetrifyingGazePop({
        getId: () => "victim",
        getFlagEffectAnchor: () => flag,
        getDamagePredictionAnchor: () => ({ x: 130, y: 900 }),
    });
    expect(follow()).toEqual(flag);
    flag.y = 260;
    expect(follow()).toEqual({ x: 120, y: 260 });
    expect(finished).toEqual([]);
    finish();
    expect(finished).toEqual(["victim"]);
});
