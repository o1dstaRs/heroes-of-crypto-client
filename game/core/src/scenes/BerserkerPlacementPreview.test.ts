import { expect, test } from "bun:test";
import { Container, Texture, TextureSource } from "pixi.js";
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

test.each([TeamVals.LEFT, TeamVals.RIGHT])(
    "Berserker placement uses the same sword-idle size as the dropped unit on team %s",
    (team) => {
        const effects = new EffectFactory();
        const base = Unit.createUnit(
            HoCConfig.getCreatureConfig(team, "Might", "Berserker", "berserker_512", 109),
            grid,
            team,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        );
        const art = new Texture({ source: new TextureSource({ width: 768, height: 768 }) });
        const atlas = new Texture({ source: new TextureSource({ width: 8192, height: 8192 }) });
        const unit = RenderableUnit.fromBase(base, (key) => (key.endsWith("_atlas") ? atlas : art));
        const root = new Container();
        try {
            unit.setPosition(384, 640);
            unit.setCreatureAnimationLabPreviewEnabled(true);
            unit.ensureVisual(root, grid, 1000);
            const sprite = (unit as unknown as { sprite: { scale: { x: number; y: number }; anchor: { y: number } } })
                .sprite;
            const preview = { ...unit.getStaticBattlefieldPreviewAt(unit.getPosition(), grid)! };
            expect(preview.scaleX).toBeCloseTo(sprite.scale.x, 6);
            expect(preview.scaleY).toBeCloseTo(sprite.scale.y, 6);
            expect(preview.anchorY).toBeCloseTo(sprite.anchor.y, 6);
            unit.startSpawnAnimation(1);
            unit.stepSpawnAnimation(0.2);
            expect(sprite.scale.y).toBeCloseTo(preview.scaleY, 6);
        } finally {
            unit.destroyVisuals();
            root.destroy({ children: true });
            art.destroy(true);
            atlas.destroy(true);
        }
    },
);
