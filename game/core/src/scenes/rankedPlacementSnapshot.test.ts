import { TeamVals } from "@heroesofcrypto/common";
import { describe, expect, spyOn, test } from "bun:test";

import type { AuthoritativeGameSnapshot, AuthoritativeUnitState } from "../game_action_transport";
import { RankedPlayScene } from "./RankedPlayScene";
import { Sandbox } from "./Sandbox";

/**
 * The drop glitch is not the pure compare. It is applyAuthoritativeSnapshot deciding to destroy every
 * sprite. These drive that method on a stub scene: the board methods are real, the Pixi tail is not.
 */

interface LivePlacement {
    cells: { x: number; y: number }[];
    amountAlive: number;
}

const liveUnit = (id: string, state: LivePlacement, team = TeamVals.LEFT) => ({
    getId: () => id,
    getTeam: () => team,
    getAmountAlive: () => state.amountAlive,
    getCells: () => state.cells,
});

const unit = (
    id: string,
    cells: { x: number; y: number }[],
    overrides: Partial<AuthoritativeUnitState> = {},
): AuthoritativeUnitState =>
    ({
        id,
        team: TeamVals.LEFT,
        name: "Unknown",
        creatureId: 0,
        amountAlive: 10,
        amountDied: 0,
        hp: 10,
        maxHp: 10,
        attackType: 0,
        size: 1,
        baseCell: cells[0] ?? { x: 0, y: 0 },
        cells,
        initiative: 5,
        morale: 0,
        dead: false,
        placed: cells.length > 0,
        stackPower: 1,
        rangeShots: 0,
        luck: 0,
        onHourglass: false,
        ...overrides,
    }) as AuthoritativeUnitState;

const snapshot = (
    units: AuthoritativeUnitState[],
    sequence: number,
    overrides: Partial<AuthoritativeGameSnapshot> = {},
): AuthoritativeGameSnapshot =>
    ({
        gameId: "placement-test",
        phase: 3,
        gridType: 1,
        currentLap: 0,
        fightStarted: false,
        fightFinished: false,
        currentUnitId: "",
        currentTurnTeam: TeamVals.LEFT,
        latestSequence: sequence,
        narrowingLayers: 0,
        centerDried: false,
        viewerTeam: TeamVals.LEFT,
        units,
        ...overrides,
    }) as AuthoritativeGameSnapshot;

const occupy = (cells: { x: number; y: number }[], id: string): Map<string, string> =>
    new Map(cells.map((cell) => [`${cell.x}:${cell.y}`, id]));

type Barrel = NonNullable<AuthoritativeGameSnapshot["artifactBarrels"]>[number];

const barrelsSnapshot = (barrels: Barrel[]): Partial<AuthoritativeGameSnapshot> => ({
    artifactBarrels: barrels,
    artifactBarrelsCount: barrels.length,
});

const boot = (cells: { x: number; y: number }[] = [{ x: 1, y: 1 }]) => {
    const state: LivePlacement = { cells, amountAlive: 10 };
    const occupants = occupy(cells, "a");
    let hydrates = 0;
    let occupancyRepairs = 0;
    // The board's barrels. A full hydrate and the terrain sync both install the snapshot's list.
    let liveBarrels: Barrel[] = [];
    let barrelSyncs = 0;
    const installBarrels = (snapshot: AuthoritativeGameSnapshot) => {
        if (snapshot.artifactBarrelsCount !== undefined) liveBarrels = [...(snapshot.artifactBarrels ?? [])];
    };
    const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
        fullReplayPlaybackActive: false,
        lastAuthoritativeSequence: -1,
        lastBoardSignature: "not-a-board",
        lastPlacementUnitIdsKey: "",
        pendingPlacementSaves: 0,
        lastPlacementStateByUnitId: new Map<string, string>(),
        viewerTeam: TeamVals.LEFT,
        sandboxCoop: false,
        sc_visibleState: undefined,
        unitsHolder: {
            getAllUnits: () => new Map([["a", liveUnit("a", state)]]),
        },
        grid: {
            getOccupantUnitId: (cell: { x: number; y: number }) => occupants.get(`${cell.x}:${cell.y}`),
            getArtifactBarrels: () => liveBarrels.map((barrel) => ({ ...barrel, cell: { ...barrel.cell } })),
        },
        rememberStatusSnapshot() {},
        processDebuffPops() {},
        applyRankedDamageStatistics() {},
        applyAuthoritativeSceneLog() {},
        isPlayingActionAnimation: () => false,
        applyRankedTimer() {},
        applyRankedSnapshotMetadata() {},
        applyAuthoritativeNarrowing() {},
        renderNewlyAppliedArmageddon() {},
        renderNewlyAppliedPyre() {},
        renderNewlyAppliedMorale() {},
        renderNewlyAppliedPoison() {},
        shatterNewlyDeadUnits() {},
        capturePlacementSelection: () => ({ hasActiveSelection: false }),
        hydrateSceneState() {
            hydrates += 1;
        },
        applyScatteredMountainsFromSnapshot(snapshot: AuthoritativeGameSnapshot) {
            installBarrels(snapshot);
        },
        syncArtifactBarrelVisuals() {
            barrelSyncs += 1;
        },
        refreshUnits() {},
        syncRankedUnitMechanicalEffects: () => false,
        healRankedGridOccupancy() {
            occupancyRepairs += 1;
        },
        applyRankedUnitStats() {},
        reconcileAuraEffectsFromSnapshot() {},
        syncRankedVisibleTurnState() {},
        applyRankedFightStats() {},
        getCurrentActiveUnit: () => undefined,
    }) as unknown as {
        applyAuthoritativeSnapshot: RankedPlayScene["applyAuthoritativeSnapshot"];
        lastPlacementUnitIdsKey: string;
        lastAuthoritativeSequence: number;
        lastPlacementStateByUnitId: Map<string, string>;
        noteOptimisticPlacement: (submission: Promise<void>) => void;
        noteOptimisticBarrelPlacement: () => void;
    };

    const moveTo = (next: { x: number; y: number }[]) => {
        state.cells = next;
        occupants.clear();
        for (const [key, id] of occupy(next, "a")) occupants.set(key, id);
    };

    return {
        scene,
        state,
        moveTo,
        beginSave: () => {
            const submission = Promise.withResolvers<void>();
            scene.noteOptimisticPlacement(submission.promise);
            return submission;
        },
        hydrates: () => hydrates,
        occupancyRepairs: () => occupancyRepairs,
        barrels: () => liveBarrels,
        barrelSyncs: () => barrelSyncs,
        /** A local barrel drop, drawn before the server answers. */
        moveBarrelLocally: (barrel: Barrel) => {
            liveBarrels = [...liveBarrels.filter((entry) => entry.index !== barrel.index), barrel];
        },
    };
};

describe("ranked placement snapshots", () => {
    test.each([false, true])(
        "a duplicate server board cannot repair away a newer optimistic drop (skip rebuild: %s)",
        (skipBoardRebuild) => {
            const { scene, moveTo, beginSave, hydrates, occupancyRepairs } = boot();
            scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 1, y: 1 }])], 1));

            moveTo([{ x: 4, y: 4 }]);
            beginSave();
            scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 1, y: 1 }])], 2), {
                skipBoardRebuild,
            });

            expect(hydrates()).toBe(1);
            expect(occupancyRepairs()).toBe(0);
            expect(scene.lastAuthoritativeSequence).toBe(2);
        },
    );

    test("the first board is built, and a repeat of it is not", () => {
        const { scene, hydrates } = boot();
        const opening = snapshot([unit("a", [{ x: 1, y: 1 }])], 1);

        scene.applyAuthoritativeSnapshot(opening);
        scene.applyAuthoritativeSnapshot(opening);

        expect(hydrates()).toBe(1);
        expect(scene.lastAuthoritativeSequence).toBe(1);
    });

    test("an unchanged server board repairs a drop after its submission fails", async () => {
        const { scene, moveTo, beginSave, hydrates, occupancyRepairs } = boot();
        const opening = snapshot([unit("a", [{ x: 1, y: 1 }])], 1);
        scene.applyAuthoritativeSnapshot(opening);

        moveTo([{ x: 4, y: 4 }]);
        const save = beginSave();
        scene.applyAuthoritativeSnapshot(opening);
        expect(hydrates()).toBe(1);

        save.reject(new Error("connection lost"));
        await expect(save.promise).rejects.toThrow("connection lost");
        scene.applyAuthoritativeSnapshot(opening);

        expect(hydrates()).toBe(2);
        expect(occupancyRepairs()).toBe(0);
    });

    test("an acknowledgement preserves a newer pending drop of the same stack", async () => {
        const { scene, moveTo, beginSave, hydrates } = boot();
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 1, y: 1 }])], 1));

        moveTo([{ x: 4, y: 4 }]);
        const firstSave = beginSave();
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 4, y: 4 }])], 2));
        expect(hydrates()).toBe(1);

        moveTo([{ x: 6, y: 6 }]);
        const secondSave = beginSave();
        firstSave.resolve();
        await firstSave.promise;
        const remembered = scene.lastPlacementUnitIdsKey;
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 4, y: 4 }])], 3));
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 1, y: 1 }])], 4));

        expect(hydrates()).toBe(1);
        expect(scene.lastPlacementUnitIdsKey).toBe(remembered);
        expect(scene.lastAuthoritativeSequence).toBe(4);

        secondSave.resolve();
        await secondSave.promise;
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 6, y: 6 }])], 5));
        expect(hydrates()).toBe(1);
        expect(scene.lastPlacementUnitIdsKey).not.toBe(remembered);
    });

    test("a forced resync repairs a rejected drop while its response is being handled", () => {
        const { scene, moveTo, beginSave, hydrates } = boot();
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 1, y: 1 }])], 1));
        moveTo([{ x: 4, y: 4 }]);
        beginSave();

        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 1, y: 1 }])], 2), {
            forceBoardRebuild: true,
        });
        expect(hydrates()).toBe(2);
    });

    test("a locked board reconciles to the server even while a placement save is pending", () => {
        const { scene, moveTo, beginSave, hydrates } = boot();
        const units = [unit("a", [{ x: 1, y: 1 }])];
        scene.applyAuthoritativeSnapshot(snapshot(units, 1));
        moveTo([{ x: 4, y: 4 }]);
        beginSave();

        scene.applyAuthoritativeSnapshot(snapshot(units, 2, { viewerPlacementReady: true }));
        expect(hydrates()).toBe(2);
    });

    test("a server-created split is not held, and a lower sequence never rewinds the board", () => {
        const { scene, beginSave, hydrates } = boot();
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 1, y: 1 }])], 5));
        beginSave();

        scene.applyAuthoritativeSnapshot(
            snapshot(
                [unit("a", [{ x: 1, y: 1 }], { amountAlive: 6 }), unit("split", [{ x: 3, y: 3 }], { amountAlive: 4 })],
                6,
            ),
        );
        expect(hydrates()).toBe(2);

        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 8, y: 8 }])], 4));
        expect(hydrates()).toBe(2);
        expect(scene.lastAuthoritativeSequence).toBe(6);
    });

    test("a stage change, a map change, and the fight starting still rebuild", () => {
        const { scene, hydrates } = boot();
        const cells = [{ x: 1, y: 1 }];
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", cells)], 1));

        scene.applyAuthoritativeSnapshot(snapshot([unit("a", cells)], 2, { placementSplit: true, placementStage: 1 }));
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", cells)], 3, { gridType: 3 }));
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", cells)], 4, { fightStarted: true, currentLap: 1 }));

        expect(hydrates()).toBe(4);
    });

    test("a revealed opponent move rebuilds, a redacted one does not", () => {
        const { scene, hydrates } = boot();
        const mine = unit("a", [{ x: 1, y: 1 }]);
        const hidden = unit("ghost", [], {
            team: TeamVals.RIGHT,
            placed: false,
            name: "Unknown",
            creatureId: 0,
        });
        scene.applyAuthoritativeSnapshot(snapshot([mine, hidden], 1));

        scene.applyAuthoritativeSnapshot(
            snapshot(
                [mine, unit("ghost", [{ x: 9, y: 9 }], { team: TeamVals.RIGHT, name: "Unknown", creatureId: 0 })],
                2,
            ),
        );
        expect(hydrates()).toBe(1);

        const revealed = unit("scout", [{ x: 10, y: 2 }], { team: TeamVals.RIGHT, name: "Scout", creatureId: 1 });
        scene.applyAuthoritativeSnapshot(snapshot([mine, revealed], 3));
        expect(hydrates()).toBe(2);

        scene.applyAuthoritativeSnapshot(
            snapshot(
                [mine, unit("scout", [{ x: 10, y: 4 }], { team: TeamVals.RIGHT, name: "Scout", creatureId: 1 })],
                4,
            ),
        );
        expect(hydrates()).toBe(3);
    });

    test("a held snapshot does not record the opponent move it ignored", () => {
        const { scene, moveTo, beginSave, hydrates } = boot();
        const mine = (cells: { x: number; y: number }[]) => unit("a", cells);
        const scout = (y: number) =>
            unit("scout", [{ x: 10, y }], { team: TeamVals.RIGHT, name: "Scout", creatureId: 1 });
        scene.applyAuthoritativeSnapshot(snapshot([mine([{ x: 1, y: 1 }]), scout(2)], 1));
        const rememberedScout = scene.lastPlacementStateByUnitId.get("scout");

        moveTo([{ x: 4, y: 4 }]);
        beginSave();
        scene.applyAuthoritativeSnapshot(snapshot([mine([{ x: 1, y: 1 }]), scout(6)], 2));

        expect(hydrates()).toBe(1);
        expect(scene.lastPlacementStateByUnitId.get("scout")).toBe(rememberedScout);
    });

    test("only a landed place_unit arms the rewind hold", () => {
        let serverAccepts = true;
        let localAccepts = true;
        const local = spyOn(Sandbox.prototype as unknown as { createActionEngine(): unknown }, "createActionEngine");
        local.mockImplementation(() => ({ apply: () => ({ completed: localAccepts, events: [] }) }));
        const submission = Promise.withResolvers<void>().promise;
        const pending: Promise<void>[] = [];
        const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
            isPlayingAuthoritativeReplay: () => false,
            dispatchExternalGameAction: () => ({ handled: true, completed: serverAccepts, submission }),
            noteOptimisticPlacement: (save: Promise<void>) => pending.push(save),
        }) as { createActionEngine(): { apply(action: { type: string }): { completed: boolean } } };
        try {
            const apply = (type: string) => scene.createActionEngine().apply({ type });
            expect(apply("place_unit").completed).toBe(true);
            expect(apply("select_attack_type").completed).toBe(true);
            serverAccepts = false;
            expect(apply("place_unit").completed).toBe(false);
            serverAccepts = true;
            localAccepts = false;
            expect(apply("place_unit").completed).toBe(false);
            expect(pending).toEqual([submission]);
        } finally {
            local.mockRestore();
        }
    });
});

/**
 * Barrel Barricade during ranked placement (live game 9208870e): a barrel move changes no stack, so the
 * stacks-only skip above swallowed the confirming snapshot and the barrel never moved on the board, while the
 * server had it at its new cell. The next drop then aimed at a cell the server held, and was refused.
 */
describe("ranked placement barrels", () => {
    const at = (index: number, y: number): Barrel => ({ team: TeamVals.LEFT, index, cell: { x: 2, y } });
    const stacks = () => [unit("a", [{ x: 1, y: 1 }])];

    test("a barrel the server moved reaches the board while every stack already matches", () => {
        const { scene, hydrates, barrels, barrelSyncs } = boot();
        scene.applyAuthoritativeSnapshot(snapshot(stacks(), 1, barrelsSnapshot([at(0, 0), at(1, 1)])));
        expect(barrels()).toEqual([at(0, 0), at(1, 1)]);

        scene.applyAuthoritativeSnapshot(snapshot(stacks(), 2, barrelsSnapshot([at(0, 3), at(1, 1)])));
        expect(barrels()).toEqual([at(0, 3), at(1, 1)]);
        scene.applyAuthoritativeSnapshot(snapshot(stacks(), 3, barrelsSnapshot([at(1, 1)])));
        expect(barrels()).toEqual([at(1, 1)]);
        expect(barrelSyncs()).toBe(2);
        // Terrain only: the stacks stand where they stood, so nothing is torn down.
        expect(hydrates()).toBe(1);
    });

    test("a server barrel change is shown during a pending unit drop", () => {
        const { scene, moveTo, beginSave, hydrates, barrels } = boot();
        scene.applyAuthoritativeSnapshot(snapshot(stacks(), 1, barrelsSnapshot([at(0, 0)])));
        moveTo([{ x: 4, y: 4 }]);
        beginSave();

        scene.applyAuthoritativeSnapshot(snapshot(stacks(), 2, barrelsSnapshot([at(0, 3)])));
        expect(hydrates()).toBe(1);
        expect(barrels()).toEqual([at(0, 3)]);
    });

    test("an earlier snapshot cannot pull back a newer barrel drop, and the confirmation is silent", () => {
        const clock = spyOn(performance, "now").mockReturnValue(10_000);
        try {
            const { scene, hydrates, barrels, barrelSyncs, moveBarrelLocally } = boot();
            scene.applyAuthoritativeSnapshot(snapshot(stacks(), 1, barrelsSnapshot([at(0, 0), at(1, 1)])));

            moveBarrelLocally(at(0, 3));
            scene.noteOptimisticBarrelPlacement();
            scene.applyAuthoritativeSnapshot(snapshot(stacks(), 2, barrelsSnapshot([at(0, 0), at(1, 1)])));
            expect(barrels()).toEqual([at(1, 1), at(0, 3)]);

            scene.applyAuthoritativeSnapshot(snapshot(stacks(), 3, barrelsSnapshot([at(0, 3), at(1, 1)])));
            expect(barrels()).toEqual([at(1, 1), at(0, 3)]);
            expect(barrelSyncs()).toBe(0);
            expect(hydrates()).toBe(1);
        } finally {
            clock.mockRestore();
        }
    });

    test("an unconfirmed barrel drop goes back to the server's cell once its hold expires", () => {
        const { scene, barrels, moveBarrelLocally } = boot();
        scene.applyAuthoritativeSnapshot(snapshot(stacks(), 1, barrelsSnapshot([at(0, 0)])));

        // A drop whose hold never armed, or ran out: the server's word is final.
        moveBarrelLocally(at(0, 3));
        scene.applyAuthoritativeSnapshot(snapshot(stacks(), 2, barrelsSnapshot([at(0, 0)])));
        expect(barrels()).toEqual([at(0, 0)]);
    });

    test("a landed barrel drop or removal is drawn locally and arms only the barrel hold", () => {
        let serverAccepts = true;
        const applied: string[] = [];
        const local = spyOn(Sandbox.prototype as unknown as { createActionEngine(): unknown }, "createActionEngine");
        local.mockImplementation(() => ({
            apply: (action: { type: string }) => {
                applied.push(action.type);
                return { completed: true, events: [{ type: "barrel_placed" }] };
            },
        }));
        let unitHolds = 0;
        let barrelHolds = 0;
        const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
            isPlayingAuthoritativeReplay: () => false,
            dispatchExternalGameAction: () => ({ handled: true, completed: serverAccepts }),
            noteOptimisticPlacement: () => unitHolds++,
            noteOptimisticBarrelPlacement: () => barrelHolds++,
        }) as {
            createActionEngine(): { apply(action: { type: string }): { completed: boolean; events: unknown[] } };
        };
        try {
            const apply = (type: string) => scene.createActionEngine().apply({ type });
            const placed = apply("place_barrel");
            expect(placed.completed).toBe(true);
            expect(placed.events).toEqual([{ type: "barrel_placed" }]);
            expect(apply("unplace_barrel").completed).toBe(true);
            expect(applied).toEqual(["place_barrel", "unplace_barrel"]);
            expect(barrelHolds).toBe(2);
            expect(unitHolds).toBe(0);

            serverAccepts = false;
            expect(apply("place_barrel").completed).toBe(false);
            expect(applied).toHaveLength(2);
            expect(barrelHolds).toBe(2);
        } finally {
            local.mockRestore();
        }
    });
});
