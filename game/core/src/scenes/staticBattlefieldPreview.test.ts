import { expect, test } from "bun:test";
import { Container, Sprite, Texture, TextureSource } from "pixi.js";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
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
test("destination ghost stays static while the live figure animates", () => {
    const pose = new Texture({ source: new TextureSource({ width: 192, height: 192 }) });
    const action = new Texture({ source: new TextureSource({ width: 256, height: 256 }) });
    const sprite = new Sprite(pose),
        root = new Container();
    root.addChild(sprite);
    const unit = Object.assign(Object.create(RenderableUnit.prototype), {
        sprite,
        selectionAnimFrames: [pose, action],
        selectionAnimFootAnchorY: 0.95,
        idleAnimationStateAvailable: true,
        smallTextureName: "peasant_512",
        visualScaleMultiplier: 1,
        facingDirection: 1,
        useBattlefieldVisualProjection: false,
        getUnitProperties: () => ({ name: "Peasant", level: 1, size: 1 }),
        getFootprintWidth: () => 1,
        getFootprintHeight: () => 1,
    });
    const destination = { x: 640, y: 640 },
        first = { ...unit.getStaticBattlefieldPreviewAt(destination, grid) };
    sprite.texture = action;
    sprite.scale.set(0.9, -1.2);
    sprite.rotation = 0.2;
    sprite.position.set(35, 90);
    unit.selectionAnimFrameIndex = 1;
    unit.currentRecoilX = 20;
    unit.currentRecoilY = 10;
    const second = { ...unit.getStaticBattlefieldPreviewAt(destination, grid) };
    expect(second).toEqual(first);
    expect(second.texture).toBe(pose);
    expect(sprite.texture).toBe(action);
    expect(sprite.rotation).toBe(0.2);
    const moved = { ...unit.getStaticBattlefieldPreviewAt({ x: 768, y: 640 }, grid) };
    expect(moved.x - second.x).toBe(128);
    root.destroy({ children: true });
    pose.destroy(true);
    action.destroy(true);
});
