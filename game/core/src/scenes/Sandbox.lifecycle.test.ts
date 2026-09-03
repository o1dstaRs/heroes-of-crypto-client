import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

describe("Sandbox lifecycle", () => {
    const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");

    test("updates the turn clock from the scene ticker without retaining replaced scenes in an interval", () => {
        const constructor = source.slice(
            source.indexOf("public constructor("),
            source.indexOf("protected updateVisibleTurnTimer("),
        );
        const step = source.slice(
            source.indexOf("public override Step("),
            source.indexOf("private drawGameplayVisuals("),
        );

        expect(constructor).not.toContain("HoCLib.interval");
        expect(constructor).not.toContain("setInterval(");
        expect(step).toContain("this.updateVisibleTurnTimerIfDue()");
        expect(source).toContain("private nextVisibleTurnTimerUpdateMs = 0");
    });

    test("reuses one spellbook blur filter and destroys it with the scene", () => {
        const blurLifecycle = source.slice(
            source.indexOf("private setSpellBookWorldBlur("),
            source.indexOf("private setHoveredSpell("),
        );
        const destroy = source.slice(
            source.indexOf("public override Destroy()"),
            source.indexOf("private handleKeyDown"),
        );

        expect(blurLifecycle.match(/new BlurFilter/g)).toHaveLength(1);
        expect(blurLifecycle).toContain("filter.destroy()");
        expect(destroy).toContain("this.releaseSpellBookBlurFilter()");
        expect(source).not.toContain("active ? [new BlurFilter");
    });
});
