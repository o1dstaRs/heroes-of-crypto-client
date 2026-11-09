import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import manifest from "./spellSoundManifest.json";
import provenance from "../../../audio/spell-sound-provenance.json";
import { resolveSpellSound } from "./spellSounds";

test("selected spell casts ship both measured codecs and current cache revisions", () => {
    for (const [name, entry] of Object.entries(manifest)) {
        const clip = provenance.clips.find((sound) => sound.unit === name)!;
        expect(clip.slug).toBe(entry.slug);
        expect(clip.source.sha256).toMatch(/^[a-f0-9]{64}$/);
        const webm = readFileSync(new URL(`../../../public/audio/spells/${entry.slug}.webm`, import.meta.url));
        const mp3 = readFileSync(new URL(`../../../public/audio/spells/${entry.slug}.mp3`, import.meta.url));
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
            expect(measured.duration_ms).toBeLessThanOrEqual(2500);
            expect(measured.leading_quiet_ms).toBeLessThanOrEqual(25);
            expect(measured.trailing_quiet_ms).toBeLessThanOrEqual(65);
        }
        const revision = new Bun.CryptoHasher("sha256").update(webm).update(mp3).digest("hex").slice(0, 10);
        expect(resolveSpellSound(name)).toEqual({
            key: `/audio/spells/${entry.slug}:${revision}`,
            webm: `/audio/spells/${entry.slug}.webm?v=${revision}`,
            mp3: `/audio/spells/${entry.slug}.mp3?v=${revision}`,
            durationMs: entry.durationMs,
        });
    }
});

test("Fireball and Fire Strike have distinct cues; unassigned spells use the caster fallback", () => {
    expect(resolveSpellSound("Fireball")).toBeDefined();
    expect(resolveSpellSound("Fire Strike")).toBeDefined();
    expect(resolveSpellSound("Fireball")!.key).not.toBe(resolveSpellSound("Fire Strike")!.key);
    expect(resolveSpellSound("Misfortune")).toBeUndefined();
    expect(resolveSpellSound("toString")).toBeUndefined();
});
