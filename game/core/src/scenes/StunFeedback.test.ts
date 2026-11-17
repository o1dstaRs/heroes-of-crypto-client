import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import { Container, DOMAdapter, Sprite, Texture } from "pixi.js";
import {
    AbilityFactory,
    EffectFactory,
    FightStateManager,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";
import { RenderableUnit } from "./RenderableUnit";
import { releaseBoardMirror, setBoardMirror } from "../pixi/boardMirror";

const gs = new GridSettings(16, 1024, 0, 1024, 0, 64, 32);
type View = { sprite: Sprite; badgeContainer: Container; stunStars?: { root: Container } };
const cleanups: (() => void)[] = [];
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
afterEach(() => {
    cleanups
        .splice(0)
        .reverse()
        .forEach((cleanup) => cleanup());
    FightStateManager.getInstance().reset();
});
function fixture(mirror = false) {
    let now = 1000;
    const clock = spyOn(performance, "now").mockImplementation(() => now);
    const effects = new EffectFactory();
    const unit = RenderableUnit.fromBase(
        Unit.createUnit(
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Squire", "", 10),
            gs,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        ),
        (key) => (key.includes("atlas") ? undefined : Texture.WHITE),
    );
    unit.setPosition(320, 320);
    const root = new Container();
    root.scale.set(mirror ? -0.8 : 0.8, -0.5);
    setBoardMirror(root, mirror);
    cleanups.push(() => {
        unit.destroyVisuals();
        root.destroy({ children: true });
        releaseBoardMirror(root);
        clock.mockRestore();
    });
    const draw = () => unit.ensureVisual(root, gs);
    draw();
    const view = unit as unknown as View;
    const apply = (name: string) => expect(unit.applyEffect(effects.makeEffect(name)!)).toBe(true);
    return {
        unit,
        root,
        view,
        draw,
        apply,
        time: (value: number) => {
            now = value;
        },
    };
}
const point = (sprite: { x: number; y: number }) => ({ x: sprite.x, y: sprite.y });

test.each(["Stun", "Blindness"])("%s has persistent stars and a small body-only tremor", (name) => {
    const f = fixture();
    const logical = { ...f.unit.getPosition() };
    const base = point(f.view.sprite),
        flag = point(f.view.badgeContainer);
    f.apply(name);
    f.draw();
    expect(f.view.stunStars?.root.visible).toBe(true);
    f.time(1200);
    f.draw();
    const moved = point(f.view.sprite);
    expect(Math.hypot(moved.x - base.x, moved.y - base.y)).toBeGreaterThan(0.05);
    expect(Math.abs(moved.x - base.x)).toBeLessThan(2);
    expect(Math.abs(moved.y - base.y)).toBeLessThan(0.5);
    expect(point(f.view.badgeContainer)).toEqual(flag);
    expect(f.unit.getPosition()).toEqual(logical);
    // Repeated draws of the same instant cannot accumulate the shake into travel.
    for (let i = 0; i < 50; i++) f.draw();
    expect(point(f.view.sprite)).toEqual(moved);
    f.time(10_000);
    f.draw();
    expect(f.view.stunStars?.root.visible).toBe(true);
    f.unit.deleteEffect(name);
    f.draw();
    expect(f.view.stunStars?.root.visible).toBe(false);
    expect(point(f.view.sprite)).toEqual(base);
});

test.each(["Stun", "Blindness"])("removing %s from a combined disable leaves the other cue active", (removed) => {
    const f = fixture();
    f.apply("Stun");
    f.apply("Blindness");
    f.draw();
    f.time(1400);
    f.draw();
    expect(f.view.stunStars?.root.visible).toBe(true);
    f.unit.deleteEffect(removed);
    f.draw();
    expect(f.view.stunStars?.root.visible).toBe(true);
    f.unit.deleteEffect(removed === "Stun" ? "Blindness" : "Stun");
    f.draw();
    expect(f.view.stunStars?.root.visible).toBe(false);
});

test.each(["Stun", "Blindness", "authoritative skip"])(
    "%s feedback waits for contact even after local recovery",
    (name) => {
        const f = fixture();
        let pending = true;
        const base = point(f.view.sprite);
        f.unit.beginCombatStatusPresentation(() => pending);
        if (name === "authoritative skip") f.unit.setSkipping(true);
        else f.apply(name);
        expect(f.unit.isSkippingApplied()).toBe(true);
        f.time(2000);
        f.draw();
        expect(f.unit.isSkippingDisplayed()).toBe(false);
        expect(f.view.stunStars?.root.visible ?? false).toBe(false);
        expect(point(f.view.sprite)).toEqual(base);
        pending = false;
        f.time(2200);
        f.draw();
        // The impact latch survives an ended/rejected authoritative re-apply; recovery is not contact.
        expect(f.view.stunStars?.root.visible ?? false).toBe(false);
        expect(point(f.view.sprite)).toEqual(base);
        f.unit.presentCombatStatusAtImpact();
        f.draw();
        expect(f.view.stunStars?.root.visible).toBe(true);
        f.time(2400);
        f.draw();
        expect(point(f.view.sprite)).not.toEqual(base);
    },
);

test.each([false, true])("ranked skip-only feedback is finite, persistent and removable; mirror=%s", (mirror) => {
    const f = fixture(mirror);
    const base = point(f.view.sprite),
        flag = point(f.view.badgeContainer);
    expect(f.unit.hasStatusEffect("Stun")).toBe(false);
    expect(f.unit.hasStatusEffect("Blindness")).toBe(false);
    f.unit.setSkipping(true);
    f.draw();
    f.time(1800);
    f.draw();
    expect(f.view.stunStars?.root.visible).toBe(true);
    expect(Number.isFinite(f.view.sprite.x) && Number.isFinite(f.view.sprite.y)).toBe(true);
    expect(point(f.view.sprite)).not.toEqual(base);
    expect(point(f.view.badgeContainer)).toEqual(flag);
    f.unit.setSkipping(false);
    f.draw();
    expect(f.view.stunStars?.root.visible).toBe(false);
    expect(point(f.view.sprite)).toEqual(base);
});

test("Freeze retains its static ice visual, while Whirlpool cannot hide another disable", () => {
    const f = fixture();
    const base = point(f.view.sprite);
    f.apply("Blindness");
    f.apply("Freeze");
    f.draw();
    f.time(1500);
    f.draw();
    expect(f.view.stunStars?.root.visible ?? false).toBe(false);
    expect(point(f.view.sprite)).toEqual(base);
    f.unit.deleteEffect("Freeze");
    const properties = f.unit.getUnitProperties();
    properties.applied_debuffs.push("Whirlpool");
    properties.applied_debuffs_laps.push(2);
    f.draw();
    expect(f.view.stunStars?.root.visible).toBe(true);
    f.unit.deleteEffect("Blindness");
    f.draw();
    expect(f.view.stunStars?.root.visible).toBe(false);
});

test("ghosts, dead stacks and full teardown cannot leave stars or shaking behind", () => {
    const f = fixture();
    f.apply("Blindness");
    f.draw();
    f.time(1600);
    f.draw();
    const stars = f.view.stunStars!.root;
    f.unit.setVisualGhost(true);
    f.draw();
    expect(stars.visible).toBe(false);
    f.unit.setVisualGhost(false);
    f.draw();
    expect(stars.visible).toBe(true);
    f.unit.setRemainingStats(0, 0, 10);
    f.draw();
    expect(stars.visible).toBe(false);
    f.unit.destroyVisuals();
    expect(stars.destroyed).toBe(true);
});
