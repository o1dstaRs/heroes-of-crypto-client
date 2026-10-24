import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { Container, DOMAdapter, Mesh, Texture, TextureSource } from "pixi.js";
import { CYCLOPS_GORE_LIFE, CYCLOPS_GORE_MAX_ACTIVE, CYCLOPS_GORE_PARTICLES, CyclopsGoreVfx } from "./CyclopsGoreVfx";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
const fixture = (stretch = 1) => {
    const world = new Container();
    const texture = new Texture({ source: new TextureSource({ width: 768, height: 1024 }) });
    const pose = { texture, x: 128, y: 256, anchorX: 0.5, anchorY: 0.97, scaleX: 0.24, scaleY: -0.24 };
    const effect = new CyclopsGoreVfx((root) => {
        world.addChild(root);
        return stretch;
    });
    const spawn = (seed = 1) => effect.spawn(pose, 80, { x: 160, y: 40 }, seed);
    const particles = (index = 0) =>
        world.children[index].children.find((child) => child.label === "meat-fragments") as Mesh;
    const cleanup = () => {
        effect.clear();
        world.destroy({ children: true });
        texture.destroy(true);
    };
    return { world, texture, pose, effect, spawn, particles, cleanup };
};

test("shared animation uniforms and seeded noise keep high precision in both WebGL stages", () => {
    const f = fixture();
    try {
        f.spawn();
        for (const label of ["meat-fragments", "blood-mist"]) {
            const mesh = f.world.children[0].children.find((child) => child.label === label) as Mesh;
            const program = mesh.shader!.glProgram!;
            // Pixi defaults vertex floats to highp and fragment floats to mediump.
            // A shared uTime with those defaults fails to link; mediump also ruins the noise hash.
            for (const source of [program.vertex, program.fragment]) {
                // Pixi may prepend a fallback before the shader's explicit declaration.
                const precision = [...(source?.matchAll(/precision\s+(\w+)\s+float\s*;/g) ?? [])].at(-1)?.[1];
                expect(precision).toBe("highp");
            }
        }
    } finally {
        f.cleanup();
    }
});

test("thousands of alpha-masked particles share immutable GPU buffers across victims and frames", () => {
    const f = fixture();
    try {
        expect(f.spawn()).toBe(true);
        expect(f.spawn(2)).toBe(true);
        const geometry = f.particles().geometry;
        const data = geometry.getBuffer("aPosition").data;
        const update = spyOn(geometry.getBuffer("aPosition"), "update");
        expect(geometry.getIndex().data.length).toBe(CYCLOPS_GORE_PARTICLES * 6);
        expect(f.particles(1).geometry).toBe(geometry);
        f.effect.update(0.12);
        expect(f.particles().geometry.getBuffer("aPosition").data).toBe(data);
        expect(update).not.toHaveBeenCalled();
        expect(f.particles().shader!.resources.goreUniforms.uniforms.uTime).toBe(0.12);
    } finally {
        f.cleanup();
    }
});

test.each([0.65, 1, 1.4])("the body remains planted and keeps its facing under board stretch %s", (stretch) => {
    const f = fixture(stretch);
    try {
        for (const facing of [-1, 1]) {
            f.pose.scaleX = 0.24 * facing;
            f.spawn();
            const root = f.world.children.at(-1)!;
            const mesh = root.children.find((child) => child.label === "meat-fragments") as Mesh;
            const uniforms = mesh.shader!.resources.goreUniforms.uniforms;
            expect(root.position.x).toBe(f.pose.x);
            expect(root.position.y).toBe(f.pose.y);
            expect(root.scale.y).toBe(stretch);
            expect(uniforms.uBody[0]).toBeCloseTo(768 * f.pose.scaleX, 4);
            expect(uniforms.uBody[1] * stretch).toBeCloseTo(1024 * f.pose.scaleY, 4);
            expect(uniforms.uFloor).toBeCloseTo(0, 8);
        }
    } finally {
        f.cleanup();
    }
});

test("burst limits, expiration and repeated clear release owned resources without destroying unit art", () => {
    const f = fixture();
    try {
        f.spawn();
        const first = f.world.children[0];
        const geometry = f.particles().geometry;
        const destroy = spyOn(geometry, "destroy");
        for (let i = 1; i <= CYCLOPS_GORE_MAX_ACTIVE + 3; i++) f.spawn(i);
        expect(f.world.children).toHaveLength(CYCLOPS_GORE_MAX_ACTIVE);
        expect(first.destroyed).toBe(true);
        expect(destroy).not.toHaveBeenCalled();
        f.effect.update(CYCLOPS_GORE_LIFE);
        expect(f.effect.active).toBe(false);
        expect(f.world.children).toHaveLength(0);
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(f.texture.destroyed).toBe(false);
        f.effect.clear();
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(f.spawn(99)).toBe(true);
        expect(f.particles().geometry).not.toBe(geometry);
    } finally {
        f.cleanup();
    }
});

test("external scene teardown safely releases shared buffers and shaders exactly once", () => {
    const f = fixture();
    f.spawn();
    f.spawn(2);
    const destroy = spyOn(f.particles().geometry, "destroy");
    expect(() => f.world.destroy({ children: true })).not.toThrow();
    expect(() => f.effect.update(0.1)).not.toThrow();
    expect(f.effect.active).toBe(false);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(f.texture.destroyed).toBe(false);
    f.effect.clear();
    f.texture.destroy(true);
});

test("invalid poses do no work and invalid time steps cannot poison the animation clock", () => {
    const f = fixture();
    try {
        expect(f.effect.spawn({ ...f.pose, scaleX: 0 }, 80, { x: 1, y: 0 })).toBe(false);
        expect(f.effect.spawn(f.pose, 0, { x: 1, y: 0 })).toBe(false);
        expect(f.effect.spawn(f.pose, 80, { x: NaN, y: 0 })).toBe(false);
        expect(f.world.children).toHaveLength(0);
        f.spawn();
        f.effect.update(NaN);
        f.effect.update(-10);
        expect(f.particles().shader!.resources.goreUniforms.uniforms.uTime).toBe(0);
        f.effect.update(0.25);
        expect(f.particles().shader!.resources.goreUniforms.uniforms.uTime).toBe(0.25);
    } finally {
        f.cleanup();
    }
});
