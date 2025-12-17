
// Diagnostic Script to verify Grid and PathHelper behaviors for Large Units
// Run with: bun run scripts/verify_large_unit_coords.ts

import { Grid } from "../game/heroes-of-crypto-common/src/grid/grid";
import { PathHelper } from "../game/heroes-of-crypto-common/src/grid/path_helper";
import { GridSettings } from "../game/heroes-of-crypto-common/src/grid/grid_settings";
import { GridMath } from "../game/heroes-of-crypto-common/src/grid/grid_math";
import { UnitProperties } from "../game/heroes-of-crypto-common/src/units/unit_properties";

// Mock GridSettings
const gs = new GridSettings(32, 600); // 32 cells, 600 size
const grid = new Grid(gs, 1); // Type 1
const pathHelper = new PathHelper(gs);

// Setup Large Unit at (5,5) - Bottom Left convention ??
// If BL is (5,5), checks (5,5), (6,5), (5,6), (6,6)
const unitPos = { x: 5, y: 5 };
// Occupy cells for Large Unit
const occupied = [
    { x: 5, y: 5 }, { x: 6, y: 5 },
    { x: 5, y: 6 }, { x: 6, y: 6 }
];
grid.occupyCells(occupied, "Unit1", 1, 1, false, false);

// Setup Enemy at (10, 5) - Small
grid.occupyCell({ x: 10, y: 5 }, "Enemy1", 2, 1, false, false);

console.log("--- Test: calculateClosestAttackFrom ---");
const mousePos = GridMath.getPositionForCell({ x: 10, y: 5 }, gs.getMinX(), gs.getStep(), gs.getHalfStep())!;
// Attack range 1.
// Large Unit needs to be adjacent.
// If Unit1 moves to (9,5). Occupies (9,5)-(10,6)? No (9,5)-(10,5)-(9,6)-(10,6).
// Overlap with Enemy at (10,5)? YES.
// So (9,5) is invalid.
// Try (8,5). Occupies (8,5)-(9,5)-(8,6)-(9,6). No overlap. Adjacent to (10,5)? (9,5) is adj to (10,5).
// So effective attack range is 1 cell gap?
// Let's see what calculateClosestAttackFrom returns.

// Mock Unit properties
const props = { size: 2, range: 1 } as any;

// We need "availableAttackCells" or similar if we were calling internal logic, 
// but calculateClosestAttackFrom does it all? 
// No, it takes availableAttackCells as arg.
// Wait, in Sandbox it is called with availableAttackCells.
// Sandbox calls unit.getAttackRange() -> pathHelper.getAttackCells().

// Let's reproduce Sandbox flow:
// 1. Get Attack Cells for Unit1 at (5,5).
// 2. Filter reachable? No, Sandbox uses `currentActiveunit.getAttackCells(true)`.

console.log("Skipped full simulation, analyzing code instead.");
