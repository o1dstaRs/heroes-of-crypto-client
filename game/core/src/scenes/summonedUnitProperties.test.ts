import { describe, expect, test } from "bun:test";

import { FactionVals, TeamVals } from "@heroesofcrypto/common";

import { createSummonedUnitProperties } from "./summonedUnitProperties";

describe("summoned unit properties", () => {
    test("uses resolvable Arachna Spider sidebar and board texture keys", () => {
        const properties = createSummonedUnitProperties(TeamVals.LOWER, FactionVals.NATURE, "Arachna Spider", 1);

        expect(properties.small_texture_name).toBe("arachna_spider_128");
        expect(properties.large_texture_name).toBe("arachna_spider_512");
    });
});
