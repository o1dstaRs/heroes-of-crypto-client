import { expect, test } from "bun:test";
import { createCombatSoundPlayer, resolveCombatSound } from "./combatSounds";
import manifest from "./combatSoundManifest.json";

test("movement recordings are limited to the selected horses and spiders", () => {
    expect(
        Object.keys(manifest)
            .filter((name) => resolveCombatSound(name, "move"))
            .sort(),
    ).toEqual(["Arachna Queen", "Arachna Spider", "Champion", "Nightmare", "Unicorn"]);
    expect(resolveCombatSound("Champion", "move", true)?.webm).toContain("champion_move.webm");
    expect(resolveCombatSound("Arachna Queen", "move")?.webm).toContain("arachna-queen_move.webm");
    expect(resolveCombatSound("Arachna Spider", "move")?.webm).toContain("arachna-spider_move.webm");
    expect(resolveCombatSound("Skeleton", "move")).toBeUndefined();
});

const setup = () => {
    let finish!: (buffer: unknown) => void;
    const state = { now: 0, gain: 1, available: true, alive: true, loads: 0, starts: 0, stops: 0 };
    const player = createCombatSoundPlayer({
        load: () => {
            state.loads++;
            return new Promise((resolve) => {
                finish = resolve;
            });
        },
        start: (_buffer, options) => {
            expect(options).toEqual({ loop: true, gain: 0.65 });
            state.starts++;
            return () => {
                state.stops++;
            };
        },
        now: () => state.now,
        gain: () => state.gain,
        available: () => state.available,
    });
    return { player, state, finish: () => finish({}) };
};

test.each(["arrival", "scene", "muted", "late", "unavailable", "dead"])(
    "movement decoding cannot start after %s",
    async (reason) => {
        const { player, state, finish } = setup();
        const stop = player.loop("Unicorn", "moving", () => state.alive);
        if (reason === "arrival") stop();
        if (reason === "scene") player.stop();
        if (reason === "muted") state.gain = 0;
        if (reason === "late") state.now = 151;
        if (reason === "unavailable") state.available = false;
        if (reason === "dead") state.alive = false;
        finish();
        await Promise.resolve();
        expect(state.starts).toBe(0);
    },
);

test("replacing a pending movement reuses its decode and stale handles cannot stop the new loop", async () => {
    const { player, state, finish } = setup();
    const oldStop = player.loop("Champion", "same-unit");
    const currentStop = player.loop("Champion", "same-unit");
    finish();
    await Promise.resolve();
    expect(state.loads).toBe(1);
    expect(state.starts).toBe(1);
    oldStop();
    expect(state.stops).toBe(0);
    currentStop();
    currentStop();
    expect(state.stops).toBe(1);
});

test("scene teardown or mute stops active movement loops exactly once", async () => {
    const { player, state, finish } = setup();
    const stop = player.loop("Nightmare", "moving");
    finish();
    await Promise.resolve();
    expect(state.starts).toBe(1);
    player.stop();
    player.stop();
    stop();
    expect(state.stops).toBe(1);
});

test("empty movement slots and muted scenes do not fetch audio", () => {
    const { player, state } = setup();
    player.loop("White Tiger", "empty")();
    state.gain = 0;
    player.loop("Champion", "muted")();
    expect(state.loads).toBe(0);
});
