import { AIActionType, findTarget } from "../../src/ai/ai";

import { IUnitAIRepr } from "../../src/units/units";
import { GRID_SIZE, MAX_Y, MIN_Y, MAX_X, MIN_X, MOVEMENT_DELTA, UNIT_SIZE_DELTA } from "../../src/statics";
import {
    // AttackType,
    TeamType,
    Grid,
    ObstacleType,
    HoCMath,
    PathHelper,
    // IWeightedRoute,
    UnitProperties,
    GridSettings,
    GridType,
    AttackType,
} from "@heroesofcrypto/common";

/**
 * The Unit tests for AI
 *
 * X goes from 0 on left to N on right
 * Y goes from 0 on bottom to N on top
 *
 */
const gridSettings = new GridSettings(GRID_SIZE, MAX_Y, MIN_Y, MAX_X, MIN_X, MOVEMENT_DELTA, UNIT_SIZE_DELTA);

describe("MoveAndAttackForSmallUnit", () => {
    const pathHelper = new PathHelper(
        // not needed for the getMovePath
        gridSettings,
    );
    it("Should find the closest target for the unit and attack", () => {
        const matrix: number[][] = new Array();
        matrix[3] = [0, 2, 0, 0];
        matrix[2] = [0, 2, 0, 0];
        matrix[1] = [0, 0, 0, 0];
        matrix[0] = [0, 0, 1, 0];
        /**
            End matrix:
            [0, 2, 0, 0],
            [0, 2, 0, 0],
            [0, 0, 1, 0], <- cell to attack from
            [0, 0, 0, 0],
         */
        const unit = stubSmallUnit(10, { x: 2, y: 0 });
        new UnitRepr("id", TeamType.UPPER, 10, 1, 1, false, true, { x: 2, y: 0 }, [{ x: 2, y: 0 }], AttackType.MELEE);
        const closestTarget = findTarget(unit, new Grid(gridSettings, GridType.NORMAL), matrix, pathHelper);
        expect(closestTarget?.cellToAttack()).toEqual({ x: 1, y: 2 });
        expect(closestTarget?.cellToMove()).toEqual({ x: 2, y: 1 });
        expect(closestTarget?.actionType()).toEqual(AIActionType.MOVE_AND_MELEE_ATTACK);
    });

    it("Should target for the unit and melee attack if can", () => {
        const matrix: number[][] = new Array();
        matrix[3] = [0, 2, 0, 0];
        matrix[2] = [0, 0, 0, 0];
        matrix[1] = [0, 0, 0, 0];
        matrix[0] = [0, 0, 1, 0];
        /**
            End matrix:
            [0, 2, 0, 0],
            [0, 0, 1, 0], <- cell to attack from
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        */
        const unit = stubSmallUnit(2, { x: 2, y: 0 });
        new UnitRepr("id", TeamType.UPPER, 2, 1, 1, false, true, { x: 2, y: 0 }, [{ x: 2, y: 0 }], AttackType.MELEE);
        const closestTarget = findTarget(unit, new Grid(gridSettings, GridType.NORMAL), matrix, pathHelper);
        expect(closestTarget?.cellToAttack()).toEqual({ x: 1, y: 3 });
        expect(closestTarget?.cellToMove()).toEqual({ x: 2, y: 2 });
        expect(closestTarget?.actionType()).toEqual(AIActionType.MOVE_AND_MELEE_ATTACK);
    });

    it("Should go by diagonal and melee attack if can", () => {
        const matrix: number[][] = new Array();
        matrix[3] = [2, 0, 0, 0];
        matrix[2] = [0, 0, 0, 0];
        matrix[1] = [0, 0, 0, 0];
        matrix[0] = [0, 0, 0, 1];
        /**
            End matrix
            [2, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0], <- to attack
        */
        const unit = stubSmallUnit(3, { x: 3, y: 0 });
        const closestTarget = findTarget(unit, new Grid(gridSettings, GridType.NORMAL), matrix, pathHelper);
        expect(closestTarget?.cellToMove()).toEqual({ x: 1, y: 2 });
        expect(closestTarget?.cellToAttack()).toEqual({ x: 0, y: 3 });
        expect(closestTarget?.actionType()).toEqual(AIActionType.MOVE_AND_MELEE_ATTACK);
    });

    it("Should go by diagonal close if can not attack", () => {
        const matrix: number[][] = new Array();
        matrix[3] = [2, 0, 0, 0];
        matrix[2] = [0, 0, 0, 0];
        matrix[1] = [0, 0, 0, 0];
        matrix[0] = [0, 0, 0, 1];
        /**
            End matrix
            [2, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 0],
        */
        const unit = stubSmallUnit(2, { x: 3, y: 0 });
        const closestTarget = findTarget(unit, new Grid(gridSettings, GridType.NORMAL), matrix, pathHelper);
        expect(closestTarget?.cellToMove()).toEqual({ x: 2, y: 1 });
        expect(closestTarget?.cellToAttack()).toBeUndefined();
        expect(closestTarget?.actionType()).toEqual(AIActionType.MOVE);
    });

    it("Should go closer to target if cannot attack", () => {
        const matrix: number[][] = new Array();
        matrix[3] = [0, 2, 0, 0];
        matrix[2] = [0, 0, 0, 0];
        matrix[1] = [0, 0, 0, 0];
        matrix[0] = [0, 0, 1, 0];
        /**
            End matrix
            [0, 2, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 0],
        */
        const unit = stubSmallUnit(1, { x: 2, y: 0 });
        const closestTarget = findTarget(unit, new Grid(gridSettings, GridType.NORMAL), matrix, pathHelper);
        expect(closestTarget?.cellToMove()).toEqual({ x: 2, y: 1 });
        expect(closestTarget?.cellToAttack()).toBeUndefined();
        expect(closestTarget?.actionType()).toEqual(AIActionType.MOVE);
    });

    it("Should go close to target horizontally if cannot attack ", () => {
        const matrix: number[][] = new Array();
        matrix[3] = [0, 0, 0, 0];
        matrix[2] = [2, 0, 0, 0];
        matrix[1] = [0, 0, 0, 1];
        matrix[0] = [0, 0, 0, 0];
        /**
           End matrix
           [0, 0, 0, 0],
           [2, 0, 0, 0],
           [0, 0, 1, 0],
           [0, 0, 0, 0],
        */
        const unit = stubSmallUnit(1, { x: 3, y: 1 });
        const closestTarget = findTarget(unit, new Grid(gridSettings, GridType.NORMAL), matrix, pathHelper);
        expect(closestTarget?.cellToMove()).toEqual({ x: 2, y: 1 });
        expect(closestTarget?.cellToAttack()).toBeUndefined();
        expect(closestTarget?.actionType()).toEqual(AIActionType.MOVE);
    });

    it("Should go around if cannot fly over water obstacle ", () => {
        const matrix: number[][] = new Array();
        matrix[3] = [2, 0, 0, 0];
        matrix[2] = [0, ObstacleType.WATER, ObstacleType.WATER, 0];
        matrix[1] = [0, ObstacleType.WATER, ObstacleType.WATER, 0];
        matrix[0] = [0, 0, 0, 1];
        /**
           End matrix
           [0, 0, 0, 0],
           [2, 0, 0, 0],
           [0, 0, 1, 0],
           [0, 0, 0, 0],
        */
        const unit = stubSmallUnit(1, { x: 3, y: 0 });
        const closestTarget = findTarget(unit, new Grid(gridSettings, GridType.NORMAL), matrix, pathHelper);
        expect(closestTarget?.cellToMove()).toEqual({ x: 2, y: 0 });
        expect(closestTarget?.cellToAttack()).toBeUndefined();
        expect(closestTarget?.actionType()).toEqual(AIActionType.MOVE);
    });

    // todo does not work because moves straig first and then by diagonal
    //
    // it('should go close to target if cannot attack 3', () => {
    //     const matrix: number[][] = [
    //         [0, 0, 0, 0],
    //         [0, 0, 0, 1],
    //         [0, 0, 0, 0],
    //         [2, 0, 0, 0],
    //     ];
    //     /**
    //      * End matrix
    //      * const matrix: number[][] = [
    //         [0, 0, 0, 0],
    //         [0, 0, 0, 0],
    //         [0, 0, 1, 0],
    //         [2, 0, 0, 0],
    //     ];
    //      */
    //     const unit = new UnitRepr(TeamType.UPPER, 2, 1, 1, false, true, { x: 3, y: 1 },
    //         getUnitConfig(TeamType.UPPER, "Life", "Peasant", 2)
    //     );
    //     const closestTarget = findTarget(unit, new Grid(4), matrix, pathHelper);
    //     expect(closestTarget?.cellToMove()).toEqual({ x: 2, y: 2 });
    //     expect(closestTarget?.cellToAttack()).toBeUndefined();
    //     expect(closestTarget?.actionType()).toEqual(AIActionType.MOVE);
    // });

    // it("Should do range attack if possible", () => {
    //     const matrix: number[][] = [
    //         [0, 0, 1, 0],
    //         [0, 0, 0, 0],
    //         [0, 0, 0, 0],
    //         [0, 2, 0, 0],
    //     ];
    //     const unit = new UnitRepr(
    //         "id",
    //         TeamType.UPPER,
    //         2,
    //         1,
    //         1,
    //         false,
    //         true,
    //         { x: 2, y: 0 },
    //         getUnitConfig(TeamType.UPPER, "Life", "Arbalester", 2),
    //     );
    //     const closestTarget = findTarget(unit, new Grid(4), matrix, pathHelper);
    //     expect(closestTarget?.cellToAttack()).toEqual({ x: 1, y: 3 });
    //     expect(closestTarget?.actionType()).toEqual(AIActionType.R_ATTACK);
    // });

    //     it("Should return null if no targets are reachable", () => {
    //         const matrix: number[][] = [
    //             [1, 1, 1],
    //             [1, 1, 1],
    //             [1, 1, 1],
    //         ];
    //         const unit = new UnitRepr("id", TeamType.UPPER, 1, 1, 1, false, true, { x: 1, y: 0 });
    //         const closestTarget = findTarget(unit, new Grid(3), matrix, pathHelper);
    //         expect(closestTarget?.cellToMove()).toBeUndefined();
    //     });
});

// describe("GetCallsForAttackerReturnExpectedPositions", () => {
//     it("Should return near cells for small unit and small attacker", () => {
//         /**
//             [0, 0, 0, 0, 1],
//             [0, 0, 0, 0, 0],
//             [x, x, x, 0, 0],
//             [x, 2, x, 0, 0],
//             [x, x, x, 0, 0],
//          */
//         const cellsForAttacker = getCellsForAttacker({ x: 1, y: 3 }, 5);
//         expect(cellsForAttacker.length).toEqual(8);
//         expect(cellsForAttacker).toContainEqual({ x: 0, y: 2 });
//         expect(cellsForAttacker).toContainEqual({ x: 0, y: 3 });
//         expect(cellsForAttacker).toContainEqual({ x: 0, y: 4 });
//         expect(cellsForAttacker).toContainEqual({ x: 1, y: 2 });
//         expect(cellsForAttacker).toContainEqual({ x: 1, y: 4 });
//         expect(cellsForAttacker).toContainEqual({ x: 2, y: 2 });
//         expect(cellsForAttacker).toContainEqual({ x: 2, y: 3 });
//         expect(cellsForAttacker).toContainEqual({ x: 2, y: 4 });
//     });

//     it("Should return proper cells for small unit and big attacker", () => {
//         /**
//             [0, 0, 0, 0, 1],
//             [0, 0, 0, 0, 0],
//             [0, x, x, x, 0],
//             [0, 2, 0, x, 0],
//             [0, 0, 0, x, 0],
//          */
//         const cellsForAttacker = getCellsForAttacker({ x: 1, y: 3 }, 5, true, false);
//         expect(cellsForAttacker.length).toEqual(5);
//         expect(cellsForAttacker).toContainEqual({ x: 1, y: 2 });
//         expect(cellsForAttacker).toContainEqual({ x: 2, y: 2 });
//         expect(cellsForAttacker).toContainEqual({ x: 3, y: 2 });
//         expect(cellsForAttacker).toContainEqual({ x: 3, y: 3 });
//         expect(cellsForAttacker).toContainEqual({ x: 3, y: 4 });
//     });

//     it("Should return near cells for big unit and small attacker", () => {
//         /**
//             [0, 0, 0, 0, 1],
//             [x, x, x, x, 0],
//             [x, -, -, x, 0],
//             [x, -, 2, x, 0],
//             [x, x, x, x, 0],
//          */
//         const cellsForAttacker = getCellsForAttacker({ x: 2, y: 3 }, 5, false);
//         // console.log(cellsForAttacker);
//         expect(cellsForAttacker.length).toEqual(12);
//         expect(cellsForAttacker).toContainEqual({ x: 0, y: 1 });
//         expect(cellsForAttacker).toContainEqual({ x: 1, y: 1 });
//         expect(cellsForAttacker).toContainEqual({ x: 2, y: 1 });
//         expect(cellsForAttacker).toContainEqual({ x: 3, y: 1 });
//         expect(cellsForAttacker).toContainEqual({ x: 3, y: 2 });
//         expect(cellsForAttacker).toContainEqual({ x: 3, y: 3 });
//         expect(cellsForAttacker).toContainEqual({ x: 3, y: 4 });
//         expect(cellsForAttacker).toContainEqual({ x: 2, y: 4 });
//         expect(cellsForAttacker).toContainEqual({ x: 1, y: 4 });
//         expect(cellsForAttacker).toContainEqual({ x: 0, y: 4 });
//         expect(cellsForAttacker).toContainEqual({ x: 0, y: 3 });
//         expect(cellsForAttacker).toContainEqual({ x: 0, y: 2 });
//     });

//     it("Should return near cells for big unit and big attacker", () => {
//         /**
//             [0, 0, 0, 0, 1, 0],
//             [0, x, x, x, x, 0],
//             [0, -, -, 0, x, 0],
//             [0, -, 2, 0, x, 0],
//             [0, 0, 0, 0, x, 0],
//             [0, x, x, x, x, 0],
//          */
//         const cellsForAttacker = getCellsForAttacker({ x: 2, y: 3 }, 6, false, false);
//         // console.log(cellsForAttacker);
//         expect(cellsForAttacker.length).toEqual(11);
//         expect(cellsForAttacker).toContainEqual({ x: 1, y: 1 });
//         expect(cellsForAttacker).toContainEqual({ x: 2, y: 1 });
//         expect(cellsForAttacker).toContainEqual({ x: 3, y: 1 });
//         expect(cellsForAttacker).toContainEqual({ x: 4, y: 1 });
//         expect(cellsForAttacker).toContainEqual({ x: 4, y: 2 });
//         expect(cellsForAttacker).toContainEqual({ x: 4, y: 3 });
//         expect(cellsForAttacker).toContainEqual({ x: 4, y: 4 });
//         expect(cellsForAttacker).toContainEqual({ x: 4, y: 5 });
//         expect(cellsForAttacker).toContainEqual({ x: 3, y: 5 });
//         expect(cellsForAttacker).toContainEqual({ x: 2, y: 5 });
//         expect(cellsForAttacker).toContainEqual({ x: 1, y: 5 });
//     });
// });

describe("MoveAndAttackForBigUnit", () => {
    const pathHelper = new PathHelper(
        // not needed for the getMovePath
        new GridSettings(GRID_SIZE, MAX_Y, MIN_Y, MAX_X, MIN_X, MOVEMENT_DELTA, UNIT_SIZE_DELTA),
    );

    it("Big unit should go close to target if cannot attack", () => {
        const matrix: number[][] = new Array();
        matrix[3] = [2, 0, 0, 0];
        matrix[2] = [0, 0, 0, 0];
        matrix[1] = [0, 0, 0, 1];
        matrix[0] = [0, 0, 0, 0];
        /**
            End matrix
            [2, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 0],
         */
        const unit = stubBigUnit(1, { x: 3, y: 1 });
        const closestTarget = findTarget(unit, new Grid(gridSettings, GridType.NORMAL), matrix, pathHelper);
        expect(closestTarget?.cellToMove()).toEqual({ x: 2, y: 1 });
        expect(closestTarget?.cellToAttack()).toBeUndefined();
        expect(closestTarget?.actionType()).toEqual(AIActionType.MOVE);
    });

    it("Big unit should go close to target and attack", () => {
        const matrix: number[][] = new Array();
        matrix[3] = [2, 0, 0, 0];
        matrix[2] = [0, 0, 0, 0];
        matrix[1] = [0, 0, 0, 1];
        matrix[0] = [0, 0, 0, 0];
        /**
            End matrix
            [2, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        */
        const unit = stubBigUnit(10, { x: 3, y: 1 });
        const closestTarget = findTarget(unit, new Grid(gridSettings, GridType.NORMAL), matrix, pathHelper);
        expect(closestTarget?.cellToMove()).toEqual({ x: 1, y: 2 });
        expect(closestTarget?.cellToAttack()).toEqual({ x: 0, y: 3 });
        expect(closestTarget?.actionType()).toEqual(AIActionType.MOVE_AND_MELEE_ATTACK);
    });

    // it("Big unit should attack if is near the target", () => {
    //     const matrix: number[][] = new Array();
    //     matrix[3] = [2, 0, 0, 0];
    //     matrix[2] = [0, 0, 1, 0];
    //     matrix[1] = [0, 0, 0, 0];
    //     matrix[0] = [0, 0, 0, 0];
    //     /**
    //         End matrix
    //         [2, 0, 0, 0],
    //         [0, 0, 1, 0],
    //         [0, 0, 0, 0],
    //         [0, 0, 0, 0],
    //     */
    //     const unit = stubBigUnit(10, { x: 2, y: 2 });
    //     const closestTarget = findTarget(unit, new Grid(gridSettings, GridType.NORMAL), matrix, pathHelper);
    //     expect(closestTarget?.cellToMove()).toEqual({ x: 2, y: 2 });
    //     expect(closestTarget?.cellToAttack()).toEqual({ x: 0, y: 3 });
    //     expect(closestTarget?.actionType()).toEqual(AIActionType.MELEE_ATTACK);
    // });
});

function stubSmallUnit(steps: number, baseCell: HoCMath.XY): UnitRepr {
    return new UnitRepr("id", TeamType.UPPER, steps, 1, 1, true, true, baseCell, [baseCell], AttackType.MELEE);
}

function stubBigUnit(steps: number, baseCell: HoCMath.XY): UnitRepr {
    return new UnitRepr(
        "id",
        TeamType.UPPER,
        steps,
        1,
        1,
        true,
        true,
        baseCell,
        [
            baseCell,
            { x: baseCell.x - 1, y: baseCell.y },
            { x: baseCell.x - 1, y: baseCell.y - 1 },
            { x: baseCell.x, y: baseCell.y - 1 },
        ],
        AttackType.MELEE,
    );
}

class UnitRepr implements IUnitAIRepr {
    public constructor(
        public id: string,
        public team: TeamType,
        public steps: number, // distance the unit can travel
        public speed: number, // inititive
        public size: number,
        public isFlying: boolean,
        public isSmall: boolean,
        public baseCell: HoCMath.XY,
        public cells: HoCMath.XY[],
        public attackType: AttackType,
        public unitProperties?: UnitProperties, // should not be nullable, just for tests
    ) {
        // public movePath?: IMovePath, // the IMovePath that is returned from PathHelper.getMovePath if provided
    }

    public getId(): string {
        return this.id;
    }

    public getTeam(): TeamType {
        return this.team;
    }

    public getSteps(): number {
        return this.steps;
    }

    public getSpeed(): number {
        return this.speed;
    }

    public getSize(): number {
        return this.size;
    }

    public canFly(): boolean {
        return this.isFlying;
    }

    public isSmallSize(): boolean {
        return this.isSmall;
    }

    public getBaseCell(): HoCMath.XY | undefined {
        return this.baseCell;
    }

    public getCells(): HoCMath.XY[] {
        return this.cells;
    }

    public getAllProperties(): UnitProperties | undefined {
        return this.unitProperties;
    }
    public getAttackType(): AttackType {
        return this.attackType;
    }
}
