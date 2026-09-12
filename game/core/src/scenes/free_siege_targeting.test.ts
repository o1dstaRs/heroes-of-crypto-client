import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
const hoverManagerSource = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");

const sliceFrom = (anchor: string, length: number): string => {
    const start = source.indexOf(anchor);
    expect(start).toBeGreaterThan(-1);
    return source.slice(start, start + length);
};

describe("free siege targeting", () => {
    test("Gargantuan keeps its 3x3 cell selector over occupied cells without trajectory snapping", () => {
        const cells = sliceFrom("private getAreaThrowCells(", 1_100);
        expect(cells).not.toContain("getOccupantUnitId(mouseCell)");
        expect(cells).toContain("GridMath.getCellsAroundCell(gs, targetCell)");

        const impact = sliceFrom("private getAreaThrowImpactCell(", 300);
        expect(impact).toContain("return { ...mouseCell }");
        expect(impact).not.toContain("projectAreaThrowTargetCell");
    });

    test("Tsar Cannon uses a free world ray with per-stack forecasts and no central plaque", () => {
        const hover = sliceFrom("private updateFreeThroughShotHover()", 8_000);
        expect(hover).toContain("evaluateRangeAttack(");
        expect(hover).toContain("GridMath.projectLineToFieldEdge");
        expect(hover).toContain("rangeAttackFootprintEdgePoint(");
        expect(hover).toContain("unit.getFootprintWidth()");
        expect(hover).toContain("unit.getFootprintHeight()");
        expect(hover).toContain("const projectedShotStart = projectBattlefieldPoint(shotStart, gs)");
        expect(hover).toContain("const projectedShotEnd = projectBattlefieldPoint(lineEnd, gs)");
        expect(hover).toContain("const projectedCasingJoint = this.hoverManager.drawRangeTerminalArrowhead(");
        expect(hover).toContain("this.hoverManager.drawAttackArrow(projectedShotStart, projectedCasingJoint)");
        expect(hoverManagerSource).toContain("public drawRangeTerminalArrowhead(");
        expect(hover).toContain("this.hoverManager.addTargetHighlight(affectedUnit)");
        expect(hover).toContain("evaluation.rangeAttackDivisors[hitIndex]");
        expect(hover).toContain("projectKillBand(affectedUnit, minDamage, maxDamage)");
        expect(hover).toContain("affectedUnit.getDamagePredictionAnchor(gs)");
        expect(hover).toContain("this.hoverManager.addAOEDamagePrediction(");
        expect(hover).not.toContain('this.sc_hoverInfoArr = ["Line attack"]');

        const click = sliceFrom("private attemptFreeThroughShotAttack(", 2_400);
        expect(click).toContain('targetId: ""');
        expect(click).toContain("targetPosition: { ...worldPos }");
        expect(click).toContain("evaluation.attackObstacle");
    });

    test("free siege modes run before ordinary obstacle/unit targeting and suppress movement previews", () => {
        const clickFlow = sliceFrom("// --- OBSTACLE ATTACK", 1_500);
        expect(clickFlow.indexOf("attemptFreeThroughShotAttack(p)")).toBeLessThan(
            clickFlow.indexOf("hoverRangeAttackObstacle"),
        );

        const hoverFlow = sliceFrom("// --- THROUGH SHOT HOVER", 900);
        expect(hoverFlow.indexOf("updateFreeThroughShotHover()")).toBeLessThan(
            hoverFlow.indexOf("updateObstacleHover()"),
        );

        const movement = sliceFrom("// An Area Throw unit in RANGE mode", 700);
        expect(movement).toContain("!this.isAreaThrowAiming()");
        expect(movement).toContain("!this.isFreeThroughShotAiming()");
    });

    test("Area Throw uses a corner range badge and per-unit damage/loss forecasts", () => {
        const preview = sliceFrom("private updateAreaThrowHover()", 12_000);
        expect(preview).not.toContain("const areaLabel");
        expect(preview).toContain("const projectedImpactCenter = projectBattlefieldPoint(impactPos, gs)");
        expect(preview).toContain("const projectedCasingJoint = this.hoverManager.drawRangeTerminalArrowhead(");
        expect(preview).toContain("projectedImpactCenter,");
        expect(preview).toContain("this.hoverManager.drawAttackArrow(projectedShotStart, projectedCasingJoint)");
        expect(preview).toContain("`1/${divisor}`");
        expect(preview).toContain("rangedDamageModifierIcon(true, AttackVals.RANGE, divisor)");
        expect(preview).toContain("affectedUnit.getDamagePredictionAnchor(gs)");
        expect(preview).toContain("projectKillBand(affectedUnit, minD, maxD)");
        expect(preview).toContain("this.hoverManager.addAOEDamagePrediction(");
        expect(hoverManagerSource).toContain("public addAOEDamagePrediction(");
        expect(hoverManagerSource).toContain("this.aoeDamagePredictionPool.push(visual)");
    });
});
