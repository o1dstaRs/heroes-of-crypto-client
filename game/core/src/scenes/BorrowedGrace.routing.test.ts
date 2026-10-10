import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Texture } from "pixi.js";

import {
    AbilityFactory,
    AllAbilities,
    CreatureVals,
    EffectFactory,
    FightStateManager,
    GridSettings,
    GridVals,
    HoCConfig,
    HoCLib,
    Spell,
    TeamVals,
    Unit,
    UnitVals,
    type GameEvent,
} from "@heroesofcrypto/common";

import { PlayActionType, type PlayJournalEntry } from "../api/play_protocol";
import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import { parseRankedReplayAction } from "../replay/ranked_replay";
import {
    cloneReplayData,
    listSandboxReplays,
    SandboxReplayRecorder,
    type ReplayStorage,
} from "../replay/sandbox_replay";
import { RenderableUnit as LevelOneRenderableUnit } from "./LevelOneRenderableUnit";
import { RenderableUnit } from "./RenderableUnit";
import {
    applyRankedUnitSnapshotStats,
    authoritativeSnapshotToSandboxSceneState,
    effectsAppliedSceneLogLines,
} from "./RankedPlayScene";
import type { SandboxSceneState } from "./Sandbox";

beforeEach(() => {
    FightStateManager.getInstance().reset();
    HoCLib.setDeterministicRandomSource(() => 0);
});
afterEach(() => HoCLib.setDeterministicRandomSource(undefined));

const gridSettings = new GridSettings(16, 1600, 0, 1600, 0, 0, 0);
const makeMonk = () => {
    const effects = new EffectFactory();
    return Unit.createUnit(
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Monk", "monk_512", 5),
        gridSettings,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
};

const transfer: GameEvent = {
    type: "effects_applied",
    applications: [{ unitId: "monk", sourceUnitId: "enemy", name: "Armor Rune", kind: "buff", laps: 15 }],
};

describe("Borrowed Grace client routing", () => {
    test.each([
        ["main", RenderableUnit],
        ["level one", LevelOneRenderableUnit],
    ] as const)("%s card follows the shared live chance at every stack tier", (_name, Renderer) => {
        const monk = Renderer.fromBase(makeMonk(), () => Texture.EMPTY);
        Object.assign(monk.getUnitProperties(), { luck: 4, luck_authoritative: true });
        const index = monk.getUnitProperties().abilities.indexOf("Borrowed Grace");
        for (const stack of [1, 2, 3, 4, 5]) {
            monk.setStackPower(stack);
            monk.adjustBaseStats(false, 1, 8, 0, 0, 0, 0, 0);
            expect(monk.getUnitProperties().abilities_descriptions[index]).toContain(
                `${AllAbilities.borrowedGraceChance(monk, 8)}% chance`,
            );
        }
        monk.applyBuff(
            new Spell({ spellProperties: HoCConfig.getSpellConfig("System", "Made of Fire", 2), amount: 1 }),
        );
        monk.adjustBaseStats(false, 1, 8, 0, 0, 0, 0, 0);
        expect(monk.getUnitProperties().abilities_descriptions[index]).toContain("89% chance");
    });

    test("ranked card includes Made of Fire when the buff exists only in snapshot display metadata", () => {
        const monk = RenderableUnit.fromBase(makeMonk(), () => Texture.EMPTY);
        monk.setStackPower(5);
        const props = monk.getUnitProperties();
        Object.assign(props, {
            luck: 0,
            luck_authoritative: true,
            applied_buffs: ["Made of Fire"],
            applied_buffs_laps: [1],
            applied_buffs_descriptions: ["The creature receives a 10% boost to all stats, including its abilities.;;"],
            applied_buffs_powers: [0],
        });
        expect(monk.getBuff("Made of Fire")).toBeUndefined();
        monk.adjustBaseStats(false, 1, 0, 0, 0, 0, 0, 0);
        expect(props.abilities_descriptions[props.abilities.indexOf("Borrowed Grace")]).toContain("77% chance");
        props.applied_buffs_laps[0] = 0;
        expect(AllAbilities.borrowedGraceChance(monk, 0)).toBe(70);
    });

    test("ranked and replay logs identify the recipient, buff and donor", () => {
        expect(
            effectsAppliedSceneLogLines(
                transfer,
                new Map([
                    ["monk", "Monk"],
                    ["enemy", "Blacksmith"],
                ]),
                () => "🟢",
            ),
        ).toEqual(["🟢 Monk took Armor Rune from Blacksmith"]);
        expect(effectsAppliedSceneLogLines(transfer, new Map())).toEqual(["Unit took Armor Rune from Unit"]);
    });

    test("ranked journal JSON preserves buff-transfer ownership for replay", () => {
        const entry: PlayJournalEntry = {
            sequence: 1,
            actionId: "shot",
            playerId: "player",
            team: TeamVals.LEFT,
            actionType: PlayActionType.RANGE_ATTACK,
            actionJson: JSON.stringify({ type: "range_attack", attackerId: "monk", targetId: "enemy" }),
            eventsJson: JSON.stringify([transfer]),
            acceptedAtMs: 1_000,
        };
        expect(parseRankedReplayAction(entry)?.events).toEqual([transfer]);
    });

    test("same-board ranked reconciliation removes the donor buff and preserves the recipient's rune metadata", () => {
        const monk = RenderableUnit.fromBase(makeMonk(), () => Texture.EMPTY);
        const enemy = RenderableUnit.fromBase(makeMonk(), () => Texture.EMPTY);
        enemy.applyBuff(
            new Spell({ spellProperties: HoCConfig.getSpellConfig("System", "Armor Rune", 15), amount: 1 }),
            4,
            2,
        );
        const snapshot: AuthoritativeGameSnapshot = {
            gameId: "grace",
            viewerTeam: TeamVals.LEFT,
            phase: 2,
            gridType: GridVals.NORMAL,
            currentLap: 1,
            fightStarted: true,
            fightFinished: false,
            currentUnitId: "enemy",
            currentTurnTeam: TeamVals.RIGHT,
            latestSequence: 1,
            narrowingLayers: 0,
            centerDried: false,
            upNext: [],
            units: ["monk", "enemy"].map((id) => ({
                id,
                team: id === "monk" ? TeamVals.LEFT : TeamVals.RIGHT,
                name: "Monk",
                creatureId: CreatureVals.MONK,
                amountAlive: 5,
                amountDied: 0,
                hp: 50,
                maxHp: 50,
                attackType: 1,
                size: 1,
                baseCell: { x: 5, y: id === "monk" ? 2 : 5 },
                cells: [],
                initiative: 3,
                morale: 0,
                dead: false,
                placed: true,
                stackPower: 5,
                rangeShots: 3,
                luck: 0,
                onHourglass: false,
                buffs: id === "monk" ? ["Armor Rune"] : [],
                buffLaps: id === "monk" ? [15] : [],
                buffDescriptions: id === "monk" ? ["Armor enchanted by 4.;;4;2"] : [],
            })),
        };
        const state = authoritativeSnapshotToSandboxSceneState(snapshot);
        const recipientState = state.units.find((unit) => unit.properties.id === "monk")!;
        const donorState = state.units.find((unit) => unit.properties.id === "enemy")!;
        for (let update = 0; update < 3; update++) {
            applyRankedUnitSnapshotStats(monk, recipientState.properties);
            applyRankedUnitSnapshotStats(enemy, donorState.properties);
        }
        expect(enemy.getBuff("Armor Rune")).toBeUndefined();
        expect(enemy.getUnitProperties().applied_buffs).toEqual([]);
        expect(monk.getUnitProperties().applied_buffs).toEqual(["Armor Rune"]);
        expect(monk.getUnitProperties().applied_buffs_laps).toEqual([15]);
        expect(monk.getUnitProperties().applied_buffs_descriptions).toEqual(
            recipientState.properties.applied_buffs_descriptions,
        );
    });

    test("sandbox replay storage retains the exact transferred buff and the pre-shot state", () => {
        const monk = makeMonk();
        const enemy = makeMonk();
        enemy.applyBuff(
            new Spell({ spellProperties: HoCConfig.getSpellConfig("Life", "Blessing", 3), amount: 1 }),
            11,
            7,
        );
        let state: SandboxSceneState = {
            gridType: GridVals.NORMAL,
            currentLap: 1,
            fightStarted: true,
            fightFinished: false,
            units: [monk, enemy].map((unit) => ({
                properties: unit.getUnitProperties(),
                team: unit.getTeam(),
                placed: true,
                dead: false,
                cells: [],
                baseCell: { x: 5, y: 2 },
            })),
        };
        const values = new Map<string, string>();
        const storage: ReplayStorage = {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => {
                values.set(key, value);
            },
            removeItem: (key) => {
                values.delete(key);
            },
        };
        const recorder = new SandboxReplayRecorder(() => cloneReplayData(state), storage);
        recorder.beginAction(1_000);
        const before = cloneReplayData(enemy.getUnitProperties());
        expect(monk.takeBuffFrom(enemy, "Blessing")).toBe(true);
        state = cloneReplayData(state);
        const event: GameEvent = {
            type: "effects_applied",
            applications: [
                { unitId: monk.getId(), sourceUnitId: enemy.getId(), kind: "buff", name: "Blessing", laps: 3 },
            ],
        };
        recorder.recordAction(
            { type: "range_attack", attackerId: monk.getId(), targetId: enemy.getId() },
            { completed: true, events: [event] },
            1_100,
        );
        recorder.flush();
        const replay = listSandboxReplays(storage)[0]!;
        expect(replay.actions[0]!.events).toEqual([event]);
        expect(replay.initialState.units[1]!.properties.applied_buffs).toEqual(["Blessing"]);
        expect(replay.actions[0]!.stateAfter.units[1]!.properties.applied_buffs).toEqual([]);
        const received = replay.actions[0]!.stateAfter.units[0]!.properties;
        expect(received.applied_buffs).toEqual(before.applied_buffs);
        expect(received.applied_buffs_laps).toEqual(before.applied_buffs_laps);
        expect(received.applied_buffs_powers).toEqual(before.applied_buffs_powers);
        expect(received.applied_buffs_descriptions).toEqual(before.applied_buffs_descriptions);
    });
});
