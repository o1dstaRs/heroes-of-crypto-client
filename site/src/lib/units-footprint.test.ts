import { expect, test } from "bun:test";
import creatures from "@heroesofcrypto/common/src/configuration/creatures.json";

import { allUnits } from "./units-data";

const creatureFootprints = creatures as Record<
    string,
    Record<string, { size: number; footprint_width?: number; footprint_height?: number }>
>;

test("unit cards expose the battlefield footprint, including rectangular creatures", () => {
    for (const [name, width, height] of [
        ["Peasant", 1, 1],
        ["Wolf", 2, 1],
        ["Centaur", 2, 1],
        ["Hydra", 2, 2],
    ] as const) {
        const unit = allUnits.find((entry) => entry.name === name)!;
        expect([unit.footprintWidth, unit.footprintHeight], name).toEqual([width, height]);
    }
});

test("every catalog footprint agrees with the shared creature configuration", () => {
    for (const unit of allUnits) {
        const raw = creatureFootprints[unit.faction][unit.name];
        expect([unit.footprintWidth, unit.footprintHeight], unit.name).toEqual([
            raw.footprint_width ?? raw.size,
            raw.footprint_height ?? raw.size,
        ]);
    }
});
