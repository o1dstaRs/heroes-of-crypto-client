import { describe, expect, test } from "bun:test";

import { images } from "../../generated/image_imports";
import { creatureImgSrc, imgSrc } from "./creatureImage";

const map = images as Record<string, string>;

// A unit's small-texture name is derived from its creature config, and the art set does not always hold that
// SIZE — griffin_256 and wandering_mage_128 have no image, their _512 does. The casualty chart used to drop a
// death marker whenever this lookup failed, so an army that was wiped out showed fewer markers than the
// creatures that actually fell (owner report 2026-09-18).
describe("creature portrait lookup", () => {
    test("an exact key wins", () => {
        expect(creatureImgSrc("peasant_512")).toBe(map.peasant_512);
        expect(imgSrc("peasant_512")).toBe(map.peasant_512);
    });

    test("a size the art set lacks falls back to a size it has", () => {
        expect(Object.hasOwn(map, "griffin_256")).toBe(false);
        expect(creatureImgSrc("griffin_256")).toBe(map.griffin_512);

        expect(Object.hasOwn(map, "wandering_mage_128")).toBe(false);
        expect(creatureImgSrc("wandering_mage_128")).toBe(map.wandering_mage_512);
    });

    test("every creature portrait the fight screens ask for resolves", () => {
        const unresolved = Object.keys(map)
            .filter((key) => /_(128|256|512)$/.test(key))
            .map((key) => key.replace(/_(128|256|512)$/, ""))
            .filter((base, index, all) => all.indexOf(base) === index)
            .filter((base) => !creatureImgSrc(`${base}_256`));
        expect(unresolved).toEqual([]);
    });

    test("no name and an unknown creature stay undefined — the caller still draws the marker", () => {
        expect(creatureImgSrc(undefined)).toBeUndefined();
        expect(creatureImgSrc("")).toBeUndefined();
        expect(creatureImgSrc("not_a_creature_512")).toBeUndefined();
    });
});
