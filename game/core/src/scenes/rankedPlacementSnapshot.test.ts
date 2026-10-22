import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TeamVals } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import type { AuthoritativeGameSnapshot, AuthoritativeUnitState } from "../game_action_transport";
import { RankedPlayScene } from "./RankedPlayScene";

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

const boot = (cells: { x: number; y: number }[] = [{ x: 1, y: 1 }]) => {
    const state: LivePlacement = { cells, amountAlive: 10 };
    const occupants = occupy(cells, "a");
    let hydrates = 0;
    const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
        fullReplayPlaybackActive: false,
        lastAuthoritativeSequence: -1,
        lastBoardSignature: "not-a-board",
        lastPlacementUnitIdsKey: "",
        optimisticPlacementHoldUntil: 0,
        lastPlacementStateByUnitId: new Map<string, string>(),
        viewerTeam: TeamVals.LEFT,
        sandboxCoop: false,
        sc_visibleState: undefined,
        unitsHolder: {
            getAllUnits: () => new Map([["a", liveUnit("a", state)]]),
        },
        grid: {
            getOccupantUnitId: (cell: { x: number; y: number }) => occupants.get(`${cell.x}:${cell.y}`),
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
        applyScatteredMountainsFromSnapshot() {},
        refreshUnits() {},
        reconcileAuraEffectsFromSnapshot() {},
        syncRankedVisibleTurnState() {},
        applyRankedFightStats() {},
        getCurrentActiveUnit: () => undefined,
    }) as RankedPlayScene & {
        lastPlacementUnitIdsKey: string;
        lastAuthoritativeSequence: number;
        optimisticPlacementHoldUntil: number;
        lastPlacementStateByUnitId: Map<string, string>;
        noteOptimisticPlacement: () => void;
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
        hydrates: () => hydrates,
    };
};

describe("ranked placement snapshots", () => {
    test("the first board is built, and a repeat of it is not", () => {
        const { scene, hydrates } = boot();
        const opening = snapshot([unit("a", [{ x: 1, y: 1 }])], 1);

        scene.applyAuthoritativeSnapshot(opening);
        scene.applyAuthoritativeSnapshot(opening);

        expect(hydrates()).toBe(1);
        expect(scene.lastAuthoritativeSequence).toBe(1);
    });

    test("a confirming drop does not rebuild, and an older drop of the same stack waits", () => {
        const { scene, moveTo, hydrates } = boot();
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 1, y: 1 }])], 1));

        moveTo([{ x: 4, y: 4 }]);
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 4, y: 4 }])], 2));
        expect(hydrates()).toBe(1);

        moveTo([{ x: 6, y: 6 }]);
        scene.noteOptimisticPlacement();
        const remembered = scene.lastPlacementUnitIdsKey;
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 4, y: 4 }])], 3));
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 1, y: 1 }])], 4));

        expect(hydrates()).toBe(1);
        expect(scene.lastPlacementUnitIdsKey).toBe(remembered);
        expect(scene.lastAuthoritativeSequence).toBe(4);

        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 6, y: 6 }])], 5));
        expect(hydrates()).toBe(1);
        expect(scene.lastPlacementUnitIdsKey).not.toBe(remembered);
    });

    test("a rejected drop still rebuilds, and so does a stale drop once the hold expires", () => {
        const { scene, moveTo, hydrates } = boot();
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 1, y: 1 }])], 1));
        moveTo([{ x: 4, y: 4 }]);
        scene.noteOptimisticPlacement();

        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 1, y: 1 }])], 2), {
            forceBoardRebuild: true,
        });
        expect(hydrates()).toBe(2);

        moveTo([{ x: 6, y: 6 }]);
        scene.optimisticPlacementHoldUntil = 0;
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 4, y: 4 }])], 3));
        expect(hydrates()).toBe(3);
    });

    test("a server-created split is not held, and a lower sequence never rewinds the board", () => {
        const { scene, hydrates } = boot();
        scene.applyAuthoritativeSnapshot(snapshot([unit("a", [{ x: 1, y: 1 }])], 5));
        scene.noteOptimisticPlacement();

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
        const { scene, moveTo, hydrates } = boot();
        const mine = (cells: { x: number; y: number }[]) => unit("a", cells);
        const scout = (y: number) =>
            unit("scout", [{ x: 10, y }], { team: TeamVals.RIGHT, name: "Scout", creatureId: 1 });
        scene.applyAuthoritativeSnapshot(snapshot([mine([{ x: 1, y: 1 }]), scout(2)], 1));
        const rememberedScout = scene.lastPlacementStateByUnitId.get("scout");

        moveTo([{ x: 4, y: 4 }]);
        scene.noteOptimisticPlacement();
        scene.applyAuthoritativeSnapshot(snapshot([mine([{ x: 1, y: 1 }]), scout(6)], 2));

        expect(hydrates()).toBe(1);
        expect(scene.lastPlacementStateByUnitId.get("scout")).toBe(rememberedScout);
    });

    test("only a landed place_unit arms the rewind hold", () => {
        const source = readFileSync(join(import.meta.dir, "RankedPlayScene.ts"), "utf8");
        const arm = source.indexOf('if (result.completed && (action.type === "place_unit"');
        const slice = source.slice(arm, arm + 500);
        expect(slice).toContain('if (action.type === "place_unit") this.noteOptimisticPlacement();');
        expect(slice).not.toContain('select_attack_type") this.noteOptimisticPlacement');
    });
});
