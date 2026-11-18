import { describe, expect, test } from "bun:test";
import { validateFeatureArt } from "../../plugins/feature-art-editor.mjs";
import roster from "../data/feature-roster.json";
import initial from "../data/feature-art.json";
import { readFileSync } from "node:fs";
import { featureSpellImage } from "./feature-art";
describe("local feature artwork configuration", () => {
    test("accepts four faction selections and bounded transforms", () => {
        expect(validateFeatureArt(initial, roster)).toEqual(initial);
    });
    test("every accepted spell selection resolves to bundled artwork, including Original", () => {
        for (let spellVariant = 0; spellVariant <= 6; spellVariant++) {
            const config = validateFeatureArt({ ...initial, spellVariant }, roster);
            const path = featureSpellImage(config.spellVariant);
            const bytes = readFileSync(new URL(`../../public${path}`, import.meta.url));
            expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
            expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
        }
    });
    test("rejects foreign creatures, extra slots, invalid variants and transforms", () => {
        const bad = [
            (c: any) => (c.slots[0].creature = "angel"),
            (c: any) => c.slots.push(c.slots[0]),
            (c: any) => (c.slots[0].x = Infinity),
            (c: any) => (c.slots[0].y = -151),
            (c: any) => (c.slots[0].scale = 0),
            (c: any) => (c.slots[0].flip = "true"),
            (c: any) => (c.spellVariant = 7),
        ];
        for (const mutate of bad) {
            const c = structuredClone(initial);
            mutate(c);
            expect(() => validateFeatureArt(c, roster)).toThrow();
        }
    });
});
