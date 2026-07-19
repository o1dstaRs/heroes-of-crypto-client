import { describe, expect, test } from "bun:test";

import {
    AbilityFactory,
    CreatureVals,
    EffectFactory,
    FightStateManager,
    GridSettings,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot, AuthoritativeUnitState } from "../game_action_transport";
import {
    authoritativeSnapshotToSandboxSceneState,
    applyRankedUnitSnapshotStats,
    rankedUnitMechanicsMatch,
    rankedUnitAliveHealth,
    rankedUnitStartAmount,
    rankedUnitStartHealth,
    restoreRankedStepsMoraleMultiplier,
    shouldPublishRankedFinish,
} from "./RankedPlayScene";
import { RenderableUnit } from "./RenderableUnit";

const unitState = (overrides: Partial<AuthoritativeUnitState>): AuthoritativeUnitState => ({
    id: "unit",
    team: TeamVals.LOWER,
    name: "Peasant",
    creatureId: CreatureVals.PEASANT,
    amountAlive: 10,
    amountDied: 0,
    hp: 10,
    maxHp: 10,
    attackType: 0,
    size: 1,
    baseCell: { x: 0, y: 0 },
    cells: [],
    speed: 0,
    morale: 0,
    dead: false,
    placed: false,
    stackPower: 0,
    rangeShots: 0,
    luck: 0,
    onHourglass: false,
    ...overrides,
});

const placementSnapshot = (units: AuthoritativeUnitState[]): AuthoritativeGameSnapshot => ({
    gameId: "game-1",
    viewerTeam: TeamVals.LOWER,
    phase: 1,
    gridType: 1,
    currentLap: 0,
    fightStarted: false,
    fightFinished: false,
    currentUnitId: "",
    currentTurnTeam: 0,
    latestSequence: 1,
    narrowingLayers: 0,
    centerDried: false,
    units,
    upNext: [],
});

describe("ranked placement scene state", () => {
    test("restores the server movement penalty used by ranked AI pathfinding", () => {
        const manager = FightStateManager.getInstance();
        manager.reset();
        const fightProperties = manager.getFightProperties();

        try {
            expect(restoreRankedStepsMoraleMultiplier(0.15)).toBe(true);
            expect(fightProperties.getStepsMoraleMultiplier()).toBeCloseTo(0.15);
            expect(restoreRankedStepsMoraleMultiplier(0.15)).toBe(false);

            // An older snapshot omits the field; it must clear any value retained from a previous game.
            expect(restoreRankedStepsMoraleMultiplier(undefined)).toBe(true);
            expect(fightProperties.getStepsMoraleMultiplier()).toBe(0);
        } finally {
            manager.reset();
        }
    });

    test("publishes terminal stats when finishFight retained a pre-final ranked report", () => {
        const terminalSnapshot = {
            ...placementSnapshot([]),
            phase: 3,
            fightStarted: true,
            fightFinished: true,
        };
        const preFinalStats = {
            winner: TeamVals.NO_TEAM,
            series: [],
            lowerDeaths: [],
            upperDeaths: [],
            lowerStartTotal: 10,
            upperStartTotal: 12,
            lowerKilledTotal: 0,
            upperKilledTotal: 0,
            totalLaps: 1,
        };
        const visibleStateAfterFinishEvent = {
            hasFinished: true,
            teamWin: TeamVals.UPPER,
            fightStats: preFinalStats,
        };

        // A terminal snapshot must replace these pre-final stats even though their roster totals are
        // populated. The results overlay requires fightStats.winner to match teamWin.
        expect(shouldPublishRankedFinish(terminalSnapshot, visibleStateAfterFinishEvent)).toBe(true);
        expect(
            shouldPublishRankedFinish(terminalSnapshot, {
                ...visibleStateAfterFinishEvent,
                fightStats: { ...preFinalStats, winner: TeamVals.UPPER },
            }),
        ).toBe(false);
        expect(
            shouldPublishRankedFinish(terminalSnapshot, {
                ...visibleStateAfterFinishEvent,
                fightStats: { ...preFinalStats, winner: TeamVals.LOWER },
            }),
        ).toBe(true);
    });

    test("carries server-computed morale and speed onto reconstructed units", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([unitState({ id: "own", team: TeamVals.LOWER, morale: 9, speed: 7 })]),
        );
        const own = state.units.find((unit) => unit.properties.id === "own");
        // The server (common engine) computes these and ships them in the snapshot; the client must
        // not reset them to base creature config.
        expect(own?.properties.morale).toBe(9);
        expect(own?.properties.speed).toBe(7);
    });

    test("carries the server hasHourglassed flag onto reconstructed units (drives ranked canHourglass sync)", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({ id: "waited", team: TeamVals.LOWER, hasHourglassed: true }),
                unitState({ id: "fresh", team: TeamVals.LOWER, hasHourglassed: false }),
            ]),
        );
        // Sandbox.applyAuthoritativeSnapshot folds this per-unit flag into fightProperties.alreadyHourglass so
        // the ranked client's canHourglass matches the server (else the AI re-requests a rejected wait -> skip).
        expect(state.units.find((unit) => unit.properties.id === "waited")?.hasHourglassed).toBe(true);
        expect(state.units.find((unit) => unit.properties.id === "fresh")?.hasHourglassed).toBe(false);
    });

    test("populates applied_debuffs (name/laps/description) so the ranked HUD renders server-applied effects", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "victim",
                    team: TeamVals.UPPER,
                    debuffs: ["Deep Wounds"],
                    debuffLaps: [3],
                    debuffDescriptions: ["Next attack with Deep Wounds ability will deal 12% more damage."],
                }),
            ]),
        );
        // The ranked client can't run the engine, so it fills the DISPLAY arrays (only) from the snapshot; the
        // HUD reads applied_debuffs to show combat debuffs/effects (Deep Wounds, Rime slow, Shatter Armor, …).
        const props = state.units.find((unit) => unit.properties.id === "victim")?.properties;
        expect(props?.applied_debuffs).toEqual(["Deep Wounds"]);
        expect(props?.applied_debuffs_laps).toEqual([3]);
        expect(props?.applied_debuffs_descriptions).toEqual([
            "Next attack with Deep Wounds ability will deal 12% more damage.",
        ]);
        // All four applied_debuffs* arrays MUST be equal length: deleteBuff/deleteDebuff only prune them
        // when the lengths match, so a desynced powers array made artifact-debuff cleanup silently no-op
        // and every refreshUnits() re-appended the cursed-artifact marker (the "million debuffs" runaway).
        expect(props?.applied_debuffs_powers).toEqual([0]);
        expect(props?.applied_debuffs_powers?.length).toBe(props?.applied_debuffs?.length);
    });

    test("maps 1-based ranged shots, falling back to base when the field is absent", () => {
        const rangedOf = (rangeShots: number) => {
            const state = authoritativeSnapshotToSandboxSceneState(
                placementSnapshot([
                    unitState({
                        id: "archer",
                        team: TeamVals.LOWER,
                        name: "Orc",
                        creatureId: CreatureVals.ORC,
                        rangeShots,
                    }),
                ]),
            );
            return state.units.find((unit) => unit.properties.id === "archer")!.properties.range_shots;
        };

        // Absent on the wire (older server / proto3 zero-default) => fall back to base config (Orc = 6),
        // so ranged units never read as 0 just because the server didn't send the field.
        expect(rangedOf(0)).toBe(6);
        // 1-based: wire 1 => a genuine 0 shots left; wire 5 => 4 shots remaining.
        expect(rangedOf(1)).toBe(0);
        expect(rangedOf(5)).toBe(4);
    });

    test("keeps revealed opponent units visible while hiding unknown opponent placeholders", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({ id: "own", team: TeamVals.LOWER, name: "Peasant", creatureId: CreatureVals.PEASANT }),
                unitState({
                    id: "known-op",
                    team: TeamVals.UPPER,
                    name: "Orc",
                    creatureId: CreatureVals.ORC,
                    placed: true,
                    cells: [{ x: 9, y: 13 }],
                    baseCell: { x: 9, y: 13 },
                }),
                unitState({
                    id: "hidden-op",
                    team: TeamVals.UPPER,
                    name: "Unknown",
                    creatureId: CreatureVals.NO_CREATURE,
                    amountAlive: 0,
                    hp: 0,
                    maxHp: 0,
                }),
            ]),
            { hideOpponentPlacements: true },
        );

        expect(state.units.map((unit) => unit.properties.id).sort()).toEqual(["known-op", "own"]);
        expect(state.units.find((unit) => unit.properties.id === "known-op")).toMatchObject({
            team: TeamVals.UPPER,
            placed: false,
            cells: [],
        });
    });

    test("drops a spent ability the snapshot no longer lists (Angel's Resurrection), keeping the rest", () => {
        // Ranked rebuilds units from the base creature config, which always lists Resurrection. After the
        // Angel resurrects, the server drops it from the unit's live abilities — the client must honour that
        // (and, since Resurrection's spell is ability-derived, this also clears it from the spellbook).
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "angel",
                    team: TeamVals.LOWER,
                    name: "Angel",
                    creatureId: CreatureVals.ANGEL,
                    abilities: ["Arrows Wingshield Aura"], // Resurrection already spent
                }),
            ]),
        );

        const angel = state.units.find((unit) => unit.properties.id === "angel");
        expect(angel?.properties.abilities).toContain("Arrows Wingshield Aura");
        expect(angel?.properties.abilities).not.toContain("Resurrection");
    });

    test("keeps all base abilities when the snapshot omits the live ability list (older server)", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({ id: "angel", team: TeamVals.LOWER, name: "Angel", creatureId: CreatureVals.ANGEL }),
            ]),
        );

        const angel = state.units.find((unit) => unit.properties.id === "angel");
        expect(angel?.properties.abilities).toContain("Resurrection");
    });

    test("reconstructs a runtime-granted ability that is absent from the creature's base config", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "assimilator",
                    abilities: ["Backstab"],
                }),
            ]),
        );

        const properties = state.units.find((unit) => unit.properties.id === "assimilator")?.properties;
        expect(properties?.abilities).toEqual(["Backstab"]);
        expect(properties?.abilities_descriptions[0]).toContain("25% higher damage");
        expect(properties?.abilities_stack_powered).toEqual([true]);
        expect(properties?.abilities_auras).toEqual([false]);
    });

    test("reconstructs runtime-granted aura mechanics and removes stolen native aura mechanics", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "assimilator",
                    abilities: ["Web Aura"],
                }),
                unitState({
                    id: "aura-victim",
                    team: TeamVals.UPPER,
                    name: "Angel",
                    creatureId: CreatureVals.ANGEL,
                    abilities: ["Resurrection"],
                    stolenAbilities: ["Arrows Wingshield Aura"],
                }),
            ]),
        );

        const assimilator = state.units.find((unit) => unit.properties.id === "assimilator")?.properties;
        expect(assimilator?.aura_effects).toEqual(["Web"]);
        expect(assimilator?.aura_ranges).toEqual([1]);
        expect(assimilator?.aura_is_buff).toEqual([false]);

        const victim = state.units.find((unit) => unit.properties.id === "aura-victim")?.properties;
        expect(victim?.abilities).toEqual(["Resurrection"]);
        expect(victim?.aura_effects).toEqual([]);
        expect(victim?.aura_ranges).toEqual([0]);
        expect(victim?.aura_is_buff).toEqual([true]);
    });

    test("reconstructs castable ability spells and removes spells for stolen abilities", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({ id: "spell-thief", abilities: ["Resurrection"] }),
                unitState({
                    id: "spell-victim",
                    team: TeamVals.UPPER,
                    name: "Angel",
                    creatureId: CreatureVals.ANGEL,
                    abilities: ["Arrows Wingshield Aura"],
                    stolenAbilities: ["Resurrection"],
                }),
            ]),
        );

        const thief = state.units.find((unit) => unit.properties.id === "spell-thief")?.properties;
        expect(thief?.spells).toContain(":Resurrection");
        expect(thief?.can_cast_spells).toBe(true);

        const victim = state.units.find((unit) => unit.properties.id === "spell-victim")?.properties;
        expect(victim?.spells).not.toContain(":Resurrection");
        expect(victim?.can_cast_spells).toBe(false);
    });

    test("reconstructs an authoritative stolen spellbook with its exact remaining casts", () => {
        const transferredEntries = ["Life:Heal", "Life:Spiritual Armor", "Life:Spiritual Armor"];
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "spellbook-thief",
                    abilities: ["Book of Healing"],
                    spellEntries: transferredEntries,
                    spellEntriesAuthoritative: true,
                }),
                unitState({
                    id: "spellbook-victim",
                    team: TeamVals.UPPER,
                    name: "Healer",
                    creatureId: CreatureVals.HEALER,
                    abilities: [],
                    stolenAbilities: ["Book of Healing"],
                    spellEntriesAuthoritative: true,
                }),
            ]),
        );

        const thief = state.units.find((unit) => unit.properties.id === "spellbook-thief")?.properties;
        expect(thief?.spells).toEqual(transferredEntries);
        expect(thief?.can_cast_spells).toBe(true);

        const victim = state.units.find((unit) => unit.properties.id === "spellbook-victim")?.properties;
        expect(victim?.spells).toEqual([]);
        expect(victim?.can_cast_spells).toBe(false);
    });

    test("carries permanently stolen abilities separately from live abilities", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "victim",
                    abilities: ["Absorb Penalties Aura"],
                    stolenAbilities: ["Bitter Experience"],
                }),
            ]),
        );

        const properties = state.units.find((unit) => unit.properties.id === "victim")?.properties;
        const stolenAbilities = (
            properties as typeof properties & {
                stolen_abilities?: string[];
            }
        )?.stolen_abilities;
        expect(properties?.abilities).toEqual(["Absorb Penalties Aura"]);
        expect(stolenAbilities).toEqual(["Bitter Experience"]);
    });

    test("carries the authoritative turn-start Web movement lock", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([unitState({ id: "webbed", webMovementLocked: true })]),
        );

        const properties = state.units.find((unit) => unit.properties.id === "webbed")?.properties;
        const webMovementLocked = (
            properties as typeof properties & {
                web_movement_locked?: boolean;
            }
        )?.web_movement_locked;
        expect(webMovementLocked).toBe(true);
    });

    test("syncs Web lock changes onto a live unit without rebuilding the board", () => {
        const snapshotProperties = (webMovementLocked: boolean) =>
            authoritativeSnapshotToSandboxSceneState(
                placementSnapshot([
                    unitState({
                        id: "webbed-flyer",
                        name: "Griffin",
                        creatureId: CreatureVals.GRIFFIN,
                        webMovementLocked,
                    }),
                ]),
            ).units[0]!.properties;
        const initialProperties = snapshotProperties(false);
        const effectFactory = new EffectFactory();
        const liveUnit = RenderableUnit.fromBase(
            Unit.createUnit(
                initialProperties,
                new GridSettings(16, 1600, 0, 1600, 0, 0, 0),
                TeamVals.LOWER,
                UnitVals.CREATURE,
                new AbilityFactory(effectFactory),
                effectFactory,
                false,
            ),
            undefined as never,
        );

        // Same-signature and skip-rebuild snapshots both take this non-destructive reconciliation path.
        expect(liveUnit.isWebMovementLocked()).toBe(false);
        expect(liveUnit.canMove()).toBe(true);
        expect(applyRankedUnitSnapshotStats(liveUnit, snapshotProperties(true))).toBe(true);
        expect(liveUnit.isWebMovementLocked()).toBe(true);
        expect(liveUnit.canMove()).toBe(false);

        // The next activation snapshot can authoritatively clear the lock without recreating the unit.
        expect(applyRankedUnitSnapshotStats(liveUnit, snapshotProperties(false))).toBe(true);
        expect(liveUnit.isWebMovementLocked()).toBe(false);
        expect(liveUnit.canMove()).toBe(true);
    });

    test("detects authoritative ability and remaining-spell changes before a skip-rebuild is cached", () => {
        const initialProperties = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({ id: "queen", name: "Arachna Queen", creatureId: CreatureVals.ARACHNA_QUEEN }),
            ]),
        ).units[0]!.properties;
        const grantedProperties = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "queen",
                    name: "Arachna Queen",
                    creatureId: CreatureVals.ARACHNA_QUEEN,
                    abilities: [...initialProperties.abilities, "Book of Healing"],
                    spellEntries: ["Life:Heal", "Life:Spiritual Armor", "Life:Spiritual Armor"],
                    spellEntriesAuthoritative: true,
                }),
            ]),
        ).units[0]!.properties;
        const effectFactory = new EffectFactory();
        const liveUnit = RenderableUnit.fromBase(
            Unit.createUnit(
                initialProperties,
                new GridSettings(16, 1600, 0, 1600, 0, 0, 0),
                TeamVals.LOWER,
                UnitVals.CREATURE,
                new AbilityFactory(effectFactory),
                effectFactory,
                false,
            ),
            undefined as never,
        );

        expect(rankedUnitMechanicsMatch(liveUnit, initialProperties)).toBe(true);
        expect(
            rankedUnitMechanicsMatch(liveUnit, {
                ...initialProperties,
                stolen_abilities: ["Predatory Assimilation"],
            }),
        ).toBe(false);
        expect(
            rankedUnitMechanicsMatch(liveUnit, {
                ...initialProperties,
                spells: ["Life:Heal"],
            }),
        ).toBe(false);
        expect(rankedUnitMechanicsMatch(liveUnit, grantedProperties)).toBe(false);
    });

    test("keeps an authoritative spent stolen direct spell empty when rebuilding the Queen", () => {
        const properties = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "spent-spell-queen",
                    name: "Arachna Queen",
                    creatureId: CreatureVals.ARACHNA_QUEEN,
                    abilities: ["Web Aura", "Infest", "Predatory Assimilation", "Wind Flow"],
                    spellEntries: [],
                    spellEntriesAuthoritative: true,
                }),
            ]),
        ).units[0]!.properties;
        const effectFactory = new EffectFactory();
        const rebuilt = Unit.createUnit(
            properties,
            new GridSettings(16, 1600, 0, 1600, 0, 0, 0),
            TeamVals.LOWER,
            UnitVals.CREATURE,
            new AbilityFactory(effectFactory),
            effectFactory,
            false,
        );

        expect(properties.spell_entries_authoritative).toBe(true);
        expect(rebuilt.hasAbilityActive("Wind Flow")).toBe(true);
        expect(rebuilt.hasSpellRemaining("Wind Flow")).toBe(false);
        expect(rebuilt.getUnitProperties().spells).toEqual([]);
    });

    test("renders a redacted opponent placement unit as a live 1-stack silhouette, not a corpse", () => {
        // The server hides the opponent's live stack size during simultaneous placement by sending
        // amountAlive = 0. The client shows the opponent's roster as ghost silhouettes on their edge, so it
        // must NOT treat that 0 as dead — cleanupDeadUnits() reaps amountAlive<=0 units WITH a death
        // animation every tick, which was the "opponent army getting killed on the edge every second" bug.
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({ id: "own", team: TeamVals.LOWER, name: "Peasant", creatureId: CreatureVals.PEASANT }),
                unitState({
                    id: "op",
                    team: TeamVals.UPPER,
                    name: "Orc",
                    creatureId: CreatureVals.ORC,
                    placed: true,
                    cells: [{ x: 9, y: 13 }],
                    baseCell: { x: 9, y: 13 },
                    amountAlive: 0, // server-redacted stack size
                }),
            ]),
            { hideOpponentPlacements: true },
        );

        const op = state.units.find((unit) => unit.properties.id === "op");
        expect(op).toMatchObject({ placed: false, cells: [] });
        expect(op?.properties.amount_alive).toBeGreaterThanOrEqual(1);
    });

    test("keeps real opponent placement once fight starts", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            {
                ...placementSnapshot([
                    unitState({
                        id: "known-op",
                        team: TeamVals.UPPER,
                        name: "Orc",
                        creatureId: CreatureVals.ORC,
                        placed: true,
                        cells: [{ x: 9, y: 13 }],
                        baseCell: { x: 9, y: 13 },
                    }),
                ]),
                phase: 2,
                fightStarted: true,
                currentLap: 1,
            },
            { hideOpponentPlacements: true },
        );

        expect(state.units).toHaveLength(1);
        expect(state.units[0]).toMatchObject({
            team: TeamVals.UPPER,
            placed: true,
            cells: [{ x: 9, y: 13 }],
            baseCell: { x: 9, y: 13 },
        });
    });

    test("computes ranked HP damage for partially wounded stacks", () => {
        const state = authoritativeSnapshotToSandboxSceneState({
            ...placementSnapshot([
                unitState({ id: "healthy", amountAlive: 10, amountDied: 0, hp: 10, maxHp: 10 }),
                unitState({ id: "wounded", amountAlive: 10, amountDied: 0, hp: 4, maxHp: 10 }),
                unitState({ id: "losses", amountAlive: 8, amountDied: 2, hp: 3, maxHp: 10 }),
            ]),
            phase: 2,
            fightStarted: true,
            currentLap: 1,
        });

        const byId = new Map(state.units.map((unit) => [unit.properties.id, unit]));
        const healthy = byId.get("healthy")!;
        const wounded = byId.get("wounded")!;
        const losses = byId.get("losses")!;

        expect(rankedUnitStartAmount(healthy)).toBe(10);
        expect(rankedUnitStartHealth(healthy)).toBe(100);
        expect(rankedUnitAliveHealth(healthy)).toBe(100);
        expect(rankedUnitStartHealth(wounded) - rankedUnitAliveHealth(wounded)).toBe(6);
        expect(rankedUnitStartHealth(losses) - rankedUnitAliveHealth(losses)).toBe(27);
    });
});
