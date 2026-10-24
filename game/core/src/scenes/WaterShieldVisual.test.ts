import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Container, DOMAdapter, Matrix, Rectangle, Sprite, Texture, type Filter } from "pixi.js";
import { WATER_SHIELD_BREAK_MS, WaterShieldVisual } from "./WaterShieldVisual";
import { WaterShieldRefractionFilter } from "./WaterShieldRefractionFilter";
import { initializeUnitPresentationFields } from "./unitPresentationFields";
import type { Unit } from "@heroesofcrypto/common";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({
        ...adapter,
        createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
    }),
);
afterAll(() => DOMAdapter.set(adapter));

function fixture() {
    const root = new Container();
    const sprite = new Sprite(Texture.WHITE);
    sprite.anchor.set(0.5, 0.95);
    sprite.scale.set(-3, -2);
    sprite.position.set(100, 200);
    sprite.skew.set(0.12, 0.03);
    sprite.pivot.set(2, 4);
    sprite.rotation = 0.17;
    sprite.alpha = 0.7;
    sprite.zIndex = 1000;
    root.addChild(sprite);
    return { root, sprite, shield: new WaterShieldVisual(sprite) };
}

describe("Water Shield liquid ownership and projection", () => {
    test("rupture reuses the shell, shares the optical cutout, expires on large deltas and resets cleanly", () => {
        const { root, sprite, shield } = fixture();
        shield.update(sprite, 1000, 4);
        const geometry = shield.front.geometry;
        const filter = shield.front.filters![0] as WaterShieldRefractionFilter;
        const normalLeft = geometry.positions[0];
        sprite.updateLocalTransform();
        const ground = sprite.localTransform.apply({ x: 0, y: (0.98 - sprite.anchor.y) * sprite.texture.orig.height });
        expect(shield.updateBreak(sprite, 1020, 1000, 4, ground)).toBe(true);
        expect(shield.front.geometry).toBe(geometry);
        expect(shield.front.filters![0]).toBe(filter);
        expect(geometry.positions[0]).toBeLessThan(normalLeft);
        expect(shield.front.shader!.resources.water.uniforms.uBurst).toBeCloseTo(0.02);
        expect(filter.resources.optics.uniforms.uBurst).toBeCloseTo(0.02);
        expect(shield.front.shader!.resources.water.uniforms.uGroundY).toBeCloseTo((0.98 - 0.515) / 0.495);
        const frozenX = shield.front.x;
        const frozenScale = shield.front.scale.x;
        sprite.scale.x *= -1;
        sprite.position.x += 100;
        shield.updateBreak(sprite, 1300, 1000, 4);
        expect(shield.front.scale.x).toBe(frozenScale);
        expect(shield.front.x).toBe(frozenX);
        shield.updateBreak(sprite, 1500, 1000, 4);
        expect(shield.front.filters?.length ?? 0).toBe(0);
        expect(shield.front.visible).toBe(true);
        expect(shield.updateBreak(sprite, 1000 + WATER_SHIELD_BREAK_MS, 1000, 4)).toBe(false);
        expect(shield.front.visible).toBe(false);
        expect(shield.back.visible).toBe(false);
        shield.update(sprite, 3000, 4);
        expect(shield.front.visible).toBe(true);
        expect(geometry.positions[0]).toBeCloseTo(normalLeft);
        expect(filter.resources.optics.uniforms.uBurst).toBe(-1);
        expect(shield.front.shader!.resources.water.uniforms.uBurst).toBe(-1);
        expect(shield.front.filters![0]).toBe(filter);
        shield.destroy();
        expect(filter.resources).toBeNull();
        expect(sprite.texture).toBe(Texture.WHITE);
        expect(root.children).toEqual([sprite]);
        root.destroy({ children: true });
    });
    test("lazy visual resources and lab-only preview stay outside AI rollback state", () => {
        const unit = { engineState: 12 } as unknown as Unit;
        initializeUnitPresentationFields(unit);
        const state = unit as unknown as Record<string, unknown>;
        state.waterShieldVisual = { opaqueGpuResource: true };
        state.waterShieldLabPreview = true;
        state.waterShieldLabBroken = true;
        expect(Object.keys(state)).toEqual(["engineState"]);
        expect(state.waterShieldLabPreview).toBe(true);
        expect(state.waterShieldVisual).toBeDefined();
    });
    test("tracks mirrored movement, skew and anchor without changing the figure or using floor projection", () => {
        const { root, sprite, shield } = fixture();
        shield.update(sprite, 1000);
        for (const mesh of [shield.front, shield.back]) {
            expect(mesh.position).toMatchObject({ x: 100, y: 200 });
            expect(mesh.scale).toMatchObject({ x: -3, y: -2 });
            expect(mesh.skew).toMatchObject({ x: 0.12, y: 0.03 });
            expect(mesh.pivot).toMatchObject({ x: 2, y: 4 });
            expect(mesh.rotation).toBe(0.17);
            expect(mesh.alpha).toBe(0.7);
            expect(mesh.blendMode).toBe("normal");
            expect(mesh.filters?.length ?? 0).toBe(mesh === shield.front ? 1 : 0);
            expect(mesh.geometry.positions[0]).toBeCloseTo(-0.555);
        }
        expect(shield.back.zIndex).toBeLessThan(sprite.zIndex);
        expect(shield.front.zIndex).toBeGreaterThan(sprite.zIndex);
        expect(shield.front.zIndex).toBeLessThan(sprite.zIndex + 1);
        sprite.position.set(320, 260);
        sprite.scale.set(3, -2);
        shield.update(sprite, 1250);
        expect(shield.front.x).toBe(320);
        expect(shield.front.scale.x).toBe(3);
        expect(sprite.texture).toBe(Texture.WHITE);
        shield.destroy();
        root.destroy({ children: true });
    });

    test("reuses both meshes and buffers, handles trimmed atlas cel changes and never destroys shared texture", () => {
        const { root, sprite, shield } = fixture();
        shield.update(sprite, 1000);
        const positionBuffer = shield.front.geometry.getBuffer("aPosition");
        const geometry = shield.front.geometry;
        const filter = shield.front.filters![0] as WaterShieldRefractionFilter;
        const source = Texture.WHITE.source;
        const cel = new Texture({
            source,
            frame: new Rectangle(0, 0, 1, 1),
            orig: new Rectangle(0, 0, 4, 5),
            trim: new Rectangle(1, 2, 1, 1),
        });
        sprite.texture = cel;
        for (let i = 0; i < 120; i++) shield.update(sprite, 2000 + i * 16);
        expect(root.children).toHaveLength(3);
        expect(shield.front.geometry).toBe(geometry);
        expect(geometry.getBuffer("aPosition")).toBe(positionBuffer);
        expect(shield.front.filters![0]).toBe(filter);
        expect(filter.blendRequired).toBe(true);
        expect(filter.resources.uBody).toBe(source);
        expect(filter.resources.optics.uniforms.uAtlasMatrix).toEqual(cel.textureMatrix.mapCoord);
        expect(filter.resources.optics.uniforms.uAtlasClamp).toEqual(cel.textureMatrix.uClampFrame);
        expect(filter.resources.optics.uniforms.uBodyStrength).toBe(0.12);
        expect(filter.resources.optics.uniforms.uStrength).toBe(1);
        expect(filter.resources.optics.uniforms.uTime).toBeCloseTo(3.904);
        expect(geometry.positions[0]).toBeCloseTo(-2.22);
        shield.destroy();
        shield.destroy();
        expect(filter.resources).toBeNull();
        expect(shield.front.destroyed).toBe(true);
        expect(shield.back.destroyed).toBe(true);
        expect(source.destroyed).toBe(false);
        expect(root.children).toEqual([sprite]);
        root.destroy({ children: true });
        cel.destroy(false);
    });

    test("scene refraction maps mirrored/clipped filter UVs back to the same local surface", () => {
        const { root, sprite, shield } = fixture();
        root.alpha = 0.5;
        shield.update(sprite, 1234, 2);
        const filter = shield.front.filters![0] as WaterShieldRefractionFilter;
        let applied = 0;
        const manager = {
            calculateSpriteMatrix(matrix: Matrix, mappedSprite: Sprite) {
                expect(mappedSprite).toBe(sprite);
                return matrix.set(-2, 0.12, 0.07, 4, 0.61, -0.2);
            },
            applyFilter(instance: Filter, input: Texture, output: Texture, clear: boolean) {
                expect(instance).toBe(filter);
                expect(input).toBe(Texture.WHITE);
                expect(output).toBe(Texture.WHITE);
                expect(clear).toBe(false);
                applied++;
            },
        } as unknown as Parameters<Filter["apply"]>[0];
        filter.apply(manager, Texture.WHITE, Texture.WHITE, false);
        const uniforms = filter.resources.optics.uniforms;
        const point = { x: 0.21, y: 0.73 };
        const mapped = uniforms.uSpriteMatrix.apply(point);
        const restored = uniforms.uLocalToFilter.apply(mapped);
        expect(restored.x).toBeCloseTo(point.x);
        expect(restored.y).toBeCloseTo(point.y);
        expect(uniforms.uAlpha).toBeCloseTo(0.35);
        expect(uniforms.uTime).toBe(1.234);
        expect(uniforms.uRadiusX).toBe(shield.front.shader!.resources.water.uniforms.uRadiusX);
        expect(applied).toBe(1);
        expect(filter.padding).toBe(5);
        shield.destroy();
        root.destroy({ children: true });
    });

    test("keeps the painted bubble within one cell for either facing and changed cel size", () => {
        const { root, sprite, shield } = fixture();
        for (const facing of [-1, 1]) {
            sprite.scale.x = facing * 160;
            shield.update(sprite, 1000, 80);
            const radius = shield.front.shader!.resources.water.uniforms.uRadiusX as number;
            // Maximum radial wave displacement is .036; account for that on both edges.
            expect(radius * 2 * 160 * 1.036).toBeLessThanOrEqual(80);
            expect(radius).toBeGreaterThan(0);
        }
        shield.destroy();
        root.destroy({ children: true });
    });

    test("hide, visibility, removal and reparenting leave no stationary ghost", () => {
        const { root, sprite, shield } = fixture();
        shield.update(sprite, 0);
        shield.hide();
        expect(shield.front.visible).toBe(false);
        expect(shield.back.visible).toBe(false);
        shield.update(sprite, 100);
        expect(shield.front.visible).toBe(true);
        sprite.visible = false;
        shield.update(sprite, 200);
        expect(shield.front.visible).toBe(false);
        sprite.visible = true;
        root.removeChild(sprite);
        shield.update(sprite, 300);
        expect(shield.back.visible).toBe(false);
        const nextRoot = new Container();
        nextRoot.addChild(sprite);
        shield.update(sprite, 400);
        expect(shield.front.parent).toBe(nextRoot);
        expect(root.children).toHaveLength(0);
        shield.setDepth(4000);
        expect(shield.front.zIndex).toBe(4000.02);
        shield.destroy();
        root.destroy();
        nextRoot.destroy({ children: true });
    });
});
