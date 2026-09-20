import { describe, expect, test } from "bun:test";
import { CreatureVals } from "@heroesofcrypto/common";

import { creatureInfo } from "./portalFormat";

// The creature hover card quotes the catalogue: the same stats the draft's detail panel shows and the
// fight applies, with the movement steps kept as the exact fractional stat (owner call, never rounded).
describe("creature hover card data", () => {
    test("describes a creature with its catalogue stats and ability texts", () => {
        const info = creatureInfo(CreatureVals.TRENT);
        expect(info).toBeDefined();
        expect(info!.name).toBe("Trent");
        expect(info!.subtitle).toContain("Nature");
        expect(info!.subtitle).toContain("Level 2");
        expect(info!.subtitle).toContain("Melee");

        const stat = (label: string) => info!.stats.find((entry) => entry.label === label)?.value;
        expect(stat("Hit points")).toBe("31");
        expect(stat("Movement steps")).toBe("2.9");
        expect(stat("Armor")).toBe("20");
        // A walker's card never shows range-only numbers as zeroes.
        expect(stat("Shots")).toBeUndefined();
        expect(stat("Shot distance")).toBeUndefined();

        const ownWorld = info!.abilities.find((ability) => ability.name === "In Its Own World");
        expect(ownWorld).toBeDefined();
        expect(ownWorld!.description).toContain("vines");
        expect(ownWorld!.description).not.toContain("\n");
    });

    test("shows the shooting numbers only for a ranged creature", () => {
        const info = creatureInfo(CreatureVals.ARBALESTER);
        expect(info).toBeDefined();
        expect(info!.subtitle).toContain("Ranged");
        const labels = info!.stats.map((entry) => entry.label);
        expect(labels).toContain("Shots");
        expect(labels).toContain("Shot distance");
    });

    test("has nothing to say about a creature id the catalogue does not know", () => {
        expect(creatureInfo(987654)).toBeUndefined();
    });
});
