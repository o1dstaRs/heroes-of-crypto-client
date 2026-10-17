import { describe, expect, mock, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";

import { RankedPlayScene } from "./RankedPlayScene";
import { Sandbox } from "./Sandbox";

type Blast = Extract<GameEvent, { type: "pyre_exploded" }>;
const blast = (unitId: string, victims: string[] = []): Blast => ({
    type: "pyre_exploded",
    unitId,
    position: { x: 10, y: 20 },
    hits: victims.map((id) => ({ unitId: id, position: { x: 20, y: 20 }, amount: 30, unitsDied: 1 })),
});
const unit = (id: string) => ({
    getId: () => id,
    hasAnimationState: mock(() => true),
    playOneShotAnimation: mock(),
    destroyVisuals: mock(),
});
type Body = ReturnType<typeof unit>;
type Scene = {
    preparePyreDeaths(events: GameEvent[], units: Map<string, Body>): void;
    playCustomDeathAnimation(body: Body): boolean;
    renderNewlyAppliedPyre(snapshot: unknown): void;
    shatterNewlyDeadUnits(snapshot: unknown): void;
    pyreDeaths: { forget(id: string): void };
};
const fixture = (bodies: Body[], ranked = false) => {
    const units = new Map(bodies.map((body) => [body.getId(), body]));
    const bursts: { event: Blast; delay: number; removeBody: () => void }[] = [];
    const retained = new Set();
    const scene = Object.assign(Object.create(ranked ? RankedPlayScene.prototype : Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => units },
        dyingVisualUnits: retained,
        pyreVfxGameId: "fight",
        pyreVfxSequence: 0,
        renderPyreExplosion: (event: Blast, delay: number, removeBody: () => void) =>
            bursts.push({ event, delay, removeBody }),
    }) as Scene;
    return { scene, bursts, units, retained };
};

describe("Last Fuse owns the death animation", () => {
    test.each([false, true])("the lethal impact replaces an authored death, ranked=%s", (ranked) => {
        const body = unit("victim");
        const { scene, bursts, units, retained } = fixture([body], ranked);
        scene.preparePyreDeaths([blast("victim")], units);
        expect(bursts).toHaveLength(0);
        expect(scene.playCustomDeathAnimation(body)).toBe(true);
        expect(bursts.map(({ event, delay }) => [event.unitId, delay])).toEqual([["victim", 0]]);
        expect(body.hasAnimationState).not.toHaveBeenCalled();
        expect(body.playOneShotAnimation).not.toHaveBeenCalled();
        expect(body.destroyVisuals).not.toHaveBeenCalled();
        expect(retained.has(body)).toBe(true);
        bursts[0].removeBody();
        expect(body.destroyVisuals).toHaveBeenCalledTimes(1);
        expect(retained.has(body)).toBe(false);
        scene.playCustomDeathAnimation(body);
        expect(bursts).toHaveLength(1);
        expect(body.playOneShotAnimation).not.toHaveBeenCalled();
    });

    test("chain casualties disappear with their own explosions, before later event cleanup", () => {
        const bodies = [unit("root"), unit("chain"), unit("last"), unit("second-shot")];
        const { scene, bursts, units } = fixture(bodies);
        const events = [blast("root", ["chain"]), blast("chain", ["last"]), blast("last"), blast("second-shot")];
        scene.preparePyreDeaths(events, units);
        scene.playCustomDeathAnimation(bodies[0]);
        expect(bursts.map(({ event, delay }) => [event.unitId, delay])).toEqual([
            ["root", 0],
            ["chain", 0.18],
            ["last", 0.36],
        ]);
        bursts[0].removeBody();
        expect(bodies[0].destroyVisuals).toHaveBeenCalledTimes(1);
        expect(bodies[1].destroyVisuals).not.toHaveBeenCalled();
        bursts[1].removeBody();
        expect(bodies[1].destroyVisuals).toHaveBeenCalledTimes(1);
        expect(bodies[2].destroyVisuals).not.toHaveBeenCalled();
        bursts[2].removeBody();
        scene.preparePyreDeaths(events, units);
        for (const body of bodies.slice(0, 3)) scene.playCustomDeathAnimation(body);
        expect(bursts).toHaveLength(3);
        expect(bodies.every((body) => body.playOneShotAnimation.mock.calls.length === 0)).toBe(true);
        scene.playCustomDeathAnimation(bodies[3]);
        expect(bursts[3].event.unitId).toBe("second-shot");
        expect(bursts[3].delay).toBe(0);
    });

    test("ranked polling cannot start the normal death or repeat an impact's explosion", () => {
        const body = unit("victim");
        const { scene, bursts, units } = fixture([body], true);
        const events = [blast("victim")];
        const snapshot = {
            gameId: "fight",
            latestSequence: 1,
            fightStarted: true,
            units: [],
            journalTail: [{ sequence: 1, eventsJson: JSON.stringify(events) }],
        };
        scene.preparePyreDeaths(events, units);
        scene.shatterNewlyDeadUnits(snapshot);
        expect(bursts).toHaveLength(0);
        expect(body.hasAnimationState).not.toHaveBeenCalled();
        scene.playCustomDeathAnimation(body);
        bursts[0].removeBody();
        scene.renderNewlyAppliedPyre(snapshot);
        scene.renderNewlyAppliedPyre(snapshot);
        expect(bursts).toHaveLength(1);
        expect(body.playOneShotAnimation).not.toHaveBeenCalled();
    });

    test("a resurrected stack can explode again and an old callback cannot remove it", () => {
        const body = unit("victim");
        const { scene, bursts, units } = fixture([body]);
        scene.preparePyreDeaths([blast("victim")], units);
        scene.playCustomDeathAnimation(body);
        scene.pyreDeaths.forget("victim");
        body.destroyVisuals.mockClear();
        bursts[0].removeBody();
        expect(body.destroyVisuals).not.toHaveBeenCalled();
        scene.preparePyreDeaths([blast("victim")], units);
        scene.playCustomDeathAnimation(body);
        expect(bursts).toHaveLength(2);
        bursts[1].removeBody();
        expect(body.destroyVisuals).toHaveBeenCalledTimes(1);
    });
});
