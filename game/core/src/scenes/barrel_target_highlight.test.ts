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
    test("only treats cells occupied by still-standing barrels as obstacle targets", () => {
        const source = sceneSource();
        const standingCellHelper = sliceFrom(source, "private isStandingAttackObstacleCell(", 800);
        expect(standingCellHelper).toContain("this.grid.getScatteredMountainsStanding()");

        const attackResolver = sliceFrom(source, "private resolveObstacleAttack(", 1_800);
        expect(attackResolver).toContain("this.isStandingAttackObstacleCell(hoveredCell)");

        const hover = sliceFrom(source, "private updateObstacleHover(): boolean", 3_000);
        expect(hover).toContain("this.isStandingAttackObstacleCell(hoveredCell)");
    });

    test("checks standing scattered barrels before resolving a ranged target behind them", () => {
        const source = sceneSource();
        const blockerHelper = sliceFrom(source, "private hasStandingShotBlockingObstacle(", 800);
        expect(blockerHelper).toContain("this.grid.getScatteredMountainsStanding().length > 0");

        const rangedAim = sliceFrom(source, "let blockedByObstacle: IAttackObstacle | undefined;", 3_500);
        expect(rangedAim).toContain("if (this.hasStandingShotBlockingObstacle())");
        expect(rangedAim).toContain("this.attackHandler.evaluateRangeAttack(");
    });

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

    test("clicks the same canonical barrel centre used by the hover preview", () => {
        const source = sceneSource();
        const resolver = sliceFrom(source, "private resolveObstacleAttack(", 2_500);
        expect(resolver).toContain("const hoveredCell = GridMath.getCellForPosition(gs, worldPos)");
        expect(resolver).toContain("const targetPosition = GridMath.getPositionForCell(");
        expect(resolver).toContain("return { unit, attackType: AttackVals.RANGE, targetPosition }");

        const click = sliceFrom(source, "private attemptObstacleAttack(", 900);
        expect(click).toContain(
            "this.executeObstacleAttackSequence(resolved.unit, resolved.targetPosition, resolved.attackFrom)",
        );
        expect(click).not.toContain("this.executeObstacleAttackSequence(resolved.unit, worldPos, resolved.attackFrom)");
    });

    test("clears the movement ghost when ranged aiming starts on a barrel", () => {
        const hover = sliceFrom(sceneSource(), "private updateObstacleHover(): boolean", 7_000);
        const rangedBranch = hover.indexOf("unit.getAttackTypeSelection() === AttackVals.RANGE && canRangeObstacle");
        const clearGhost = hover.indexOf("this.hoverManager.clearHoverSilhouette(true)", rangedBranch);
        const footprintExit = hover.indexOf("rangeTrajectoryFootprintExit(", rangedBranch);
        const drawTerminal = hover.indexOf("this.hoverManager.drawRangeTerminalArrowhead(", rangedBranch);
        const drawAim = hover.indexOf("this.hoverManager.drawAttackArrow(", rangedBranch);

        expect(rangedBranch).toBeGreaterThan(-1);
        expect(clearGhost).toBeGreaterThan(rangedBranch);
        expect(footprintExit).toBeGreaterThan(clearGhost);
        expect(drawTerminal).toBeGreaterThan(footprintExit);
        expect(drawTerminal).toBeGreaterThan(clearGhost);
        expect(drawAim).toBeGreaterThan(clearGhost);
        expect(drawAim).toBeGreaterThan(drawTerminal);
        expect(hover.slice(drawAim, drawAim + 300)).toContain("projectedCasingJoint");
    });

    test("moves the terminal arrowhead to the barrel that actually stops a creature-targeted shot", () => {
        const hover = sliceFrom(sceneSource(), "if (blockedByObstacle) {", 2_000);
        const drawTerminal = hover.indexOf("this.hoverManager.drawRangeTerminalArrowhead(");
        const drawAim = hover.indexOf("this.hoverManager.drawAttackArrow(");

        expect(drawTerminal).toBeGreaterThan(-1);
        expect(drawAim).toBeGreaterThan(drawTerminal);
        expect(hover.slice(drawTerminal, drawAim)).toContain("blockedVisual");
        expect(hover.slice(drawAim, drawAim + 300)).toContain("blockedCasingJoint");
    });

    test("renders a red alpha wash above the exact authored barrel silhouette", () => {
        const source = dungeonSource();
        const overlay = sliceFrom(source, "const dangerOverlay = new Sprite(tex);", 900);
        expect(overlay).toContain("dangerOverlay.position.copyFrom(sprite.position)");
        expect(overlay).toContain("dangerOverlay.scale.copyFrom(sprite.scale)");
        expect(overlay).toContain("dangerOverlay.filters = [this.tombstoneRedFilter]");
        expect(overlay).toContain("dangerOverlay.alpha = 0.15");
        expect(source).toContain("this.scatteredMountainDangerOverlays[index].visible = highlighted");
    });
});
