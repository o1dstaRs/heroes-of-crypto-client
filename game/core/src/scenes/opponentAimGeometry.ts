import {
    FireWallHelper,
    GridMath,
    SmokeHelper,
    SpellHelper,
    SpellTargetType,
    isOffensiveSpellMultiplier,
    type AttackHandler,
    type Grid,
    type GridSettings,
    type HoCMath,
    type Spell,
    type Unit,
} from "@heroesofcrypto/common";

import { PlayAimKind, type PlayAim } from "../api/play_protocol";
import { rangeTargetEdgeEvaluationAim } from "./rangeTargetEdges";
import { rangeAttackFootprintEdgePoint } from "./sandbox/BattlefieldVisualGrid";

export interface AimGeometry {
    color: number;
    cells: HoCMath.XY[];
    ray?: { from: HoCMath.XY; to: HoCMath.XY };
    ghost?: HoCMath.XY;
}

export interface AimGeometryContext {
    actor: Unit;
    units: ReadonlyMap<string, Unit>;
    grid: Grid;
    settings: GridSettings;
    evaluateRange: AttackHandler["evaluateRangeAttack"];
    spell?: Spell;
    spellImpact?: Unit;
    spellEndpoint?: HoCMath.XY;
    spellSplash?: Unit[];
}

/** Read-only board geometry. The opponent's intent never becomes our selection or armed spell. */
export function resolveOpponentAimGeometry(aim: PlayAim, context: AimGeometryContext): AimGeometry | undefined {
    const { actor, units, grid, settings: gs, spell } = context;
    const valid = (cell: HoCMath.XY): boolean =>
        Number.isInteger(cell.x) && Number.isInteger(cell.y) && GridMath.isCellWithinGrid(gs, cell);
    if (aim.unitId !== actor.getId() || actor.isDead() || (aim.cell && !valid(aim.cell))) return undefined;
    const target = aim.targetUnitId ? units.get(aim.targetUnitId) : undefined;
    if (aim.targetUnitId && !target) return undefined;
    const cellPosition = (cell: HoCMath.XY) =>
        GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
    const geometry: AimGeometry = { color: 0xf2a45e, cells: [] };
    if (aim.kind === PlayAimKind.CLEAR) return geometry;
    if (aim.kind === PlayAimKind.MOVE || aim.kind === PlayAimKind.MELEE) {
        const anchor = aim.kind === PlayAimKind.MOVE ? aim.cell : aim.attackFrom;
        if (!anchor || !valid(anchor)) return undefined;
        const footprint = actor.getFootprintCellsForAnchor(anchor);
        if (!footprint.every(valid)) return undefined;
        if (
            footprint.some((cell) => {
                const occupant = grid.getOccupantUnitId(cell);
                return occupant && occupant !== actor.getId();
            })
        )
            return undefined;
        geometry.ghost = GridMath.getPositionForCells(gs, footprint);
        if (!geometry.ghost) return undefined;
        if (aim.kind === PlayAimKind.MOVE) {
            geometry.color = 0x8cd5ef;
            geometry.cells = footprint;
        } else {
            if (target?.isDead()) return undefined;
            geometry.cells = target?.getCells() ?? (aim.cell ? [aim.cell] : []);
            const end = target?.getPosition() ?? (aim.cell ? cellPosition(aim.cell) : undefined);
            if (end) geometry.ray = { from: geometry.ghost, to: end };
        }
        return geometry;
    }
    if (aim.kind === PlayAimKind.RANGED) {
        if (!aim.cell || target?.isDead()) return undefined;
        if (aim.targetSide && (!Number.isInteger(aim.targetSide) || aim.targetSide < 1 || aim.targetSide > 4))
            return undefined;
        if (
            aim.aimDirection &&
            (!Number.isInteger(aim.aimDirection) || aim.aimDirection < 1 || aim.aimDirection > 4096)
        )
            return undefined;
        if (aim.attackFrom && !actor.getFootprintCellsForAnchor(aim.attackFrom).every(valid)) return undefined;
        const origin = aim.attackFrom
            ? GridMath.getPositionForFootprintAnchor(
                  gs,
                  aim.attackFrom,
                  actor.getFootprintWidth(),
                  actor.getFootprintHeight(),
              )
            : actor.getPosition();
        const direction = aim.aimDirection ? ((aim.aimDirection - 1) * Math.PI * 2) / 4096 : undefined;
        const end =
            direction !== undefined
                ? {
                      x: origin.x + Math.cos(direction) * gs.getStep() * 32,
                      y: origin.y + Math.sin(direction) * gs.getStep() * 32,
                  }
                : aim.targetSide
                  ? rangeTargetEdgeEvaluationAim(gs, aim.cell, aim.targetSide - 1, actor.getPosition())
                  : cellPosition(aim.cell);
        const through = actor.hasAbilityActive("Through Shot");
        const area = actor.hasAbilityActive("Area Throw");
        const evaluation = context.evaluateRange(
            units,
            actor,
            actor.getPosition(),
            end,
            through,
            false,
            area || actor.hasAbilityActive("Large Caliber"),
        );
        const victim = evaluation.affectedUnits[0]?.[0];
        let impact = evaluation.attackObstacle?.position ?? end;
        if (through && !evaluation.attackObstacle) {
            impact = GridMath.projectLineToFieldEdge(gs, origin.x, origin.y, end.x, end.y);
        } else if (victim && target && victim.getId() !== target.getId()) {
            impact = victim.getPosition();
        }
        if (area && !aim.targetUnitId) {
            geometry.cells = [aim.cell, ...GridMath.getCellsAroundCell(gs, aim.cell)].filter(valid);
        } else if (through) {
            geometry.cells = evaluation.affectedUnits.flatMap((group) => group.flatMap((unit) => unit.getCells()));
        } else {
            geometry.cells = evaluation.affectedCells[0] ?? victim?.getCells() ?? [];
        }
        if (aim.attackFrom && (origin.x !== actor.getPosition().x || origin.y !== actor.getPosition().y))
            geometry.ghost = origin;
        geometry.ray = {
            from: rangeAttackFootprintEdgePoint(
                actor.getPosition(),
                impact,
                actor.getFootprintWidth(),
                actor.getFootprintHeight(),
                gs,
            ),
            to: impact,
        };
        return geometry;
    }
    if (aim.kind !== PlayAimKind.SPELL || !spell || spell.getName() !== aim.spellName) return undefined;
    const positive = spell.isBuff() || spell.getSpellTargetType() === SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE;
    geometry.color = positive ? 0x52dc9b : 0xf28b63;
    if (spell.getName() === "Fire Wall" && aim.cell) {
        const orientation = (aim.targetOrientation ?? 1) - 1;
        if (!Number.isInteger(orientation) || orientation < 0 || orientation > 3) return undefined;
        geometry.cells = FireWallHelper.fireWallLitCells(grid, valid, aim.cell, orientation);
        return geometry;
    }
    if (
        aim.cell &&
        (spell.getSpellTargetType() === SpellTargetType.FREE_CELL ||
            spell.getSpellTargetType() === SpellTargetType.ALLIES_AREA)
    ) {
        const cells = SpellHelper.cellTargetedSpellBlockCells(spell.getName(), aim.cell);
        if (
            spell.getName() === "Meteorite" &&
            (!cells.every(valid) ||
                !cells.some((cell) => {
                    const id = grid.getOccupantUnitId(cell);
                    const unit = id ? units.get(id) : undefined;
                    return unit && !unit.isDead() && unit.getTeam() !== actor.getTeam();
                }))
        )
            return geometry;
        if (spell.getName() === "Smoke" && !cells.every((cell) => SmokeHelper.isSmokeableCell(grid, valid(cell), cell)))
            return geometry;
        geometry.cells = cells.filter(valid);
        return geometry;
    }
    const victim = context.spellImpact ?? target;
    if (victim) {
        geometry.cells = [victim, ...(context.spellSplash ?? [])].flatMap((unit) => unit.getCells());
        const direct =
            !SpellHelper.targetedSpellRequiresLineOfSight(spell.getName()) &&
            !isOffensiveSpellMultiplier(spell.getMultiplierType()) &&
            spell.getSpellTargetType() !== SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE;
        if (!direct) geometry.ray = { from: actor.getPosition(), to: context.spellEndpoint ?? victim.getPosition() };
    }
    return geometry;
}
