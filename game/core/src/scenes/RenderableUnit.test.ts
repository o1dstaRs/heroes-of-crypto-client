import { afterEach, describe, expect, test } from "bun:test";

import { Container, Texture } from "pixi.js";

import {
    AbilityFactory,
    AllAbilities,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    HoCLib,
    TeamVals,
    Unit,
    UnitVals,
    type ISceneLog,
    type TeamType,
} from "@heroesofcrypto/common";

import { RenderableUnit } from "./RenderableUnit";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

const sceneLog: ISceneLog = {
    getLog: () => "",
    updateLog: () => undefined,
    hasBeenUpdated: () => false,
};

function createRenderableUnit(
    team: TeamType,
    factionName: string,
    creatureName: string,
    textureName: string,
): RenderableUnit {
    const effectFactory = new EffectFactory();
    const base = Unit.createUnit(
        HoCConfig.getCreatureConfig(team, factionName, creatureName, textureName, 1),
        gridSettings,
        team,
        UnitVals.CREATURE,
        new AbilityFactory(effectFactory),
        effectFactory,
        false,
    );
    return RenderableUnit.fromBase(base, () => undefined);
}

const spellAmounts = (unit: Unit): Record<string, number> =>
    Object.fromEntries(unit.getSpells().map((spell) => [spell.getName(), spell.getAmount()]));

afterEach(() => HoCLib.setDeterministicRandomSource(undefined));

describe("RenderableUnit runtime spell synchronization", () => {
    test("removes and grants getSpells entries when a castable ability is stolen", () => {
        const queen = createRenderableUnit(TeamVals.LOWER, "Nature", "Arachna Queen", "arachna_queen_512");
        const angel = createRenderableUnit(TeamVals.UPPER, "Life", "Angel", "angel_512");
        HoCLib.setDeterministicRandomSource(() => 0);

        expect(spellAmounts(angel)).toEqual({ Resurrection: 1 });
        expect(spellAmounts(queen)).toEqual({});
        expect(AllAbilities.processPredatoryAssimilationAbility(queen, angel, sceneLog)?.abilityName).toBe(
            "Resurrection",
        );
        expect(spellAmounts(angel)).toEqual({});
        expect(spellAmounts(queen)).toEqual({ Resurrection: 1 });
    });

    test("transfers exact remaining spellbook charges into the thief's getSpells entries", () => {
        const queen = createRenderableUnit(TeamVals.LOWER, "Nature", "Arachna Queen", "arachna_queen_512");
        const satyr = createRenderableUnit(TeamVals.UPPER, "Nature", "Satyr", "satyr_512");
        satyr.useSpell("Courage");
        satyr.useSpell("Summon Wolves");
        HoCLib.setDeterministicRandomSource(() => 0);

        expect(spellAmounts(satyr)).toEqual({ Courage: 2, "Helping Hand": 1, "Summon Wolves": 1 });
        expect(AllAbilities.processPredatoryAssimilationAbility(queen, satyr, sceneLog)?.abilityName).toBe(
            "Forest Spellbook",
        );
        expect(spellAmounts(satyr)).toEqual({});
        expect(spellAmounts(queen)).toEqual({ Courage: 2, "Helping Hand": 1, "Summon Wolves": 1 });
    });
});

describe("RenderableUnit dodge animation", () => {
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

    // In-grid position (x ∈ (-1024, 1024), y ∈ (0, 2048)) so ensureVisual builds the sprite.
    const pos = { x: 0, y: 1024 };

    function createVisualUnit(): { unit: RenderableUnit; worldRoot: Container } {
        const effectFactory = new EffectFactory();
        const base = Unit.createUnit(
            HoCConfig.getCreatureConfig(TeamVals.UPPER, "Nature", "Satyr", "satyr_512", 1),
            gridSettings,
            TeamVals.UPPER,
            UnitVals.CREATURE,
            new AbilityFactory(effectFactory),
            effectFactory,
            false,
        );
        const unit = RenderableUnit.fromBase(base, () => Texture.WHITE);
        unit.setPosition(pos.x, pos.y);
        const worldRoot = new Container();
        unit.ensureVisual(worldRoot, gridSettings);
        return { unit, worldRoot };
    }

    test("is a safe no-op before any sprite exists", () => {
        const unit = createRenderableUnit(TeamVals.UPPER, "Nature", "Satyr", "satyr_512");
        unit.playDodgeAnimation(40, -20);
        expect(unit.isDodging()).toBe(false);
    });

    test("offsets sprite by the full displacement during the hold phase and leaves a ghost trail", async () => {
        const { unit, worldRoot } = createVisualUnit();
        const childrenBefore = worldRoot.children.length;

        unit.playDodgeAnimation(40, -20);
        expect(unit.isDodging()).toBe(true);
        unit.ensureVisual(worldRoot, gridSettings);

        // 250ms sits inside the hold phase (22%..55% of the 640ms dodge) where the envelope is exactly 1.
        await sleep(250);
        unit.ensureVisual(worldRoot, gridSettings);
        const sprite = worldRoot.children.find((child) => child.zIndex === 4000 - pos.y);
        expect(sprite).toBeDefined();
        expect(sprite!.x).toBeCloseTo(pos.x + 40, 5);
        expect(sprite!.y).toBeCloseTo(pos.y - 20, 5);
        expect(sprite!.rotation).not.toBe(0);
        // Afterimage ghosts joined the world root behind the sprite.
        expect(worldRoot.children.length).toBeGreaterThan(childrenBefore);
    });

    test("springs back to rest and cleans up its ghosts after the dodge completes", async () => {
        const { unit, worldRoot } = createVisualUnit();
        const childrenBefore = worldRoot.children.length;

        unit.playDodgeAnimation(40, -20);
        unit.ensureVisual(worldRoot, gridSettings);
        // 640ms dodge + 300ms ghost life, with margin.
        await sleep(1100);
        unit.ensureVisual(worldRoot, gridSettings);

        const sprite = worldRoot.children.find((child) => child.zIndex === 4000 - pos.y);
        expect(sprite!.x).toBeCloseTo(pos.x, 5);
        expect(sprite!.y).toBeCloseTo(pos.y, 5);
        expect(sprite!.rotation).toBe(0);
        expect(unit.isDodging()).toBe(false);
        expect(worldRoot.children.length).toBe(childrenBefore);
    });
});
