import { expect, test } from "bun:test";
import {
    GridConstants,
    GridMath,
    GridSettings,
    HoCConfig,
    Spell,
    SpellHelper,
    TeamVals,
    type TeamType,
} from "@heroesofcrypto/common";
import { defaultSummonCell } from "./defaultSummonCell";

const grid = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const wolves = () => new Spell({ spellProperties: HoCConfig.getSpellConfig("Nature", "Summon Wolves"), amount: 1 });
const board = () => Array.from({ length: 16 }, () => Array<number>(16).fill(0));
const caster = (team: TeamType, x = 7, y = 7) => ({
    getTeam: () => team,
    getCells: () => [{ x, y }],
});

test.each([TeamVals.LEFT, TeamVals.RIGHT].flatMap((team) => [false, true].map((side) => ({ team, side }))))(
    "team $team, side=$side: the entire Wolf body appears in front, independent of camera mirroring",
    ({ team, side }) => {
        const matrix = board();
        matrix[7][7] = team;
        const unit = caster(team);
        const spell = wolves();
        const seat = defaultSummonCell(spell, matrix, grid, unit, side)!;
        const body = GridMath.getFootprintCellsForAnchor(seat, 2, 1);
        expect(body.every((cell) => GridMath.advanceDeltaBetween(team, { x: 7, y: 7 }, cell, side) > 0)).toBe(true);
        expect(SpellHelper.canCastSummon(spell, matrix, seat, 2, 1)).toBe(true);
        expect(defaultSummonCell(spell, matrix, grid, unit, side)).toEqual(seat);
        expect(matrix[7][7]).toBe(team);
    },
);

test("a blocked front falls back to a full legal body; a surrounded caster has no seat", () => {
    const matrix = board();
    const unit = caster(TeamVals.LEFT);
    for (let y = 7; y < 16; y++) matrix[y].fill(1);
    const spell = wolves();
    const seat = defaultSummonCell(spell, matrix, grid, unit, false)!;
    expect(seat.y).toBe(6);
    expect(SpellHelper.canCastSummon(spell, matrix, seat, 2, 1)).toBe(true);
    matrix.forEach((row) => row.fill(1));
    expect(defaultSummonCell(spell, matrix, grid, unit, false)).toBeUndefined();
});

test.each([0, 15])("edge %i never produces an out-of-bounds body", (x) => {
    const matrix = board();
    matrix[7][x] = TeamVals.LEFT;
    const spell = wolves();
    const seat = defaultSummonCell(spell, matrix, grid, caster(TeamVals.LEFT, x), true)!;
    expect(SpellHelper.canCastSummon(spell, matrix, seat, 2, 1)).toBe(true);
});

test("the forward body clears a large caster's entire footprint", () => {
    const matrix = board();
    const cells = GridMath.getFootprintCellsForAnchor({ x: 7, y: 7 }, 2, 2);
    for (const cell of cells) matrix[cell.y][cell.x] = TeamVals.LEFT;
    const unit = { getTeam: () => TeamVals.LEFT, getCells: () => cells };
    const seat = defaultSummonCell(wolves(), matrix, grid, unit, false)!;
    expect(GridMath.getFootprintCellsForAnchor(seat, 2, 1).every((cell) => cell.y > 7)).toBe(true);
});
