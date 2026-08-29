import { describe, expect, test } from "bun:test";

import { SANDBOX_BARREL_MAX_COUNT, SANDBOX_BARREL_MIN_COUNT, sandboxBarrelLayoutForSeed } from "./Sandbox";

describe("sandbox barrel layout", () => {
    test("keeps every local Cemetery roll within the requested 9–12-barrel range", () => {
        for (let count = SANDBOX_BARREL_MIN_COUNT; count <= SANDBOX_BARREL_MAX_COUNT; count++) {
            const layout = sandboxBarrelLayoutForSeed(`sandbox-barrels-${count}`, count, true);

            expect(layout).toHaveLength(count);
            expect(new Set(layout.map(({ cell }) => `${cell.x}:${cell.y}`)).size).toBe(count);
        }
    });

    test("uses the new seed when the sandbox asks for another barrel arrangement", () => {
        const first = sandboxBarrelLayoutForSeed("sandbox-barrels-first", 12, true);
        const second = sandboxBarrelLayoutForSeed("sandbox-barrels-second", 12, true);

        expect(second.map(({ cell }) => `${cell.x}:${cell.y}`)).not.toEqual(
            first.map(({ cell }) => `${cell.x}:${cell.y}`),
        );
    });
});
