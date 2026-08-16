import { describe, expect, test } from "bun:test";

import { Doctrine } from "@heroesofcrypto/common";

import { images } from "../generated/image_imports";
import { getDoctrineIconImage } from "./doctrineCopy";

/**
 * Every selectable doctrine must resolve to art that actually ships.
 *
 * DoctrineProperties.imageKey used to be built as `perk_<slug>_256` — perk_three_reveals_256,
 * perk_see_all_256, perk_see_none_256 — while the art has always shipped as doctrine_scout,
 * doctrine_spymaster and doctrine_blind_fury. Not one of those keys resolved to anything, and nothing
 * failed: the icon just silently rendered nothing.
 */
describe("doctrine art resolves", () => {
    test("every selectable doctrine has an imageKey pointing at a real asset", () => {
        const missing = Doctrine.DOCTRINE_LIST.filter(
            (doctrine) => !(doctrine.imageKey in (images as Record<string, string>)),
        ).map((doctrine) => `${doctrine.name} -> ${doctrine.imageKey}`);

        expect(missing).toEqual([]);
    });

    test("the client's icon lookup returns a usable image for each of them", () => {
        for (const doctrine of Doctrine.DOCTRINE_LIST) {
            expect(`${doctrine.name}: ${typeof getDoctrineIconImage(doctrine.id)}`).toBe(`${doctrine.name}: string`);
        }
    });
});
