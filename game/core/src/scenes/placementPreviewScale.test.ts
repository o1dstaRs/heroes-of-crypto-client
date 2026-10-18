import { afterAll, beforeAll, expect, test } from "bun:test";
import { Container, Sprite, Texture, TextureSource } from "pixi.js";
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
import creatures from "../../../heroes-of-crypto-common/src/configuration/creatures.json";
import { RenderableUnit } from "./RenderableUnit";
import { HoverManager } from "./HoverManager";

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
    // Canvas-backed cosmetic masks are unavailable in Bun; keep the real unit/atlas sizing path.
    if (!originalDocument) {
        Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: { createElement: () => ({ getContext: () => null, setAttribute: () => undefined }) },
        });
    }
});
afterAll(() => {
    if (!originalDocument) Reflect.deleteProperty(globalThis, "document");
});

test.each(roster)("$name placement preview matches its placed figure on both sides and rows", ({ faction, name }) => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        for (const y of [128, 1792]) {
            const effects = new EffectFactory();
            const textureName = `${name.toLowerCase().replaceAll(" ", "_")}_512`;
            const base = Unit.createUnit(
                HoCConfig.getCreatureConfig(team, faction, name, textureName, 10),
                grid,
                team,
                UnitVals.CREATURE,
                new AbilityFactory(effects),
                effects,
                false,
            );
            const unit = RenderableUnit.fromBase(base, (key) => (key.includes("atlas") ? atlas : art));
            const root = new Container();
            root.scale.set(team === TeamVals.LEFT ? 1.4 : -1.4, -0.78);
            try {
                unit.setPosition(640, y);
                unit.setBattlefieldVisualProjection(true);
                unit.setCreatureAnimationLabPreviewEnabled(true);
                unit.ensureVisual(root, grid);
                const sprite = (
                    unit as unknown as {
                        sprite: {
                            scale: { x: number; y: number; set: (x: number, y: number) => void };
                            anchor: { x: number; y: number };
                            x: number;
                            y: number;
                            rotation: number;
                        };
                    }
                ).sprite;
                const preview = { ...unit.getStaticBattlefieldPreviewAt(unit.getPosition(), grid)! };
                expect(preview.scaleX).toBeCloseTo(sprite.scale.x, 6);
                expect(preview.scaleY).toBeCloseTo(sprite.scale.y, 6);
                expect(preview.anchorX).toBeCloseTo(sprite.anchor.x, 6);
                expect(preview.anchorY).toBeCloseTo(sprite.anchor.y, 6);
                expect(preview.x).toBeCloseTo(sprite.x, 6);
                expect(preview.y).toBeCloseTo(sprite.y, 6);

                const hover = Object.assign(Object.create(HoverManager.prototype), {
                    context: {
                        sceneSettings: { getGridSettings: () => grid },
                        texAny: () => art,
                        attachToWorldRoot: (child: Sprite) => root.addChild(child),
                    },
                }) as {
                    ensureHoverSilhouetteParams: (
                        props: ReturnType<Unit["getUnitProperties"]>,
                        position: ReturnType<Unit["getPosition"]>,
                        isAttack: boolean,
                        previewUnit: RenderableUnit,
                        exactPlacementCopy: boolean,
                    ) => void;
                    hoverSilhouette: Sprite;
                };
                hover.ensureHoverSilhouetteParams(unit.getUnitProperties(), unit.getPosition(), false, unit, true);
                expect(hover.hoverSilhouette.scale.x).toBeCloseTo(sprite.scale.x, 6);
                expect(hover.hoverSilhouette.scale.y).toBeCloseTo(sprite.scale.y, 6);
                expect(hover.hoverSilhouette.x).toBeCloseTo(sprite.x, 6);
                expect(hover.hoverSilhouette.y).toBeCloseTo(sprite.y, 6);
                expect(hover.hoverSilhouette.alpha).toBe(1);

                // A static destination must not inherit a recoil, lean, or other live animation transform.
                sprite.scale.set(sprite.scale.x * 0.7, sprite.scale.y * 1.2);
                sprite.rotation = 0.3;
                sprite.x += 20;
                sprite.y -= 10;
                expect({ ...unit.getStaticBattlefieldPreviewAt(unit.getPosition(), grid)! }).toEqual(preview);
            } finally {
                unit.destroyVisuals();
                root.destroy({ children: true });
            }
        }
    }
});
