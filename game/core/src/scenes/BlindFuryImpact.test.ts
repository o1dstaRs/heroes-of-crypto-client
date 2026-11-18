import { expect, test } from "bun:test";
import { Sandbox } from "./Sandbox";
import { OneInTheFieldTriggers } from "./sandbox/OneInTheFieldTriggers";

const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
};

test.each(["melee", "range"])("Blind Fury %s follows each landed hit and counter at contact", async (attackType) => {
    for (const active of [true, false]) {
        for (const missed of [true, false]) {
            const pops: string[] = [];
            const flights: { contact: () => void; land: () => void }[] = [];
            const unit = (id: string) => ({
                getId: () => id,
                getName: () => "Orc",
                hasAbilityActive: (name: string) => active && name === "Blind Fury",
                isDead: () => false,
                isPlayingOneShotAnimation: () => false,
                getAnimationTextureKey: () => undefined,
                getVisualCenter: () => ({ x: id === "A" ? 0 : 100, y: 0 }),
                getDamagePredictionAnchor: () => ({ x: 0, y: 100 }),
            });
            const a = unit("A"),
                b = unit("B");
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
                offsetReplayDamagePosition: (to: unknown) => to,
                combatVisuals: {
                    showFloatingDamage() {},
                    prepareCommonFlagPop() {},
                    spawnCommonFlagPop: (victim: typeof a, kind: string) => {
                        if (kind === "blind_fury") pops.push(victim.getId());
                    },
                },
                showAttackMissedVfx() {},
                playReplayOneShot: () => Promise.resolve(),
                playReplayProjectile: (_a: unknown, _b: unknown, _p: unknown, onImpact: () => void) =>
                    new Promise<void>((resolve) => flights.push({ contact: onImpact, land: resolve })),
            });
            const strikes = [
                { attackerId: "A", targetId: "B", response: false, hitIndex: 0 },
                { attackerId: "B", targetId: "A", response: true, hitIndex: 0 },
                { attackerId: "A", targetId: "B", response: false, hitIndex: 1 },
            ].map((s) => ({ ...s, amount: missed ? 0 : 10, missed, lethal: false, unitsDied: 0 }));
            const pending = scene.playCombatExchange(a, b, { attackType }, strikes, () => {});
            await flush();
            if (attackType === "range") {
                expect(pops).toEqual([]);
                for (let i = 0; i < 6; i++) {
                    for (const f of flights.splice(0)) {
                        f.contact();
                        f.contact(); // Duplicate arrival callbacks must not replay the passive.
                        f.land();
                    }
                    await flush();
                }
            }
            await pending;
            expect(pops).toEqual(active && !missed ? ["B", "A", "B"] : []);
        }
    }
});
