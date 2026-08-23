import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sceneSource = (): string => readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
const dungeonSource = (): string => readFileSync(join(import.meta.dir, "sandbox/DungeonVisuals.ts"), "utf8");

const sliceFrom = (source: string, anchor: string, length: number): string => {
    const start = source.indexOf(anchor);
    expect(start).toBeGreaterThan(-1);
    return source.slice(start, start + length);
};

describe("Cemetery barrel danger highlights", () => {
    test("uses the attack engine's obstacle intersections for every trajectory preview", () => {
        const source = sceneSource();
        const helper = sliceFrom(source, "private highlightScatteredObstaclesAlongTrajectory(", 1_100);
        expect(helper).toContain("this.attackHandler.getObstacleIntersections(from, to)");
        expect(helper).toContain("this.dungeonVisuals.highlightScatteredMountains(");

        expect(sliceFrom(source, "private updateAreaThrowHover()", 5_500)).toContain(
            "this.highlightScatteredObstaclesAlongTrajectory(activeUnit.getPosition(), impactPos)",
        );
        expect(sliceFrom(source, "protected renderIncomingThreatPreview(", 6_500)).toContain(
            "this.highlightScatteredObstaclesAlongTrajectory(shooterLogical, impactLogical)",
        );
        expect(sliceFrom(source, "// --- SPELL TARGETING HOVER", 14_000)).toContain(
            "this.highlightScatteredObstaclesAlongTrajectory(caster.getPosition(), trajectoryEnd)",
        );
    });

    test("hovering a standing barrel highlights it before attack-type gating", () => {
        const hover = sliceFrom(sceneSource(), "private updateObstacleHover(): boolean", 7_000);
        const highlightIndex = hover.indexOf(
            "this.dungeonVisuals.highlightScatteredMountains([hoveredObstacleCenter])",
        );
        const magicGateIndex = hover.indexOf("unit.getAttackTypeSelection() === AttackVals.MAGIC");
        expect(highlightIndex).toBeGreaterThan(-1);
        expect(magicGateIndex).toBeGreaterThan(highlightIndex);
    });

    test("renders a red alpha wash above the exact authored barrel silhouette", () => {
        const source = dungeonSource();
        const overlay = sliceFrom(source, "const dangerOverlay = new Sprite(tex);", 900);
        expect(overlay).toContain("dangerOverlay.position.copyFrom(sprite.position)");
        expect(overlay).toContain("dangerOverlay.scale.copyFrom(sprite.scale)");
        expect(overlay).toContain("dangerOverlay.filters = [this.tombstoneRedFilter]");
        expect(overlay).toContain("dangerOverlay.alpha = 0.34");
        expect(source).toContain("this.scatteredMountainDangerOverlays[index].visible = highlighted");
    });
});
