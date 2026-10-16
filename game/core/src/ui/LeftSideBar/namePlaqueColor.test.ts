import { expect, test } from "bun:test";

import { TeamVals } from "@heroesofcrypto/common";

import { selectedUnitNamePlaqueBackground } from "./namePlaqueColor";

test("selected creature name plaque gives both teams seventeen-percent transparency", () => {
    expect(selectedUnitNamePlaqueBackground(TeamVals.LEFT)).toBe(
        "linear-gradient(90deg, rgba(21, 88, 50, 0.83) 0%, rgba(10, 55, 29, 0.83) 50%, rgba(21, 88, 50, 0.83) 100%)",
    );
    expect(selectedUnitNamePlaqueBackground(TeamVals.RIGHT)).toBe(
        "linear-gradient(90deg, rgba(111, 23, 36, 0.83) 0%, rgba(73, 11, 20, 0.83) 50%, rgba(111, 23, 36, 0.83) 100%)",
    );
    expect(selectedUnitNamePlaqueBackground(TeamVals.NO_TEAM)).toBe("#1c1916");
});
