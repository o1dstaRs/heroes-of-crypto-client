import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

describe("pick lantern animation", () => {
    test("updates its sprite frame without driving React renders and can pause while hidden", () => {
        const source = readFileSync(join(import.meta.dir, "PickLanternFire.tsx"), "utf8");

        expect(source).not.toContain("useState");
        expect(source).toContain("flameRef.current.style.backgroundPosition");
        expect(source).toContain("if (!active || !tuning.enabled) return null");
        expect(source).toContain("const FRAME_POSITIONS = Array.from");
    });
});
