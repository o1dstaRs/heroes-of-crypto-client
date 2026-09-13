import { beforeAll, expect, test } from "bun:test";
import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";
import { BufferImageSource, Container, Texture } from "pixi.js";
import { RenderableUnit } from "./RenderableUnit";
import { RenderableUnit as ApprovedUnit } from "./LevelOneRenderableUnit";
import { Sandbox } from "./Sandbox";
import { images } from "../generated/image_imports";
import { usesApprovedBaseAnimations } from "../pixi/creatureAnimationSettings";
import { isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "../pixi/productionImageAssetPolicy";
import assets from "../animations/levelOneAssets.json";

const roster = [
    ["Life", "Peasant"],
    ["Life", "Squire"],
    ["Life", "Arbalester"],
    ["Life", "Blacksmith"],
    ["Nature", "Wolf"],
    ["Nature", "Fairy"],
    ["Nature", "Leprechaun"],
    ["Nature", "Dryad"],
    ["Chaos", "Orc"],
    ["Chaos", "Scavenger"],
    ["Chaos", "Troglodyte"],
    ["Chaos", "Wandering Mage"],
    ["Might", "Centaur"],
    ["Might", "Berserker"],
    ["Might", "Wolf Rider"],
    ["Might", "Mermaid"],
];
const grid = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const texture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 8192, height: 8192 }),
});
const resolve = (key: string) => (Object.hasOwn(images, key) ? texture : undefined);
beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
        };
});

test.each(roster)("%s/%s retains the package after authoritative unit reconstruction", (faction, name) => {
    const effects = new EffectFactory(),
        abilityFactory = new AbilityFactory(effects);
    const properties = HoCConfig.getCreatureConfig(
        TeamVals.LEFT,
        faction,
        name,
        name.toLowerCase().replaceAll(" ", "_") + "_512",
        10,
    );
    const placement = RenderableUnit.fromBase(
        Unit.createUnit(properties, grid, TeamVals.LEFT, UnitVals.CREATURE, abilityFactory, effects, false),
        resolve,
    );
    expect(placement instanceof RenderableUnit).toBe(true);
    expect(placement instanceof ApprovedUnit).toBe(true);
    placement.destroyVisuals();
    const hydrate = Sandbox.prototype as unknown as {
        createRenderableUnitFromSceneState(this: unknown, state: unknown): ApprovedUnit;
    };
    const unit = hydrate.createRenderableUnitFromSceneState.call(
        {
            sc_sceneSettings: { getGridSettings: () => grid },
            abilityFactory,
            texAny: resolve,
            ensureDigitTextures: () => {},
        },
        { properties, team: TeamVals.LEFT },
    );
    const root = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(root, grid);
    expect(usesApprovedBaseAnimations(name)).toBe(true);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    const internals = unit as unknown as {
        walkAnim?: { frameIndex: number; frames: Texture[] };
        creatureAnimationLabPreviewEnabled: boolean;
    };
    expect(internals.creatureAnimationLabPreviewEnabled).toBe(true);
    expect(unit.hasAnimationState("idle"), name + "/idle").toBe(true);
    expect(
        (unit as unknown as { selectionAnimFrames?: Texture[] }).selectionAnimFrames?.length,
        name + "/idle frames",
    ).toBeGreaterThan(0);
    unit.startBoardWalkAnimation(1, 3);
    expect(internals.walkAnim?.frames.length).toBeGreaterThan(1);
    const frames = new Set<number>();
    for (let distance = 0; distance < 3; distance += 0.1) {
        unit.setBoardWalkDistanceCells(distance);
        unit.stepSpawnAnimation(1 / 60);
        frames.add(internals.walkAnim!.frameIndex);
    }
    expect(frames.size).toBeGreaterThan(1);
    unit.stopBoardWalkAnimation();
    const melee = [
        "Blacksmith",
        "Arbalester",
        "Fairy",
        "Dryad",
        "Leprechaun",
        "Orc",
        "Centaur",
        "Berserker",
        "Mermaid",
        "Wandering Mage",
    ].includes(name)
        ? "melee_attack"
        : "attack";
    const states = ["hit", "death", melee, melee + "_up", melee + "_down"];
    if (["Orc", "Arbalester", "Dryad", "Centaur"].includes(name)) states.push("attack", "attack_up", "attack_down");
    if (["Blacksmith", "Wandering Mage"].includes(name)) states.push("cast");
    for (const state of states) expect(unit.hasAnimationState(state), name + "/" + state).toBe(true);
    unit.destroyVisuals();
    root.destroy({ children: true });
});

test("paged Arbalester idle survives production pruning without eager decoding", () => {
    const pages = assets.filter((a) => /^arbalester_idle_page_\d{2}_atlas$/.test(a.key));
    expect(pages.length).toBeGreaterThan(1);
    for (const { key } of pages) {
        expect(isProductionOmittedAssetKey(key)).toBe(false);
        expect(isProductionOmittedDisabledUnitAnimationAssetKey(key)).toBe(false);
        expect(Object.hasOwn(images, key)).toBe(true);
    }
});

test("a slow base portrait does not enqueue combat sheets before the creature can appear", () => {
    const effects = new EffectFactory();
    const properties = HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Peasant", "peasant_512", 10);
    const requests: string[] = [];
    let baseAvailable = false;
    const unit = RenderableUnit.fromBase(
        Unit.createUnit(
            properties,
            grid,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        ),
        (key) => {
            requests.push(key);
            return baseAvailable && !key.includes("atlas") ? texture : undefined;
        },
    );
    requests.length = 0;
    const root = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(root, grid);
    expect(requests.some((key) => key.includes("_attack_"))).toBe(false);
    baseAvailable = true;
    unit.ensureVisual(root, grid);
    expect(requests).toContain("peasant_walk_atlas_quarter");
    expect(requests).toContain("peasant_attack_down_atlas_quarter");
    expect(requests.some((key) => key.startsWith("wolf_"))).toBe(false);
    unit.destroyVisuals();
    root.destroy();
});
