import { expect, mock, test } from "bun:test";
import { Container, Texture } from "pixi.js";

import { HoverManager } from "./HoverManager";

const harness = () => {
    const localSpellBadge = { badge: new Container() };
    const opponentSpellBadge = { badge: new Container() };
    const attachToWorldRoot = mock(() => {});
    const layoutSpellBadge = mock(() => {});
    const hover = Object.assign(Object.create(HoverManager.prototype) as object, {
        context: { attachToWorldRoot },
        localSpellBadge,
        opponentSpellBadge,
        layoutSpellBadge,
        ensureAuraGraphics: () => undefined,
        ensureAOEGraphics: () => undefined,
    }) as unknown as HoverManager;
    return { hover, localSpellBadge, opponentSpellBadge, attachToWorldRoot, layoutSpellBadge };
};

test("arming a spell paints its caster label before aiming and clearing it leaves the opponent's label intact", () => {
    const { hover, localSpellBadge, opponentSpellBadge } = harness();
    const paintSpellBadge = mock(() => {});
    Object.assign(hover, { paintSpellBadge });
    const preview = {
        casterPos: { x: 3, y: 4 },
        iconTex: Texture.WHITE,
        label: "Fireball",
        color: 0xff4400,
        beamStyle: "negative" as const,
    };
    hover.drawSpellCastPreview(preview);
    expect(paintSpellBadge).toHaveBeenCalledWith(localSpellBadge, preview);
    hover.clearSpellPreview();
    expect(localSpellBadge.badge.visible).toBe(false);
    expect(opponentSpellBadge.badge.visible).toBe(true);
});

test("both armed-spell labels keep their layout during ticks and camera reattachment", () => {
    const { hover, localSpellBadge, opponentSpellBadge, attachToWorldRoot, layoutSpellBadge } = harness();
    hover.update(1 / 60);
    expect(layoutSpellBadge).toHaveBeenCalledTimes(2);
    expect(layoutSpellBadge).toHaveBeenCalledWith(localSpellBadge);
    expect(layoutSpellBadge).toHaveBeenCalledWith(opponentSpellBadge);
    hover.onCameraChanged();
    expect(attachToWorldRoot).toHaveBeenCalledWith(localSpellBadge.badge, 5600);
    expect(attachToWorldRoot).toHaveBeenCalledWith(opponentSpellBadge.badge, 5600);
    expect(layoutSpellBadge).toHaveBeenCalledTimes(4);
});
