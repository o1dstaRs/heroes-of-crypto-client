import { expect, test } from "bun:test";
import { Container, Sprite, Texture } from "pixi.js";
import { addEffectCaption, updateEffectCaption } from "./EffectCaption";
import { FlagOverlayLayout } from "./FlagOverlayLayout";
import { releaseBoardMirror, setBoardMirror } from "../../pixi/boardMirror";
import { EFFECT_FACTION_COLORS } from "../effectCaptions";

test.each([false, true])("names stay beneath art, above damage, and readable with board mirror=%s", (mirror) => {
    const world = new Container();
    world.scale.set(mirror ? -1 : 1, -0.7);
    const art = new Container();
    const sprite = new Sprite(Texture.WHITE);
    sprite.anchor.set(0.5, 1);
    sprite.width = sprite.height = 64;
    art.addChild(sprite);
    art.scale.y = -1;
    world.addChild(art);
    setBoardMirror(world, mirror);
    try {
        const caption = addEffectCaption(art, "Petrifying Gaze", 64);
        const layout = new FlagOverlayLayout();
        const anchor = { x: 100, y: 200, unitId: "victim" };
        layout.add(art, () => anchor);
        const number = new Container();
        world.addChild(number);
        number.position.set(100, 220);
        layout.update([{ container: number, flagAnchor: anchor, topExtent: 30 }], 6);
        expect(caption.text.text).toBe("Petrifying Gaze");
        expect(caption.text.style.fill).toBe(EFFECT_FACTION_COLORS.Chaos);
        expect(caption.root.y).toBeGreaterThan(0);
        expect(caption.root.getGlobalTransform().a).toBeGreaterThan(0);
        expect(caption.root.getGlobalTransform().d).toBeGreaterThan(0);
        const bounds = art.getLocalBounds();
        expect(art.y + Math.min(bounds.minY * art.scale.y, bounds.maxY * art.scale.y)).toBeGreaterThanOrEqual(256);
        // Beholder rows already counter the board mirror. They must not flip their text twice.
        art.scale.x = mirror ? -1 : 1;
        updateEffectCaption(caption);
        expect(caption.root.getGlobalTransform().a).toBeGreaterThan(0);
    } finally {
        releaseBoardMirror(world);
        world.destroy({ children: true });
    }
});
