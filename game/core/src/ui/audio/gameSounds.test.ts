import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import manifest from "./gameSoundManifest.json";
import provenance from "../../../audio/game-sound-provenance.json";
import { resolveGameSound, type GameSoundName } from "./gameSounds";
import { createCombatSoundPlayer } from "./combatSounds";

test("provided effects ship both measured codecs with matching cache revisions", () => {
    expect(Object.keys(manifest).sort()).toEqual([
        "heal",
        "place_unit",
        "resurrection",
        "spellbook_close",
        "spellbook_open",
    ]);
    for (const name of Object.keys(manifest) as GameSoundName[]) {
        const clip = provenance.sounds.find((sound) => sound.id === name)!;
        expect(clip.source.kind).toBe("user-provided");
        expect(clip.source.sha256).toMatch(/^[a-f0-9]{64}$/);
        const webm = readFileSync(new URL(`../../../public/audio/events/${name}.webm`, import.meta.url));
        const mp3 = readFileSync(new URL(`../../../public/audio/events/${name}.mp3`, import.meta.url));
        expect([...webm.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
        expect(mp3.subarray(0, 3).toString()).toBe("ID3");
        for (const [codec, bytes] of [
            ["webm", webm],
            ["mp3", mp3],
        ] as const) {
            const measured = clip.encoded[codec];
            expect(bytes.length).toBe(measured.bytes);
            expect(bytes.length).toBeLessThanOrEqual(32768);
            expect(Math.abs(measured.lufs + 20)).toBeLessThanOrEqual(0.75);
            expect(measured.true_peak_db).toBeLessThanOrEqual(-3);
            expect(measured.duration_ms).toBeLessThanOrEqual(clip.max_duration_ms);
            expect(measured.leading_quiet_ms).toBeLessThanOrEqual(25);
            expect(measured.trailing_quiet_ms).toBeLessThanOrEqual(65);
        }
        const revision = new Bun.CryptoHasher("sha256").update(webm).update(mp3).digest("hex").slice(0, 10);
        expect(resolveGameSound(name).webm).toBe(`/audio/events/${name}.webm?v=${revision}`);
    }
});

test("game effects use the shared cache and coalesce a mass heal while keeping separate later heals", async () => {
    let now = 100,
        loads = 0,
        starts = 0,
        gain = 1;
    const player = createCombatSoundPlayer({
        load: async () => {
            loads++;
            return {};
        },
        start: () => {
            starts++;
        },
        now: () => now,
        gain: () => gain,
        available: () => true,
    });
    const heal = resolveGameSound("heal");
    player.preloadSources([heal]);
    expect(await player.playSource(heal, "heal-group", heal.key)).toBe(true);
    expect(await player.playSource(heal, "heal-group", heal.key)).toBe(false);
    now += 220;
    expect(await player.playSource(heal, "heal-group", heal.key)).toBe(true);
    expect(loads).toBe(1);
    expect(starts).toBe(2);
    gain = 0;
    expect(await player.playSource(resolveGameSound("resurrection"), "raise", "raise")).toBe(false);
    expect(loads).toBe(1);
});
