import {
    FightProperties,
    FightStateManager,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    PathHelper,
    TeamVals,
} from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import { PlayTransientCellKind } from "../api/play_protocol";
import {
    installRankedTransientTerrain,
    reconcileRankedTransientTerrain,
    syncRankedTransientTerrain,
    type RankedTerrainJournalEntry,
} from "./rankedTransientTerrain";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

const occupiedUnits: readonly [id: string, team: number, cells: readonly [number, number][]][] = [
    ["wolf", TeamVals.LEFT, [[10, 5]]],
    ["berserker", TeamVals.LEFT, [[10, 7]]],
    ["trent", TeamVals.LEFT, [[11, 3]]],
    ["tiger", TeamVals.LEFT, [[8, 5]]],
    ["crusader", TeamVals.LEFT, [[10, 6]]],
    [
        "dragon",
        TeamVals.LEFT,
        [
            [8, 13],
            [9, 13],
            [8, 12],
            [9, 12],
        ],
    ],
    ["scavenger", TeamVals.RIGHT, [[15, 14]]],
    ["blacksmith", TeamVals.RIGHT, [[10, 14]]],
    ["pikeman", TeamVals.RIGHT, [[14, 14]]],
    ["beholder", TeamVals.RIGHT, [[15, 15]]],
    ["zena", TeamVals.RIGHT, [[14, 15]]],
    [
        "angel",
        TeamVals.RIGHT,
        [
            [6, 15],
            [7, 15],
            [6, 14],
            [7, 14],
        ],
    ],
    ["split-scavenger-1", TeamVals.RIGHT, [[14, 12]]],
    ["split-scavenger-2", TeamVals.RIGHT, [[12, 13]]],
];

const journalEntry = (sequence: number, events: unknown, team: number = TeamVals.LEFT): RankedTerrainJournalEntry => ({
    sequence,
    team,
    eventsJson: JSON.stringify(events),
});

const vinePlacementEntry = (): RankedTerrainJournalEntry => ({
    sequence: 68,
    team: TeamVals.LEFT,
    eventsJson: JSON.stringify([
        {
            type: "vine_placed",
            casterId: "trent",
            targetId: "blacksmith",
            cells: [
                { x: 11, y: 4 },
                { x: 11, y: 5 },
                { x: 11, y: 6 },
                { x: 11, y: 7 },
                { x: 11, y: 8 },
                { x: 10, y: 9 },
                { x: 10, y: 10 },
                { x: 10, y: 11 },
                { x: 10, y: 12 },
                { x: 10, y: 13 },
                { x: 10, y: 14 },
            ],
            lapsRemaining: 3,
            snareResisted: true,
        },
    ]),
});

const scavengerCanReachAttackCell = (fightProperties: FightProperties): boolean => {
    FightStateManager.getInstance().setFightProperties(fightProperties);
    const grid = new Grid(gridSettings, GridVals.LAVA_CENTER);
    for (const [id, team, cells] of occupiedUnits) {
        grid.occupyCells(
            cells.map(([x, y]) => ({ x, y })),
            id,
            team,
            1,
            false,
            false,
        );
    }
    grid.rebuildAggrBoards(new Map(occupiedUnits.map(([id]) => [id, 1])));

    const paths = new PathHelper(gridSettings).getMovePath(
        { x: 15, y: 14 },
        grid.getMatrix(),
        6,
        grid.getAggrMatrixByTeam(TeamVals.LEFT),
        false,
        true,
        false,
        false,
    ).knownPaths;
    return paths.has((10 << 4) | 12);
};

describe("reconcileRankedTransientTerrain", () => {
    test("restores the Vine Throw penalty that made the ranked Scavenger attack unreachable", () => {
        const previousFight = FightStateManager.getInstance().getFightProperties();
        try {
            const fightProperties = new FightProperties();
            expect(scavengerCanReachAttackCell(fightProperties)).toBe(true);

            reconcileRankedTransientTerrain(fightProperties, [vinePlacementEntry()]);

            expect(fightProperties.getVines().has({ x: 10, y: 12 })).toBe(true);
            expect(scavengerCanReachAttackCell(fightProperties)).toBe(false);
        } finally {
            FightStateManager.getInstance().setFightProperties(previousFight);
        }
    });

    test("removes expired terrain while tolerating malformed journal entries", () => {
        const fightProperties = new FightProperties();
        reconcileRankedTransientTerrain(fightProperties, [
            vinePlacementEntry(),
            { sequence: 69, team: TeamVals.LEFT, eventsJson: "not-json" },
            {
                sequence: 70,
                team: TeamVals.LEFT,
                eventsJson: JSON.stringify([{ type: "vine_expired", cells: [{ x: 10, y: 12 }] }]),
            },
        ]);

        expect(fightProperties.getVines().has({ x: 10, y: 12 })).toBe(false);
        expect(fightProperties.getVines().has({ x: 10, y: 13 })).toBe(true);
    });

    test("sorts journal rows without mutating the snapshot-owned array", () => {
        const fightProperties = new FightProperties();
        const journal = [
            journalEntry(70, [{ type: "vine_expired", cells: [{ x: 3, y: 4 }] }]),
            journalEntry(68, [{ type: "vine_placed", cells: [{ x: 3, y: 4 }], lapsRemaining: 3 }]),
        ];

        reconcileRankedTransientTerrain(fightProperties, journal);

        expect(journal.map((entry) => entry.sequence)).toEqual([70, 68]);
        expect(fightProperties.getVines().has({ x: 3, y: 4 })).toBe(false);
    });

    test("preserves event order within one journal row", () => {
        const fightProperties = new FightProperties();
        reconcileRankedTransientTerrain(fightProperties, [
            journalEntry(8, [
                { type: "vine_placed", cells: [{ x: 4, y: 5 }], lapsRemaining: 2 },
                { type: "vine_expired", cells: [{ x: 4, y: 5 }] },
            ]),
        ]);

        expect(fightProperties.getVines().size()).toBe(0);
    });

    test("a newer Vine Throw refreshes lifetime and ownership after an earlier expiry", () => {
        const fightProperties = new FightProperties();
        reconcileRankedTransientTerrain(fightProperties, [
            journalEntry(12, [{ type: "vine_placed", cells: [{ x: 6, y: 7 }], lapsRemaining: 5 }], TeamVals.RIGHT),
            journalEntry(11, [{ type: "vine_expired", cells: [{ x: 6, y: 7 }] }]),
            journalEntry(10, [{ type: "vine_placed", cells: [{ x: 6, y: 7 }], lapsRemaining: 1 }]),
        ]);

        expect(fightProperties.getVines().toJSON()).toEqual([{ x: 6, y: 7, l: 5, t: TeamVals.RIGHT }]);
        expect(fightProperties.getVines().snares({ x: 6, y: 7 }, TeamVals.LEFT)).toBe(true);
        expect(fightProperties.getVines().snares({ x: 6, y: 7 }, TeamVals.RIGHT)).toBe(false);
    });

    test("expires only the named vine cells", () => {
        const fightProperties = new FightProperties();
        reconcileRankedTransientTerrain(fightProperties, [
            journalEntry(1, [
                {
                    type: "vine_placed",
                    cells: [
                        { x: 1, y: 2 },
                        { x: 2, y: 3 },
                        { x: 3, y: 4 },
                    ],
                    lapsRemaining: 3,
                },
            ]),
            journalEntry(2, [
                {
                    type: "vine_expired",
                    cells: [
                        { x: 1, y: 2 },
                        { x: 3, y: 4 },
                    ],
                },
            ]),
        ]);

        expect(fightProperties.getVines().cells()).toEqual([{ x: 2, y: 3 }]);
    });

    test("rebuilds fire walls and selectively removes expired cells", () => {
        const fightProperties = new FightProperties();
        reconcileRankedTransientTerrain(fightProperties, [
            journalEntry(20, [
                {
                    type: "fire_wall_placed",
                    cells: [
                        { x: 7, y: 8 },
                        { x: 8, y: 9 },
                    ],
                    lapsRemaining: 4,
                },
            ]),
            journalEntry(21, [{ type: "fire_wall_expired", cells: [{ x: 7, y: 8 }] }]),
        ]);

        expect(fightProperties.getFireWalls().has({ x: 7, y: 8 })).toBe(false);
        expect(fightProperties.getFireWalls().has({ x: 8, y: 9 })).toBe(true);
        expect(fightProperties.getFireWalls().toJSON()[0]).toMatchObject({ x: 8, y: 9, l: 4 });
    });

    // Live report: a Smoke cast vanished from the ranked board after a full hydrate. The journal rebuild
    // handled vines and fire walls but skipped smoke, so the wiped store stayed empty.
    test("rebuilds smoke clouds and removes dispelled or expired cells", () => {
        const fightProperties = new FightProperties();
        reconcileRankedTransientTerrain(fightProperties, [
            journalEntry(40, [
                {
                    type: "smoke_placed",
                    casterId: "mage",
                    cells: [
                        { x: 5, y: 5 },
                        { x: 6, y: 5 },
                        { x: 5, y: 6 },
                        { x: 6, y: 6 },
                    ],
                    lapsRemaining: 3,
                },
            ]),
            journalEntry(41, [{ type: "smoke_dispel", cells: [{ x: 6, y: 6 }] }]),
            journalEntry(42, [{ type: "smoke_expired", cells: [{ x: 5, y: 6 }] }]),
        ]);

        const smoke = fightProperties.getSmokeClouds();
        expect(smoke.has({ x: 5, y: 5 })).toBe(true);
        expect(smoke.has({ x: 6, y: 5 })).toBe(true);
        expect(smoke.has({ x: 5, y: 6 })).toBe(false);
        expect(smoke.has({ x: 6, y: 6 })).toBe(false);
        expect(smoke.toJSON()).toContainEqual({ x: 5, y: 5, l: 3 });
    });

    test("duplicate journal delivery is idempotent in reconstructed terrain state", () => {
        const fightProperties = new FightProperties();
        const placement = journalEntry(30, [
            {
                type: "vine_placed",
                cells: [
                    { x: 9, y: 10 },
                    { x: 10, y: 11 },
                ],
                lapsRemaining: 2,
            },
            {
                type: "fire_wall_placed",
                cells: [{ x: 11, y: 12 }],
                lapsRemaining: 2,
            },
        ]);

        reconcileRankedTransientTerrain(fightProperties, [placement, placement]);
        reconcileRankedTransientTerrain(fightProperties, [placement]);

        expect(fightProperties.getVines().toJSON()).toEqual([
            { x: 9, y: 10, l: 2, t: TeamVals.LEFT },
            { x: 10, y: 11, l: 2, t: TeamVals.LEFT },
        ]);
        expect(fightProperties.getFireWalls().size()).toBe(1);
    });

    test("keeps locally replayed terrain when an older snapshot has no journal tail", () => {
        const fightProperties = new FightProperties();
        fightProperties.getVines().add({ x: 12, y: 13 }, 2, TeamVals.RIGHT);
        fightProperties.getFireWalls().add({ x: 13, y: 14 }, 2);

        reconcileRankedTransientTerrain(fightProperties, undefined);
        reconcileRankedTransientTerrain(fightProperties, []);

        expect(fightProperties.getVines().has({ x: 12, y: 13 })).toBe(true);
        expect(fightProperties.getFireWalls().has({ x: 13, y: 14 })).toBe(true);
    });

    test("ignores non-array JSON, invalid event shapes, bad cells, and bad lifetimes", () => {
        const fightProperties = new FightProperties();
        reconcileRankedTransientTerrain(fightProperties, [
            journalEntry(1, { type: "vine_placed", cells: [{ x: 1, y: 1 }], lapsRemaining: 2 }),
            journalEntry(2, [null, 7, {}, { type: "unit_moved", cells: [] }]),
            journalEntry(3, [{ type: "vine_placed", lapsRemaining: 2 }]),
            journalEntry(4, [{ type: "vine_placed", cells: [{ x: "1", y: 2 }], lapsRemaining: 2 }]),
            journalEntry(5, [{ type: "vine_placed", cells: [{ x: 1, y: 2 }], lapsRemaining: 0 }]),
            journalEntry(6, [
                {
                    type: "fire_wall_placed",
                    cells: [{ x: 2, y: Number.POSITIVE_INFINITY }],
                    lapsRemaining: 2,
                },
            ]),
            { sequence: 7, team: TeamVals.LEFT, eventsJson: "[" },
        ]);

        expect(fightProperties.getVines().size()).toBe(0);
        expect(fightProperties.getFireWalls().size()).toBe(0);
    });
});

describe("installRankedTransientTerrain", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        for (const [width, height] of [
            [1, 1],
            [1, 2],
            [2, 1],
            [2, 2],
        ]) {
            for (const modern of [false, true]) {
                test(`${modern ? "snapshot" : "journal"}: team ${team} clears the occupied ${width}x${height} footprint`, () => {
                    const fightProperties = new FightProperties();
                    const cells = GridMath.getFootprintCellsForAnchor({ x: 6, y: 6 }, width, height);
                    const units = [{ team, dead: false, placed: true, cells }];
                    const neighbor = { x: 7, y: 7 };
                    const transientCells = [
                        ...[...cells, neighbor].map((cell) => ({
                            kind: PlayTransientCellKind.SMOKE,
                            ...cell,
                            lapsRemaining: 3,
                            team: 0,
                        })),
                        { kind: PlayTransientCellKind.VINE, ...cells[0], lapsRemaining: 2, team },
                        { kind: PlayTransientCellKind.FIRE_WALL, ...cells[0], lapsRemaining: 2, team: 0 },
                    ];
                    const snapshot = modern
                        ? { units, transientCells, transientCellsCount: transientCells.length }
                        : {
                              units,
                              journalTail: [
                                  journalEntry(
                                      1,
                                      [
                                          { type: "smoke_placed", cells: [...cells, neighbor], lapsRemaining: 3 },
                                          { type: "vine_placed", cells: [cells[0]], lapsRemaining: 2 },
                                          { type: "fire_wall_placed", cells: [cells[0]], lapsRemaining: 2 },
                                      ],
                                      team,
                                  ),
                              ],
                          };
                    const before = JSON.stringify(snapshot);
                    // A later ranked update must not restore occupied smoke from the same stale snapshot.
                    syncRankedTransientTerrain(fightProperties, snapshot);
                    syncRankedTransientTerrain(fightProperties, snapshot);

                    expect(fightProperties.getSmokeClouds().toJSON()).toEqual([{ ...neighbor, l: 3 }]);
                    expect(fightProperties.getVines().has(cells[0])).toBe(true);
                    expect(fightProperties.getFireWalls().has(cells[0])).toBe(true);
                    expect(JSON.stringify(snapshot)).toBe(before);
                });
            }
        }
    }

    test("dead and unplaced units do not disperse snapshot smoke", () => {
        const fightProperties = new FightProperties();
        const deadCell = { x: 4, y: 4 };
        const benchCell = { x: 5, y: 5 };
        syncRankedTransientTerrain(fightProperties, {
            units: [
                { dead: true, placed: true, cells: [deadCell] },
                { dead: false, placed: false, cells: [benchCell] },
            ],
            transientCellsCount: 2,
            transientCells: [deadCell, benchCell].map((cell) => ({
                kind: PlayTransientCellKind.SMOKE,
                ...cell,
                lapsRemaining: 3,
                team: 0,
            })),
        });
        expect(fightProperties.getSmokeClouds().cells()).toEqual([deadCell, benchCell]);
    });

    test("replaces every transient store with the snapshot's cells, including a cast older than the journal", () => {
        const fightProperties = new FightProperties();
        // Stale local state a hydrate would otherwise have wiped — or, worse, left behind after the server
        // cleared it.
        fightProperties.getSmokeClouds().add({ x: 1, y: 1 }, 2);
        fightProperties.getVines().add({ x: 2, y: 2 }, 3, TeamVals.LEFT);
        fightProperties.getFireWalls().add({ x: 3, y: 3 }, 1);

        installRankedTransientTerrain(fightProperties, [
            { kind: PlayTransientCellKind.SMOKE, x: 5, y: 5, lapsRemaining: 4, team: 0 },
            { kind: PlayTransientCellKind.SMOKE, x: 6, y: 5, lapsRemaining: 1, team: 0 },
            { kind: PlayTransientCellKind.VINE, x: 10, y: 12, lapsRemaining: 2, team: TeamVals.RIGHT },
            { kind: PlayTransientCellKind.FIRE_WALL, x: 8, y: 9, lapsRemaining: 3, team: 0 },
            // A dead cell the server should never send; ignored rather than installed.
            { kind: PlayTransientCellKind.SMOKE, x: 7, y: 7, lapsRemaining: 0, team: 0 },
            { kind: 99, x: 0, y: 0, lapsRemaining: 5, team: 0 },
        ]);

        expect(fightProperties.getSmokeClouds().toJSON()).toEqual([
            { x: 5, y: 5, l: 4 },
            { x: 6, y: 5, l: 1 },
        ]);
        expect(fightProperties.getSmokeClouds().has({ x: 1, y: 1 })).toBe(false);
        expect(fightProperties.getSmokeClouds().has({ x: 7, y: 7 })).toBe(false);
        expect(fightProperties.getVines().toJSON()).toEqual([{ x: 10, y: 12, l: 2, t: TeamVals.RIGHT }]);
        expect(fightProperties.getFireWalls().has({ x: 3, y: 3 })).toBe(false);
        expect(fightProperties.getFireWalls().toJSON()[0]).toMatchObject({ x: 8, y: 9, l: 3 });
    });

    test("an empty snapshot from a server that carries the cells clears everything", () => {
        const fightProperties = new FightProperties();
        fightProperties.getSmokeClouds().add({ x: 1, y: 1 }, 2);

        syncRankedTransientTerrain(fightProperties, { transientCellsCount: 0, transientCells: undefined });

        expect(fightProperties.getSmokeClouds().size()).toBe(0);
    });

    test("an older server without the cells falls back to the journal rebuild", () => {
        const fightProperties = new FightProperties();

        syncRankedTransientTerrain(fightProperties, {
            journalTail: [journalEntry(40, [{ type: "smoke_placed", cells: [{ x: 5, y: 5 }], lapsRemaining: 3 }])],
        });

        expect(fightProperties.getSmokeClouds().has({ x: 5, y: 5 })).toBe(true);
    });
});
