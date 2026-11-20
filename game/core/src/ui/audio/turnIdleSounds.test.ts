import { expect, test } from "bun:test";

import { createCombatSoundPlayer, resolveCombatSound, TURN_IDLE_GAIN } from "./combatSounds";
import manifest from "./combatSoundManifest.json";

test("idle loops exist only for the creatures given a selected idle recording", () => {
    expect(
        Object.keys(manifest)
            .filter((name) => resolveCombatSound(name, "idle"))
            .sort(),
    ).toEqual(["Behemoth", "Black Dragon", "Wolf Rider"]);
    expect(resolveCombatSound("Behemoth", "idle")?.webm).toContain("behemoth_idle.webm");
    expect(resolveCombatSound("Black Dragon", "idle")?.webm).toContain("black-dragon_idle.webm");
    expect(resolveCombatSound("Black Dragon", "idle")!.durationMs).toBeGreaterThan(4000);
    expect(resolveCombatSound("Peasant", "idle")).toBeUndefined();
});

const setup = () => {
    let finish!: (buffer: unknown) => void;
    const state = { now: 0, alive: true, starts: [] as unknown[], stops: 0, loaded: [] as string[] };
    const player = createCombatSoundPlayer({
        load: (source) => {
            state.loaded.push(source.key);
            return new Promise((resolve) => {
                finish = resolve;
            });
        },
        start: (_buffer, options) => {
            state.starts.push(options);
            return () => {
                state.stops++;
            };
        },
        now: () => state.now,
        gain: () => 1,
        available: () => true,
    });
    return { player, state, finish: () => finish({}) };
};

const idle = (player: ReturnType<typeof setup>["player"], alive: () => boolean) =>
    player.loop("Black Dragon", "dragon:idle", alive, "idle", TURN_IDLE_GAIN, Number.POSITIVE_INFINITY);

test("the idle loop plays the idle recording at half level, even after a slow first decode", async () => {
    const { player, state, finish } = setup();
    const stop = idle(player, () => state.alive);
    state.now = 2000; // a cold 6 s breathing file decodes slowly; the turn is still waiting
    finish();
    await Promise.resolve();
    expect(state.loaded[0]).toContain("black-dragon_idle");
    expect(state.starts).toEqual([{ loop: true, gain: TURN_IDLE_GAIN }]);
    stop();
    stop();
    expect(state.stops).toBe(1);
});

test("an idle loop whose turn ended before decoding never starts", async () => {
    const { player, state, finish } = setup();
    idle(player, () => state.alive);
    state.alive = false; // the creature acted or the turn passed
    finish();
    await Promise.resolve();
    expect(state.starts).toEqual([]);
});

test("idle and movement loops of one creature are separate voices", async () => {
    const { player, state, finish } = setup();
    idle(player, () => true);
    finish();
    await Promise.resolve();
    player.loop("Black Dragon", "dragon", () => true); // no movement sound: must not cut the idle loop
    expect(state.stops).toBe(0);
});
