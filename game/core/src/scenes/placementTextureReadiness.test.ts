import { afterAll, beforeAll, expect, test } from "bun:test";
import { Container, Texture, TextureSource, type Sprite } from "pixi.js";
import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    TeamVals,
    type TeamType,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";
import creatures from "../../../heroes-of-crypto-common/src/configuration/creatures.json";
import { RenderableUnit } from "./RenderableUnit";

const grid = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const roster = Object.entries(creatures).flatMap(([faction, units]) =>
    typeof units === "object" ? Object.keys(units).map((name) => ({ faction, name })) : [],
);
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const art = new Texture({ source: new TextureSource({ width: 768, height: 768 }) });
const atlas = new Texture({ source: new TextureSource({ width: 32768, height: 32768 }) });

beforeAll(() => {
    if (!originalDocument)
        Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: { createElement: () => ({ getContext: () => null, setAttribute: () => undefined }) },
        });
});
afterAll(() => {
    if (!originalDocument) Reflect.deleteProperty(globalThis, "document");
});

function makeUnit(faction: string, name: string, team: TeamType, ready: () => boolean) {
    const effects = new EffectFactory();
    return RenderableUnit.fromBase(
        Unit.createUnit(
            HoCConfig.getCreatureConfig(team, faction, name, `${name.toLowerCase().replaceAll(" ", "_")}_512`, 10),
            grid,
            team,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        ),
        (key) => (key.includes("atlas") ? (ready() ? atlas : undefined) : art),
    );
}

test.each(roster)(
    "$name static placement fallback keeps its canonical size before idle loading",
    ({ faction, name }) => {
        const unit = makeUnit(faction, name, TeamVals.LEFT, () => false);
        const root = new Container();
        root.scale.set(1.4, -0.78);
        try {
            unit.setPosition(640, 128);
            unit.setBattlefieldVisualProjection(true);
            unit.ensureVisual(root, grid);
            const sprite = (unit as unknown as { sprite: Sprite }).sprite;
            const canonical = unit.getStaticBattlefieldPreviewAt(unit.getPosition(), grid, true)!;
            expect(sprite.texture).toBe(art);
            expect(sprite.scale.x).toBeCloseTo(canonical.scaleX, 6);
            expect(sprite.scale.y).toBeCloseTo(canonical.scaleY, 6);
            expect(sprite.x).toBeCloseTo(canonical.x, 6);
            expect(sprite.y).toBeCloseTo(canonical.y, 6);
        } finally {
            unit.destroyVisuals();
            root.destroy({ children: true });
        }
    },
);

test.each(roster)(
    "$name selection fits an idle atlas arriving during placement before the next draw",
    ({ faction, name }) => {
        for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
            for (const y of [128, 1792]) {
                let ready = false;
                const unit = makeUnit(faction, name, team, () => ready);
                const reference = makeUnit(faction, name, team, () => true);
                const root = new Container();
                root.scale.set(team === TeamVals.LEFT ? 1.4 : -1.4, -0.78);
                try {
                    for (const creature of [unit, reference]) {
                        creature.setPosition(640, y);
                        creature.setBattlefieldVisualProjection(true);
                        creature.ensureVisual(root, grid);
                    }
                    ready = true;
                    reference.setBoardSelected(true);
                    reference.ensureVisual(root, grid);
                    unit.setBoardSelected(true);
                    const sprite = (unit as unknown as { sprite: Sprite }).sprite;
                    const expected = (reference as unknown as { sprite: Sprite }).sprite;
                    expect(sprite.texture.width).toBe(expected.texture.width);
                    expect(sprite.texture.height).toBe(expected.texture.height);
                    expect(sprite.scale.x).toBeCloseTo(expected.scale.x, 6);
                    expect(sprite.scale.y).toBeCloseTo(expected.scale.y, 6);
                    expect(sprite.anchor.x).toBeCloseTo(expected.anchor.x, 6);
                    expect(sprite.anchor.y).toBeCloseTo(expected.anchor.y, 6);
                    expect(sprite.x).toBeCloseTo(expected.x, 6);
                    expect(sprite.y).toBeCloseTo(expected.y, 6);
                    unit.ensureVisual(root, grid);
                    expect(sprite.scale.x).toBeCloseTo(expected.scale.x, 6);
                    expect(sprite.scale.y).toBeCloseTo(expected.scale.y, 6);
                } finally {
                    unit.destroyVisuals();
                    reference.destroyVisuals();
                    root.destroy({ children: true });
                }
            }
        }
    },
);
