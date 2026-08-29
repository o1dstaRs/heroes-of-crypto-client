import { describe, expect, test } from "bun:test";

import CREATURES_JSON from "@heroesofcrypto/common/src/configuration/creatures.json";

import { boardFootprintLabel } from "./boardFootprintLabel";

const entry = (faction: string, name: string): { size: number; footprint_width?: number; footprint_height?: number } =>
    (CREATURES_JSON as unknown as Record<string, Record<string, never>>)[faction][name];

describe("boardFootprintLabel", () => {
    /**
     * The chip must describe the BODY. Reading `size` alone was right until the mounted class shipped 2x1:
     * those creatures carry size 2 for their art tier, so the draft told the player they take 2x2.
     */
    test("reports the real body, not the square art tier", () => {
        expect(boardFootprintLabel(entry("Nature", "Wolf"))).toBe("2×1");
        expect(boardFootprintLabel(entry("Might", "Centaur"))).toBe("2×1");
    });

    test("a genuine square still reads square, at either tier", () => {
        expect(boardFootprintLabel(entry("Life", "Peasant"))).toBe("1×1");
        expect(boardFootprintLabel(entry("Might", "Behemoth"))).toBe("2×2");
    });

    test("every catalog entry describes a body no larger than its art tier on either axis", () => {
        const wrong: string[] = [];
        for (const [faction, roster] of Object.entries(CREATURES_JSON as unknown as Record<string, unknown>)) {
            if (!roster || typeof roster !== "object") {
                continue; // the top-level "version" number
            }
            for (const [name, config] of Object.entries(roster as Record<string, never>)) {
                const c = config as unknown as { size: number; footprint_width?: number; footprint_height?: number };
                if (typeof c?.size !== "number") {
                    continue;
                }
                const [w, h] = boardFootprintLabel(c).split("×").map(Number);
                // size === max(w, h) is enforced at config load; this is the label's own view of it.
                if (Math.max(w, h) !== c.size) {
                    wrong.push(`${faction}/${name}: ${w}×${h} vs size ${c.size}`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });
});
