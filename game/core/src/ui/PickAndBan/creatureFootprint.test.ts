import { CREATURES_JSON } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import { creatureFootprint, creatureFootprintLabel, type CreatureFootprintConfig } from "./creatureFootprint";

interface CreatureConfig extends CreatureFootprintConfig {
    level: number;
}

const creatureConfigs = (): Array<[string, CreatureConfig]> => {
    const configs: Array<[string, CreatureConfig]> = [];
    for (const roster of Object.values(CREATURES_JSON)) {
        if (!roster || typeof roster !== "object") continue;
        for (const [name, config] of Object.entries(roster as Record<string, CreatureConfig>)) {
            configs.push([name, config]);
        }
    }
    return configs;
};

describe("draft creature footprint", () => {
    test("shows Hyena as a 2×1 creature", () => {
        const hyena = creatureConfigs().find(([name]) => name === "Hyena")?.[1];

        expect(hyena).toBeDefined();
        expect(creatureFootprint(hyena!)).toEqual({ width: 2, height: 1 });
        expect(creatureFootprintLabel(creatureFootprint(hyena!))).toBe("2×1");
    });

    test("shows every level 4 creature as 2×2", () => {
        const levelFourCreatures = creatureConfigs().filter(([, config]) => config.level === 4);

        expect(levelFourCreatures.length).toBeGreaterThan(0);
        for (const [name, config] of levelFourCreatures) {
            expect(creatureFootprint(config), name).toEqual({ width: 2, height: 2 });
        }
    });
});
