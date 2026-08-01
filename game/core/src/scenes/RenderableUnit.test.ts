import { afterEach, describe, expect, test } from "bun:test";

import { Container, Graphics, Text, Texture } from "pixi.js";

import {
    AbilityFactory,
    AllAbilities,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    HoCLib,
    Spell,
    TeamVals,
    Unit,
    UnitVals,
    type ISceneLog,
    type TeamType,
} from "@heroesofcrypto/common";

import { dropDuplicateAppliedEntries, RenderableUnit } from "./RenderableUnit";

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
    textureResolver: (name: string) => Texture | undefined = () => undefined,
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
    return RenderableUnit.fromBase(base, textureResolver);
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

    test("builds spellbook rendering when an initially spell-less unit gains a runtime spell", () => {
        const queen = createRenderableUnit(
            TeamVals.LOWER,
            "Nature",
            "Arachna Queen",
            "arachna_queen_512",
            () => Texture.WHITE,
        );
        const angel = createRenderableUnit(TeamVals.UPPER, "Life", "Angel", "angel_512");
        const spellBookLayer = new Container();
        const digits = new Map([[1, Texture.WHITE]]);
        HoCLib.setDeterministicRandomSource(() => 0);

        expect(queen.ensureSpellBookRendering(spellBookLayer, digits)).toBe(false);
        expect(spellBookLayer.children).toHaveLength(0);

        expect(AllAbilities.processPredatoryAssimilationAbility(queen, angel, sceneLog)?.abilityName).toBe(
            "Resurrection",
        );
        expect(queen.ensureSpellBookRendering(spellBookLayer, digits)).toBe(true);
        queen.renderSpells(1);
        expect(spellBookLayer.children.length).toBeGreaterThan(0);
        expect(spellBookLayer.children.some((child) => child.visible)).toBe(true);
    });
});

describe("RenderableUnit runtime aura and reflection descriptions", () => {
    const descriptionFor = (
        creatureName: "Dryad" | "Satyr" | "Magic Dragon",
        textureName: string,
        abilityName: string,
        stackPower: number,
        luck: number,
    ): string => {
        const effectFactory = new EffectFactory();
        const properties = HoCConfig.getCreatureConfig(TeamVals.LOWER, "Nature", creatureName, textureName, 1);
        properties.luck = luck;
        const base = Unit.createUnit(
            properties,
            gridSettings,
            TeamVals.LOWER,
            UnitVals.CREATURE,
            new AbilityFactory(effectFactory),
            effectFactory,
            false,
        );
        const unit = RenderableUnit.fromBase(base, () => undefined);
        unit.setStackPower(stackPower);
        unit.adjustBaseStats(false, 0, 0, 0, 0, 0, luck);

        const abilityIndex = unit.getUnitProperties().abilities.indexOf(abilityName);
        expect(abilityIndex).toBeGreaterThanOrEqual(0);
        return unit.getUnitProperties().abilities_descriptions[abilityIndex] ?? "";
    };

    test("replaces live Guiding Winds, Sylvan Focus and Magic Mirror values", () => {
        expect(descriptionFor("Dryad", "dryad_512", "Guiding Winds Aura", 2, 10)).toContain("shoot 20% further");
        expect(descriptionFor("Satyr", "satyr_512", "Sylvan Focus Aura", 1, 10)).toContain(
            "deal 25% more magic damage",
        );
        // Magic Reflection is stack-scaled now: at power 75 that is 15/30/45/60/75 across the stack, then
        // shifted by luck. One pip of stack with 10 luck rebounds at 25%, not the configured full-stack 75.
        expect(descriptionFor("Magic Dragon", "magic_dragon_512", "Magic Reflection", 1, 10)).toContain(
            "creature 25% of the time",
        );
        expect(descriptionFor("Magic Dragon", "magic_dragon_512", "Magic Reflection", 5, 10)).toContain(
            "creature 85% of the time",
        );
    });

    test("replaces Chakram's total-target limit at every stack tier", () => {
        for (let stackPower = 1; stackPower <= 5; stackPower += 1) {
            const effectFactory = new EffectFactory();
            const base = Unit.createUnit(
                HoCConfig.getCreatureConfig(TeamVals.LOWER, "Might", "Zena", "zena_512", 1),
                gridSettings,
                TeamVals.LOWER,
                UnitVals.CREATURE,
                new AbilityFactory(effectFactory),
                effectFactory,
                false,
            );
            const unit = RenderableUnit.fromBase(base, () => undefined);
            unit.setStackPower(stackPower);
            unit.adjustBaseStats(false, 0, 0, 0, 0, 0, 0);

            const properties = unit.getUnitProperties();
            const index = properties.abilities.indexOf("Chakram");
            expect(properties.abilities_descriptions[index]).toContain(`Maximum targets: ${stackPower}.`);
        }
    });
});

describe("RenderableUnit revealed roster card", () => {
    // Revealed units carry a ColorMatrixFilter (the B&W pass), whose constructor probes a WebGL context
    // through the DOM adapter. Headless bun has no document; hand it a canvas stub whose getContext
    // returns null, which pixi already handles by falling back to mediump precision.
    if (!("document" in globalThis)) {
        (globalThis as { document?: unknown }).document = {
            createElement: () => ({ getContext: () => null }),
        };
    }

    // In-grid position (x ∈ (-1024, 1024), y ∈ (0, 2048)) so ensureVisual builds the sprite.
    const pos = { x: 0, y: 1900 };

    const revealedUnit = (): { unit: RenderableUnit; worldRoot: Container } => {
        const unit = createRenderableUnit(TeamVals.UPPER, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setVisualRevealed(true);
        unit.setVisualScaleMultiplier(0.85);
        unit.setPosition(pos.x, pos.y);
        const worldRoot = new Container();
        unit.ensureVisual(worldRoot, gridSettings);
        return { unit, worldRoot };
    };

    // The stack badge is also a Container+Text, so match on the caption text (the creature's name).
    const cardOf = (worldRoot: Container, name = "Satyr"): Container | undefined =>
        worldRoot.children.find(
            (child) =>
                child instanceof Container && child.children.some((leaf) => leaf instanceof Text && leaf.text === name),
        ) as Container | undefined;

    test("names the creature and draws its plate beneath the silhouette", () => {
        const { worldRoot } = revealedUnit();
        const card = cardOf(worldRoot);

        expect(card).toBeDefined();
        expect(card!.visible).toBe(true);
        const label = card!.children.find((child) => child instanceof Text) as Text;
        expect(label.text).toBe("Satyr");
        expect(card!.children.some((child) => child instanceof Graphics)).toBe(true);
        // The caption sits below the unit on screen; worldRoot is y-up, so that is a SMALLER y.
        expect(label.y).toBeLessThan(pos.y);
        // Behind the sprite (higher zIndex draws later/on top).
        const sprite = worldRoot.children.find((child) => child.zIndex === 4000 - pos.y);
        expect(sprite).toBeDefined();
        expect(card!.zIndex).toBeLessThan(sprite!.zIndex);
    });

    test("follows the unit and disappears once it is no longer a revealed silhouette", () => {
        const { unit, worldRoot } = revealedUnit();
        const card = cardOf(worldRoot)!;
        const labelBefore = (card.children.find((child) => child instanceof Text) as Text).y;

        unit.setPosition(pos.x + 300, pos.y);
        unit.ensureVisual(worldRoot, gridSettings);
        const label = card.children.find((child) => child instanceof Text) as Text;
        expect(label.x).toBe(pos.x + 300);
        expect(label.y).toBe(labelBefore);

        unit.setVisualRevealed(false);
        unit.ensureVisual(worldRoot, gridSettings);
        expect(card.visible).toBe(false);
    });

    test("a normal board unit never builds one", () => {
        const unit = createRenderableUnit(TeamVals.LOWER, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(pos.x, pos.y);
        const worldRoot = new Container();
        unit.ensureVisual(worldRoot, gridSettings);

        expect(cardOf(worldRoot)).toBeUndefined();
    });
});

describe("RenderableUnit steady-state overlays", () => {
    type OverlayInternals = {
        badgeFlag?: Graphics;
        stackPowerPips: Graphics[];
        hourglassContainer?: Container;
        stunContainer?: Container;
        respondContainer?: Container;
    };

    test("reuses static badge and stack geometry without allocating inactive status icons", () => {
        const unit = createRenderableUnit(TeamVals.LOWER, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.setStackPower(3);
        unit.setVisualVisible(false);
        const worldRoot = new Container();

        unit.ensureVisual(worldRoot, gridSettings);
        const internals = unit as unknown as OverlayInternals;
        expect(internals.badgeFlag).toBeDefined();
        expect(internals.stackPowerPips).toHaveLength(5);
        expect(internals.hourglassContainer).toBeUndefined();
        expect(internals.stunContainer).toBeUndefined();
        expect(internals.respondContainer).toBeUndefined();

        type ClearableGraphics = { clear: () => void };
        const trackedGraphics = [internals.badgeFlag!, ...internals.stackPowerPips];
        const restores: Array<() => void> = [];
        let clearCalls = 0;
        for (const graphic of trackedGraphics) {
            const clearable = graphic as unknown as ClearableGraphics;
            const originalClear = clearable.clear;
            clearable.clear = () => {
                clearCalls++;
                originalClear.call(graphic);
            };
            restores.push(() => {
                clearable.clear = originalClear;
            });
        }

        try {
            unit.ensureVisual(worldRoot, gridSettings);
            expect(clearCalls).toBe(0);

            unit.setStackPower(4);
            unit.ensureVisual(worldRoot, gridSettings);
            expect(clearCalls).toBe(5);

            unit.setActiveTurn(true);
            unit.ensureVisual(worldRoot, gridSettings);
            expect(clearCalls).toBe(6);
        } finally {
            restores.forEach((restore) => restore());
        }
    });
});

describe("RenderableUnit applied buff/debuff display de-duplication", () => {
    test("collapses a repeated name onto its first entry", () => {
        const names = ["Visible", "Hidden", "Visible"];
        const laps = [3, 2, 1];
        const descriptions = ["from the snapshot", "hidden", "re-applied locally"];
        const powers = [0, 0, 7];

        expect(dropDuplicateAppliedEntries(names, laps, descriptions, powers)).toBe(true);
        expect(names).toEqual(["Visible", "Hidden"]);
        expect(laps).toEqual([3, 2]);
        expect(descriptions).toEqual(["from the snapshot", "hidden"]);
        expect(powers).toEqual([0, 0]);
    });

    test("leaves a list without repeats untouched", () => {
        const names = ["Visible", "Hidden"];
        expect(dropDuplicateAppliedEntries(names, [1, 1], ["a", "b"], [0, 0])).toBe(false);
        expect(names).toEqual(["Visible", "Hidden"]);
    });

    test("refuses to splice arrays that are already desynced", () => {
        const names = ["Visible", "Visible"];
        expect(dropDuplicateAppliedEntries(names, [1], ["a", "b"], [0, 0])).toBe(false);
        expect(names).toHaveLength(2);
    });

    test("leaves a single Visible on a unit that carries it twice (the ranked double-render)", () => {
        const tiger = createRenderableUnit(TeamVals.UPPER, "Nature", "White Tiger", "white_tiger_512");
        const visible = new Spell({ spellProperties: HoCConfig.getSpellConfig("System", "Visible"), amount: 1 });
        // Ranked shape: the snapshot seeds one display entry, common's guarded re-apply appends another.
        tiger.applyDebuff(visible);
        tiger.applyDebuff(visible);
        expect(tiger.getUnitProperties().applied_debuffs).toEqual(["Visible", "Visible"]);

        expect(tiger.dropDuplicateAppliedDisplayEntries()).toBe(true);

        const properties = tiger.getUnitProperties();
        expect(properties.applied_debuffs).toEqual(["Visible"]);
        expect(properties.applied_debuffs_laps).toHaveLength(1);
        expect(properties.applied_debuffs_descriptions).toHaveLength(1);
        expect(properties.applied_debuffs_powers).toHaveLength(1);
        expect(tiger.dropDuplicateAppliedDisplayEntries()).toBe(false);
    });

    test("collapses a duplicated buff the same way", () => {
        const tiger = createRenderableUnit(TeamVals.UPPER, "Nature", "White Tiger", "white_tiger_512");
        const hidden = new Spell({ spellProperties: HoCConfig.getSpellConfig("System", "Hidden"), amount: 1 });
        tiger.applyBuff(hidden);
        tiger.applyBuff(hidden);

        expect(tiger.dropDuplicateAppliedDisplayEntries()).toBe(true);
        expect(tiger.getUnitProperties().applied_buffs).toEqual(["Hidden"]);
        expect(tiger.getUnitProperties().applied_buffs_laps).toHaveLength(1);
        expect(tiger.hasBuffActive("Hidden")).toBe(true);
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
