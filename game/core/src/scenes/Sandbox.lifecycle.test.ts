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

    test("routes delayed combat work through the scene-owned timeout registry", () => {
        expect(source).not.toMatch(/\b(?:globalThis\.)?setTimeout\(/);
        expect(source).not.toMatch(/\b(?:globalThis\.)?clearTimeout\(/);
        expect(source).toContain("this.scheduleSceneTimeout(");
        expect(source).toContain("this.delayForScene(");
        expect(source).toContain("this.clearSceneTimeout(");
    });

    test("reuses depth-sort arrays and terrain callbacks in the high-frequency fight step", () => {
        const step = source.slice(
            source.indexOf("public override Step("),
            source.indexOf("private drawGameplayVisuals("),
        );

        expect(step).toContain("this.depthSortableUnitsScratch");
        expect(step).toContain("this.depthSortCandidatesScratch");
        expect(step).toContain("this.terrainCellToWorld");
        expect(step).not.toContain("for (const dyingUnit of [...this.dyingVisualUnits])");
        expect(step).not.toContain(".map((unit, stableOrder)");
        expect(step).not.toContain("const terrainCellToWorld =");
        expect(step.match(/this\.cleanupDeadUnits\(\)/g)).toHaveLength(1);
        expect(source).toContain("let unitsToDestroy: RenderableUnit[] | undefined");
        expect(source).toContain("(unitsToDestroy ??= []).push");
        expect(source).toContain("private movementGraphicsHasGeometry = false");
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
        expect(destroy).toContain("this.aiController.destroy()");
        expect(destroy).toContain("this.moveAnimManager.cancel()");
        expect(destroy).toContain("this.placementManager.releaseVisuals()");
        expect(destroy).toContain("this.releaseSpellBookBlurFilter()");
        expect(source).not.toContain("active ? [new BlurFilter");
    });

    test("loads the spellbook background only when opened and releases it with the scene", () => {
        const constructor = source.slice(
            source.indexOf("public constructor("),
            source.indexOf("protected updateVisibleTurnTimer("),
        );
        const backgroundLifecycle = source.slice(
            source.indexOf("private ensureSpellBookBackground("),
            source.indexOf("private setHoveredSpell("),
        );
        const destroy = source.slice(
            source.indexOf("public override Destroy()"),
            source.indexOf("private handleKeyDown"),
        );

        expect(constructor).not.toContain('this.texAny("book_1024_clean_pages_v1")');
        expect(backgroundLifecycle).toContain("Assets.load<Texture>(url)");
        expect(backgroundLifecycle).toContain("Assets.unload(images.book_1024_clean_pages_v1)");
        expect(destroy).toContain("this.releaseSpellBookBackground()");
    });
});
