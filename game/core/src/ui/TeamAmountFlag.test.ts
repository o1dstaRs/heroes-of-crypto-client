import { describe, expect, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";

import { getTeamFlagBackground } from "./TeamAmountFlag";

describe("team amount flag palette", () => {
    test("uses the same bright green and red as stack-power pips", () => {
        expect(getTeamFlagBackground(TeamVals.LOWER)).toBe("#00d200");
        expect(getTeamFlagBackground(TeamVals.UPPER)).toBe("#ff0000");
    });
});
