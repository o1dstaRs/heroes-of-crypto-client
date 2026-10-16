import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import creatures from "../../../../heroes-of-crypto-common/src/configuration/creatures.json";
import { createCombatSoundPlayer, resolveCombatSound } from "./combatSounds";
import manifest from "./combatSoundManifest.json";
import provenance from "../../../audio/combat-sound-provenance.json";

const setup = () => {
    const state = { now: 100, gain: 0.5, available: true, loads: 0, starts: 0 };
    const player = createCombatSoundPlayer({
        now: () => state.now,
        gain: () => state.gain,
        available: () => state.available,
        load: async () => {
            state.loads += 1;
            return {};
        },
        start: () => {
            state.starts += 1;
        },
    });
    return { player, state };
};

describe("combat sounds", () => {
    test("covers the full engine roster with both sound roles and safe asset names", () => {
        const names = Object.values(creatures).flatMap((faction) =>
            typeof faction === "object" ? Object.keys(faction) : [],
        );
        expect(names.length).toBeGreaterThan(50);
        for (const name of names) {
            for (const role of ["attack", "hurt"] as const) {
                const source = resolveCombatSound(name, role);
                expect(source).toBeDefined();
                expect(source!.webm).toMatch(/^\/audio\/combat\/[a-z-]+_(attack|hurt)\.webm\?v=[a-z0-9]+$/);
                expect(source!.durationMs).toBeGreaterThan(70);
                expect(source!.durationMs).toBeLessThanOrEqual(1600);
            }
        }
        expect(resolveCombatSound("Unknown", "attack")).toBeUndefined();
        expect(resolveCombatSound("__proto__", "attack")).toBeUndefined();
    });

    test("uses weapon swings for a bow creature's melee attacks and its own hurt reaction", () => {
        expect(resolveCombatSound("Elf", "attack", true)?.webm).toContain("squire_attack");
        expect(resolveCombatSound("Elf", "attack")?.webm).toContain("elf_attack");
        expect(resolveCombatSound("Elf", "hurt", true)?.webm).toContain("elf_hurt");
    });

    test("ships both valid containers for every clip within the measured loudness and size budget", () => {
        expect(provenance.clips).toHaveLength(Object.keys(manifest).length * 2);
        for (const clip of provenance.clips) {
            const webm = readFileSync(
                new URL(`../../../public/audio/combat/${clip.slug}_${clip.role}.webm`, import.meta.url),
            );
            const mp3 = readFileSync(
                new URL(`../../../public/audio/combat/${clip.slug}_${clip.role}.mp3`, import.meta.url),
            );
            expect([...webm.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
            expect(mp3.subarray(0, 3).toString()).toBe("ID3");
            for (const [codec, bytes] of [
                ["webm", webm],
                ["mp3", mp3],
            ] as const) {
                const measured = clip.encoded[codec];
                expect(bytes.length).toBe(measured.bytes);
                expect(bytes.length).toBeLessThanOrEqual(32768);
                expect(bytes.length).toBeGreaterThan(500);
                expect(Math.abs(measured.lufs + 20)).toBeLessThanOrEqual(0.75);
                expect(measured.true_peak_db).toBeLessThanOrEqual(-3);
                expect(measured.duration_ms).toBeLessThanOrEqual(1600);
            }
            const revision = new Bun.CryptoHasher("sha256").update(webm).update(mp3).digest("hex").slice(0, 10);
            const source = resolveCombatSound(clip.unit, clip.role as "attack" | "hurt");
            expect(source?.webm).toEndWith(`?v=${revision}`);
        }
    });

    test("loads once, suppresses duplicate contact reports, and keeps double strikes distinct", async () => {
        const { player, state } = setup();
        expect(await player.play("Wolf", "attack", "a")).toBe(true);
        expect(await player.play("Wolf", "attack", "a")).toBe(false);
        state.now += 220;
        expect(await player.play("Wolf", "attack", "a")).toBe(true);
        expect(state.loads).toBe(1);
        expect(state.starts).toBe(2);
        expect(await player.play("Wolf", "hurt", "a")).toBe(true);
        expect(state.loads).toBe(2);
    });

    test("muted, unavailable, unknown, and retired scenes do not load anything", async () => {
        const { player, state } = setup();
        state.gain = 0;
        player.preload(["Wolf"]);
        expect(await player.play("Wolf", "hurt", "a")).toBe(false);
        state.gain = 1;
        state.available = false;
        expect(await player.play("Wolf", "hurt", "a")).toBe(false);
        state.available = true;
        expect(await player.play("Unknown", "hurt", "a")).toBe(false);
        expect(await player.play("Wolf", "hurt", "a", false, () => false)).toBe(false);
        expect(state.loads).toBe(0);
    });

    test("drops a cold sound that would arrive late or after muting/scene teardown", async () => {
        for (const reason of ["late", "mute", "scene"] as const) {
            let finish!: (value: unknown) => void;
            let alive = true,
                now = 0,
                gain = 1,
                starts = 0;
            const player = createCombatSoundPlayer({
                now: () => now,
                gain: () => gain,
                available: () => true,
                load: () =>
                    new Promise((resolve) => {
                        finish = resolve;
                    }),
                start: () => {
                    starts += 1;
                },
            });
            const pending = player.play("Wolf", "hurt", "a", false, () => alive);
            if (reason === "late") now = 151;
            if (reason === "mute") gain = 0;
            if (reason === "scene") alive = false;
            finish({});
            expect(await pending).toBe(false);
            expect(starts).toBe(0);
        }
    });

    test("a failed download stays quiet and can recover on a later strike", async () => {
        let attempts = 0;
        const { state } = setup();
        const player = createCombatSoundPlayer({
            now: () => state.now,
            gain: () => 1,
            available: () => true,
            load: async () => {
                if (++attempts === 1) throw new Error("offline");
                return {};
            },
            start: () => {
                state.starts += 1;
            },
        });
        expect(await player.play("Wolf", "attack", "a")).toBe(false);
        state.now += 500;
        expect(await player.play("Wolf", "attack", "a")).toBe(true);
        expect(attempts).toBe(2);
    });

    test("stopping the battle cancels pending audio even if decoding finishes immediately", async () => {
        let finish!: (value: unknown) => void;
        let starts = 0;
        const player = createCombatSoundPlayer({
            now: () => 0,
            gain: () => 1,
            available: () => true,
            load: () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
            start: () => {
                starts += 1;
            },
        });
        const pending = player.play("Wolf", "attack", "a");
        player.stop();
        finish({});
        expect(await pending).toBe(false);
        expect(starts).toBe(0);
    });
});
