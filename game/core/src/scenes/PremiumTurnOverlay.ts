import {
    AttackVals,
    FireWallHelper,
    GridMath,
    SpellHelper,
    type GridSettings,
    type HoCMath,
    type Unit,
} from "@heroesofcrypto/common";
import { Container, Graphics, Text } from "pixi.js";

import type { PremiumTurnAdvice } from "../api/premium_client";
import { HOC_GAME_FONT_FAMILY } from "../fontFamilies";
import { glyphScaleX } from "../pixi/boardMirror";
import { inheritedAbsoluteScaleOf, legacyBoardChildScaleCompensation } from "../pixi/boardFit";
import { projectBattlefieldPoint, projectedCellPoints, projectedPolyline } from "./sandbox/BattlefieldVisualGrid";

type PreviewUnit = Pick<
    Unit,
    | "getId"
    | "getPosition"
    | "getCells"
    | "getFootprintWidth"
    | "getFootprintHeight"
    | "isDead"
    | "getTeam"
    | "hasBuffActive"
>;

export interface PremiumMoveDrawing {
    paths: HoCMath.XY[][];
    cells: HoCMath.XY[];
    point: HoCMath.XY;
    label: string;
}

/** Uses the server's exact action plan, never parses display text or runs a game action. */
export const premiumMoveDrawing = (
    option: PremiumTurnAdvice["options"][number],
    actor: PreviewUnit,
    units: ReadonlyMap<string, PreviewUnit>,
    gs: GridSettings,
): PremiumMoveDrawing | undefined => {
    if (!option.actions?.length || actor.isDead()) return undefined;
    const width = actor.getFootprintWidth();
    const height = actor.getFootprintHeight();
    const positionForAnchor = (cell: HoCMath.XY) => GridMath.getPositionForFootprintAnchor(gs, cell, width, height);
    const cellCenter = (cell: HoCMath.XY) => GridMath.getPositionForFootprintAnchor(gs, cell, 1, 1);
    const validCell = (cell: HoCMath.XY) =>
        Number.isInteger(cell.x) &&
        Number.isInteger(cell.y) &&
        cell.x >= 0 &&
        cell.y >= 0 &&
        cell.x < gs.getGridSize() &&
        cell.y < gs.getGridSize();
    let position = actor.getPosition();
    const drawing: PremiumMoveDrawing = { paths: [], cells: [], point: position, label: "" };
    let magicMelee = false;
    const move = (route: HoCMath.XY[]): boolean => {
        if (!route.length || !route.every(validCell)) return false;
        const path = [position, ...route.map(positionForAnchor)];
        drawing.paths.push(path);
        position = path[path.length - 1];
        drawing.point = position;
        drawing.cells = GridMath.getFootprintCellsForAnchor(route[route.length - 1], width, height);
        drawing.label = "Move";
        return true;
    };
    const aim = (point: HoCMath.XY, cells: HoCMath.XY[], label: string) => {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        drawing.paths.push([position, point]);
        drawing.point = point;
        drawing.cells = cells;
        drawing.label = label;
    };
    for (const action of option.actions) {
        const actorId =
            "unitId" in action
                ? action.unitId
                : "attackerId" in action
                  ? action.attackerId
                  : "casterId" in action
                    ? action.casterId
                    : undefined;
        if (actorId !== actor.getId()) return undefined;
        const target = "targetId" in action && action.targetId ? units.get(action.targetId) : undefined;
        if (
            "targetId" in action &&
            action.targetId &&
            (!target ||
                (target.isDead() && action.type !== "cast_spell") ||
                (target.getTeam() !== actor.getTeam() && target.hasBuffActive("Hidden")))
        )
            return undefined;
        switch (action.type) {
            case "select_attack_type":
                magicMelee = action.attackType === AttackVals.MELEE_MAGIC;
                break;
            case "move_unit":
                if (!move(action.path)) return undefined;
                break;
            case "melee_attack":
                if (!target) return undefined;
                if (!validCell(action.attackFrom)) return undefined;
                if (!move(action.path?.length ? action.path : [action.attackFrom])) return undefined;
                aim(target.getPosition(), target.getCells(), magicMelee ? "Magic melee" : "Attack");
                break;
            case "range_attack":
                if (!target && !action.targetPosition) return undefined;
                if (action.aimCell && !validCell(action.aimCell)) return undefined;
                aim(
                    action.targetPosition ??
                        (action.aimCell
                            ? action.aimSide !== undefined
                                ? GridMath.getRangeAttackSideCenter(gs, action.aimCell, action.aimSide, position)
                                : cellCenter(action.aimCell)
                            : target!.getPosition()),
                    target?.getCells() ?? [],
                    "Shoot",
                );
                break;
            case "area_throw_attack":
                if (!validCell(action.targetCell)) return undefined;
                aim(cellCenter(action.targetCell), [action.targetCell], "Throw");
                break;
            case "obstacle_attack": {
                if (action.attackFrom && !move(action.path?.length ? action.path : [action.attackFrom]))
                    return undefined;
                const cell = GridMath.getCellForPosition(gs, action.targetPosition);
                if (!validCell(cell)) return undefined;
                aim(action.targetPosition, [cell], "Obstacle");
                break;
            }
            case "cast_spell":
                if (action.targetCell && !validCell(action.targetCell)) return undefined;
                aim(
                    action.targetCell ? cellCenter(action.targetCell) : (target?.getPosition() ?? position),
                    action.targetCell
                        ? action.spellName === "Fire Wall"
                            ? FireWallHelper.fireWallCells(
                                  action.targetCell,
                                  FireWallHelper.normalizeFireWallOrientation(action.targetOrientation),
                              ).filter(validCell)
                            : ["Meteor Shower", "Meteorite", "Smoke", "Craft"].includes(action.spellName)
                              ? SpellHelper.cellTargetedSpellBlockCells(action.spellName, action.targetCell)
                              : [action.targetCell]
                        : (target?.getCells() ?? actor.getCells()),
                    action.spellName,
                );
                break;
            case "wait_turn":
            case "defend_turn":
                drawing.cells = actor.getCells();
                drawing.point = position;
                drawing.label = action.type === "wait_turn" ? "Wait" : "Defend";
                break;
            case "end_turn":
                if (!drawing.label) {
                    drawing.cells = actor.getCells();
                    drawing.label = "End turn";
                }
                break;
            default:
                return undefined;
        }
    }
    return drawing.label && drawing.cells.every(validCell) ? drawing : undefined;
};

const COLORS = [0xffc65a, 0x80d9ec] as const;

/** Floor paths and non-interactive labels live on the board, so camera fitting and mirroring follow it. */
export class PremiumTurnOverlay {
    private readonly floor = new Graphics({ eventMode: "none", zIndex: 58 });
    private readonly labels = new Container({ eventMode: "none", zIndex: 5505 });
    public constructor(root: Container) {
        root.addChild(this.floor, this.labels);
    }
    public draw(
        turn: PremiumTurnAdvice,
        actor: PreviewUnit,
        units: ReadonlyMap<string, PreviewUnit>,
        gs: GridSettings,
    ): void {
        this.floor.clear();
        for (const child of this.labels.removeChildren()) child.destroy({ children: true });
        const step = gs.getStep();
        // Paint the preferred path last so a shared approach remains gold and legible.
        for (let index = Math.min(2, turn.options.length) - 1; index >= 0; index -= 1) {
            const drawing = premiumMoveDrawing(turn.options[index], actor, units, gs);
            if (!drawing) continue;
            const color = COLORS[index];
            const alpha = index === 0 ? 0.95 : 0.7;
            for (const cell of drawing.cells) {
                this.floor
                    .poly(projectedCellPoints(cell, gs, 0.06))
                    .fill({ color, alpha: index === 0 ? 0.14 : 0.07 })
                    .stroke({ color, width: step * 0.035, alpha });
            }
            for (const path of drawing.paths) {
                const points = projectedPolyline(path, gs);
                this.floor
                    .poly(points, false)
                    .stroke({ color: 0x130e09, width: step * 0.09, alpha: 0.8, cap: "round", join: "round" });
                if (index === 0) {
                    this.floor
                        .poly(points, false)
                        .stroke({ color, width: step * 0.045, alpha, cap: "round", join: "round" });
                } else {
                    for (let i = 2; i < points.length; i += 2) {
                        const x = points[i - 2],
                            y = points[i - 1];
                        const dx = points[i] - x,
                            dy = points[i + 1] - y;
                        const length = Math.hypot(dx, dy);
                        for (let offset = 0; offset < length; offset += step * 0.22) {
                            const end = Math.min(length, offset + step * 0.12);
                            this.floor
                                .moveTo(x + (dx * offset) / length, y + (dy * offset) / length)
                                .lineTo(x + (dx * end) / length, y + (dy * end) / length)
                                .stroke({ color, width: step * 0.035, alpha, cap: "round" });
                        }
                    }
                }
                const end = projectBattlefieldPoint(path[path.length - 1], gs);
                const previous = [...path]
                    .reverse()
                    .find(
                        (point) =>
                            Math.hypot(point.x - path[path.length - 1].x, point.y - path[path.length - 1].y) > 0.01,
                    );
                if (previous) {
                    const from = projectBattlefieldPoint(previous, gs);
                    const angle = Math.atan2(end.y - from.y, end.x - from.x);
                    const size = step * 0.16;
                    this.floor
                        .poly([
                            end.x,
                            end.y,
                            end.x - Math.cos(angle - 0.5) * size,
                            end.y - Math.sin(angle - 0.5) * size,
                            end.x - Math.cos(angle + 0.5) * size,
                            end.y - Math.sin(angle + 0.5) * size,
                        ])
                        .fill({ color, alpha });
                }
            }
            const point = projectBattlefieldPoint(drawing.point, gs);
            const text = new Text({
                text: `${index + 1} · ${drawing.label}`,
                resolution: 2,
                style: {
                    fontFamily: HOC_GAME_FONT_FAMILY,
                    fontSize: step * 0.2,
                    fontWeight: "bold",
                    fill: color,
                    stroke: { color: 0x130e09, width: step * 0.035 },
                },
                eventMode: "none",
            });
            text.anchor.set(0.5);
            text.position.set(point.x, point.y - step * (0.4 + index * 0.3));
            this.labels.addChild(text);
        }
        this.setVisible(true);
    }
    public setVisible(visible: boolean): void {
        this.floor.visible = visible;
        this.labels.visible = visible;
        if (visible) {
            const inherited = inheritedAbsoluteScaleOf(this.labels);
            const compensation = legacyBoardChildScaleCompensation(inherited.x, inherited.y);
            for (const text of this.labels.children) text.scale.set(glyphScaleX(compensation.x), -compensation.y);
        }
    }
    public destroy(): void {
        this.floor.destroy();
        this.labels.destroy({ children: true });
    }
}
