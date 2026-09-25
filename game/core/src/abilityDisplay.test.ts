import { describe, expect, test } from "bun:test";

import { getAbilityDisplayMetadata } from "./abilityDisplay";

describe("Chakram ability display metadata", () => {
    test("prints the live stack-power target limit for runtime-granted cards", () => {
        for (let stackPower = 1; stackPower <= 5; stackPower += 1) {
            const description = getAbilityDisplayMetadata("Chakram", stackPower)?.description ?? "";
            expect(description).toContain(`Maximum targets: ${stackPower}.`);
            expect(description).not.toContain("{}");
            expect(description).not.toContain("100 targets");
        }
    });

    test("uses the full-stack maximum when no live unit exists", () => {
        expect(getAbilityDisplayMetadata("Chakram")?.description).toContain("Maximum targets: 5.");
    });
});

describe("Paralysis ability display metadata", () => {
    test("prints the Paralysis effect's damage cut, not the ability's landing power", () => {
        const description = getAbilityDisplayMetadata("Paralysis")?.description ?? "";
        expect(description).toContain("100% chance");
        expect(description).toContain("reduces their damage by 40%");
    });

    test("scales the chance and the cut with stack power", () => {
        const description = getAbilityDisplayMetadata("Paralysis", 2)?.description ?? "";
        expect(description).toContain("40% chance");
        expect(description).toContain("reduces their damage by 16%");
    });
});
