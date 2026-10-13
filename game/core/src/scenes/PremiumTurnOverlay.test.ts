import { expect, test } from "bun:test";
import {
    AttackVals,
    FireWallHelper,
    GridConstants,
    GridMath,
    GridSettings,
    TeamVals,
    type GameAction,
    type HoCMath,
} from "@heroesofcrypto/common";
import { Container } from "pixi.js";

import { premiumMoveDrawing, PremiumTurnOverlay } from "./PremiumTurnOverlay";
import { releaseBoardMirror, setBoardMirror } from "../pixi/boardMirror";

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const unit = (id: string, cell: HoCMath.XY, width = 1, height = 1, hidden = false) => ({
    getId: () => id,
    getPosition: () => GridMath.getPositionForFootprintAnchor(gs, cell, width, height),
    getCells: () => GridMath.getFootprintCellsForAnchor(cell, width, height),
    getFootprintWidth: () => width,
    getFootprintHeight: () => height,
    getTeam: () => (id === "actor" ? TeamVals.LEFT : TeamVals.RIGHT),
    isDead: () => false,
    hasBuffActive: () => hidden,
    hasAbilityActive: () => false,
});
const actor = unit("actor", { x: 3, y: 4 }, 2, 1);
const target = unit("target", { x: 9, y: 4 }, 1, 2);
const units = new Map([
    ["actor", actor],
    ["target", target],
]);
const option = (actions: GameAction[]) => ({
    id: "plan",
    label: "Server display text is deliberately not parsed",
    reasons: [],
    actions,
});

test("movement preserves the exact detour and rectangular footprint without mutating the plan", () => {
    const route = [
        { x: 4, y: 5 },
        { x: 5, y: 5 },
        { x: 6, y: 4 },
    ];
    const plan = option([
        { type: "move_unit", unitId: "actor", path: route },
        { type: "end_turn", unitId: "actor" },
    ]);
    const before = structuredClone(plan);
    const drawing = premiumMoveDrawing(plan, actor, units, gs)!;
    expect(drawing.paths).toEqual([
        [actor.getPosition(), ...route.map((cell) => GridMath.getPositionForFootprintAnchor(gs, cell, 2, 1))],
    ]);
    expect(drawing.cells).toEqual(GridMath.getFootprintCellsForAnchor(route[2], 2, 1));
    expect(drawing.label).toBe("Move");
    expect(plan).toEqual(before);
});

test("melee approaches from the suggested cell and highlights the entire target", () => {
    const attackFrom = { x: 8, y: 4 };
    const drawing = premiumMoveDrawing(
        option([
            { type: "select_attack_type", unitId: "actor", attackType: AttackVals.MELEE_MAGIC },
            {
                type: "melee_attack",
                attackerId: "actor",
                targetId: "target",
                attackFrom,
                path: [{ x: 4, y: 5 }, attackFrom],
            },
            { type: "end_turn", unitId: "actor" },
        ]),
        actor,
        units,
        gs,
    )!;
    expect(drawing.paths[1]).toEqual([
        GridMath.getPositionForFootprintAnchor(gs, attackFrom, 2, 1),
        target.getPosition(),
    ]);
    expect(drawing.cells).toEqual(target.getCells());
    expect(drawing.label).toBe("Magic melee");
});

test("ranged suggestions preserve the target edge and free Through Shot aim", () => {
    const aimCell = { x: 9, y: 4 };
    const aimSide = GridMath.RangeAttackCellSide.UP;
    const drawing = premiumMoveDrawing(
        option([{ type: "range_attack", attackerId: "actor", targetId: "target", aimCell, aimSide }]),
        actor,
        units,
        gs,
    )!;
    expect(drawing.point).toEqual(GridMath.getRangeAttackSideCenter(gs, aimCell, aimSide, actor.getPosition()));
    const targetPosition = { x: 300, y: 400 };
    expect(
        premiumMoveDrawing(
            option([{ type: "range_attack", attackerId: "actor", targetId: "", targetPosition }]),
            actor,
            units,
            gs,
        )?.point,
    ).toEqual(targetPosition);
});

test("spells preserve wall orientation and stationary actions mark the acting unit", () => {
    const targetCell = { x: 8, y: 8 };
    const targetOrientation = FireWallHelper.FireWallOrientation.VERTICAL;
    expect(
        premiumMoveDrawing(
            option([{ type: "cast_spell", casterId: "actor", spellName: "Fire Wall", targetCell, targetOrientation }]),
            actor,
            units,
            gs,
        )?.cells,
    ).toEqual(FireWallHelper.fireWallCells(targetCell, targetOrientation));
    for (const type of ["defend_turn", "wait_turn"] as const) {
        const drawing = premiumMoveDrawing(option([{ type, unitId: "actor" }]), actor, units, gs)!;
        expect(drawing.cells).toEqual(actor.getCells());
        expect(drawing.paths).toEqual([]);
        expect(drawing.label).toBe(type === "defend_turn" ? "Defend" : "Wait");
    }
});

test("old responses, hidden targets, missing targets and another actor never produce misleading marks", () => {
    expect(
        premiumMoveDrawing({ id: "legacy", label: "Move to (8, 8)", reasons: [] }, actor, units, gs),
    ).toBeUndefined();
    const shot = option([{ type: "range_attack", attackerId: "actor", targetId: "target" }]);
    expect(
        premiumMoveDrawing(shot, actor, new Map([["target", unit("target", { x: 9, y: 4 }, 1, 1, true)]]), gs),
    ).toBeUndefined();
    expect(premiumMoveDrawing(shot, actor, new Map(), gs)).toBeUndefined();
    expect(
        premiumMoveDrawing(option([{ type: "move_unit", unitId: "other", path: [{ x: 8, y: 8 }] }]), actor, units, gs),
    ).toBeUndefined();
    expect(
        premiumMoveDrawing(option([{ type: "move_unit", unitId: "actor", path: [{ x: -1, y: 8 }] }]), actor, units, gs),
    ).toBeUndefined();
});

test("board annotations are noninteractive, readable when mirrored, and release their scene objects", () => {
    const root = new Container();
    const overlay = new PremiumTurnOverlay(root);
    const mirrorOwner = {};
    try {
        setBoardMirror(mirrorOwner, true);
        overlay.draw(
            {
                sequence: 1,
                lap: 1,
                unitId: "actor",
                status: "ready",
                options: [option([{ type: "wait_turn", unitId: "actor" }])],
            },
            actor,
            units,
            gs,
        );
        expect(root.children).toHaveLength(2);
        expect(root.children.every((child) => child.eventMode === "none")).toBe(true);
        const label = root.children[1].children[0];
        expect(label.scale.x).toBe(-1);
        expect(label.scale.y).toBe(-1);
        overlay.setVisible(false);
        expect(root.children.every((child) => !child.visible)).toBe(true);
        releaseBoardMirror(mirrorOwner);
        overlay.setVisible(true);
        expect(label.scale.x).toBe(1);
        overlay.destroy();
        expect(root.children).toHaveLength(0);
    } finally {
        releaseBoardMirror(mirrorOwner);
        root.destroy({ children: true });
    }
});
