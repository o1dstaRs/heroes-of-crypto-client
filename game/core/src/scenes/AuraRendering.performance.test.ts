import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { Container, DOMAdapter, Mesh, MeshGeometry, Texture, type Geometry, type Shader } from "pixi.js";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { drawGriffinQuestionBowAura, resetGriffinQuestionBowAuras } from "./GriffinQuestionBowAura";
import { drawPegasusWingedSwordAura, resetPegasusWingedSwordAuras } from "./PegasusWingedSwordAura";
import {
    crusaderAuraProjection,
    drawCrusaderSixSwordsAura,
    resetCrusaderSixSwordsAuras,
} from "./CrusaderSixSwordsAura";
import { drawZenaChakramAura, resetZenaChakramAuras } from "./ZenaChakramAura";
import { arachnaWebProjection, drawArachnaQueenWebAura, resetArachnaQueenWebAuras } from "./ArachnaQueenWebAura";
import { drawChampionArrowAura, resetChampionArrowAuras } from "./ChampionArrowAura";

const grid = () =>
    new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
const center = { x: 0, y: 1024 };
const footprint = { width: 2, height: 1 };
const originalAdapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({
        ...originalAdapter,
        createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
    }),
);
afterAll(() => DOMAdapter.set(originalAdapter));

const cases = [
    { name: "Crusader", draw: drawCrusaderSixSwordsAura, reset: resetCrusaderSixSwordsAuras },
    { name: "Champion", draw: drawChampionArrowAura, reset: resetChampionArrowAuras },
    {
        name: "Zena",
        reset: resetZenaChakramAuras,
        draw: (...args: Parameters<typeof drawGriffinQuestionBowAura>) => {
            const [root, texture, point, size, range, gs, owner, alpha, narrowing, now] = args;
            drawZenaChakramAura(
                root,
                texture,
                point,
                (range + size.width / 2) * gs.getCellSize(),
                (range + size.height / 2) * gs.getCellSize(),
                size,
                gs,
                now!,
                alpha,
                narrowing,
                owner,
            );
        },
    },
];

test.each(cases)("$name keeps stationary floor buffers while its artwork animates", ({ draw, reset }) => {
    const root = new Container();
    const gs = grid();
    const tick = (now: number) => {
        reset(root, now);
        draw(root, Texture.WHITE, center, footprint, 2, gs, "owner", 1, 0, now);
    };
    tick(1000);
    const meshes = [...root.children] as Mesh<MeshGeometry>[];
    const uploads = meshes.flatMap((mesh) => [
        spyOn(mesh.geometry.getBuffer("aPosition"), "update"),
        spyOn(mesh.geometry.getIndex(), "update"),
    ]);
    const initialUvs = meshes.map((mesh) => mesh.geometry.uvs.slice());
    try {
        for (let i = 1; i <= 60; i++) tick(1000 + (i * 1000) / 60);
        for (const upload of uploads) expect(upload).not.toHaveBeenCalled();
        expect(meshes.some((mesh, i) => mesh.geometry.uvs.some((v, j) => v !== initialUvs[i][j]))).toBe(true);
        reset(root, 8000);
        expect(root.children).toHaveLength(0);
        expect(meshes.every((mesh) => mesh.destroyed)).toBe(true);
    } finally {
        for (const upload of uploads) upload.mockRestore();
        root.destroy({ children: true });
    }
});

test("rotating floor cache follows moved centres, footprints, range, narrowing and grid bounds", () => {
    const gs = grid();
    let previous = crusaderAuraProjection(center, footprint, 2, 0, gs)!;
    const positions = previous.positions;
    const uvs = previous.uvs;
    expect(crusaderAuraProjection({ ...center }, { ...footprint }, 2, 0.7, grid(), 0, previous)).toBe(previous);
    expect(previous.positions).toBe(positions);
    expect(previous.uvs).toBe(uvs);
    for (const [point, size, range, narrowing, settings] of [
        [{ x: -768, y: 512 }, footprint, 2, 0, gs],
        [center, { width: 3, height: 2 }, 2, 0, gs],
        [center, footprint, 3, 0, gs],
        [center, footprint, 2, 3, gs],
        [center, footprint, 2, 0, new GridSettings(16, 1024, 0, 512, -512, 5, 0.06)],
    ] as const) {
        const next = crusaderAuraProjection(point, size, range, -1.2, settings, narrowing, previous)!;
        const fresh = crusaderAuraProjection(point, size, range, -1.2, settings, narrowing)!;
        expect(next.positions).not.toBe(previous.positions);
        expect(next.positions).toEqual(fresh.positions);
        expect(next.uvs).toEqual(fresh.uvs);
        expect(next.indices).toEqual(fresh.indices);
        previous = next;
    }
});

test("Champion blends every tick while uploading UVs only for a new cel, facing or footprint", () => {
    const root = new Container();
    const gs = grid();
    const point = { ...center };
    const tick = (now: number, facing: -1 | 1 = 1, narrowing = 0) => {
        resetChampionArrowAuras(root, now);
        drawChampionArrowAura(root, Texture.WHITE, point, footprint, 2, gs, "owner", 1, narrowing, now, facing);
    };
    tick(1000);
    const mesh = root.children[0] as Mesh<MeshGeometry>;
    const upload = spyOn(mesh.geometry.getBuffer("aUV"), "update");
    try {
        tick(1025);
        const alpha = mesh.alpha;
        tick(1040);
        expect(upload).not.toHaveBeenCalled();
        expect(mesh.alpha).not.toBe(alpha);
        tick(1050);
        expect(upload).toHaveBeenCalledTimes(1);
        const forward = mesh.geometry.uvs.slice();
        tick(1050, -1);
        expect(upload).toHaveBeenCalledTimes(2);
        expect(mesh.geometry.uvs).not.toEqual(forward);
        point.x -= 512;
        tick(1050, -1, 1);
        expect(upload).toHaveBeenCalledTimes(3);
        expect(mesh.geometry.positions).toEqual(arachnaWebProjection(point, footprint, 2, gs, 1)!.positions);
    } finally {
        upload.mockRestore();
        root.destroy({ children: true });
    }
});

test("procedural web caches silk geometry, animates its reveal and rebuilds only a changed footprint", () => {
    const adapter = DOMAdapter.get();
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement });
    const root = new Container();
    const gs = grid();
    const tick = (now: number, range = 2) => {
        resetArachnaQueenWebAuras(root, now);
        drawArachnaQueenWebAura(root, Texture.WHITE, center, footprint, range, gs, "owner", 1, 0, now);
    };
    try {
        tick(0);
        const silk = root.children[1] as Mesh<Geometry, Shader>;
        const geometry = silk.geometry;
        // Exactly eight structural spokes receive the stronger cable material.
        const mainCables = geometry.getBuffer("aMainCable").data;
        expect(Array.from(mainCables).filter((weight) => weight === 1)).toHaveLength(8 * 91 * 2);
        expect(Math.max(...geometry.getBuffer("aBranchTravel").data)).toBeGreaterThan(0);
        for (let time = 100; time <= 1000; time += 100) tick(time);
        expect(silk.geometry).toBe(geometry);
        expect(silk.shader!.resources.silk.uniforms.uTime).toBe(1);
        expect(silk.shader!.resources.silk.uniforms.uReveal).toBe(1);
        tick(1100, 3);
        expect(silk.geometry).not.toBe(geometry);
        expect(root.children).toHaveLength(4);
        resetArachnaQueenWebAuras(root, 8000);
        expect(root.children).toHaveLength(0);
    } finally {
        root.destroy({ children: true });
        DOMAdapter.set(adapter);
    }
});

test("procedural Griffin tornado animates its shader without re-uploading stationary shells", () => {
    const adapter = DOMAdapter.get();
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement });
    const root = new Container();
    const gs = grid();
    const tick = (now: number) => {
        resetGriffinQuestionBowAuras(root, now);
        drawGriffinQuestionBowAura(root, undefined, center, footprint, 2, gs, "owner", 1, 0, now);
    };
    const uploads: ReturnType<typeof spyOn>[] = [];
    try {
        tick(1000);
        const shells = root.children
            .flatMap((layer) => layer.children)
            .filter((child) => child instanceof Mesh) as Mesh<MeshGeometry, Shader>[];
        expect(shells).toHaveLength(4);
        expect(shells.filter((mesh) => mesh.label === "griffin-tornado-dust")).toHaveLength(2);
        for (const mesh of shells) uploads.push(spyOn(mesh.geometry.getBuffer("aPosition"), "update"));
        for (let i = 1; i <= 60; i++) tick(1000 + (i * 1000) / 60);
        for (const upload of uploads) expect(upload).not.toHaveBeenCalled();
        expect(shells[0].shader!.resources.storm.uniforms.uTime).toBe(1);
        resetGriffinQuestionBowAuras(root, 8000);
        expect(root.children).toHaveLength(0);
        expect(shells.every((mesh) => mesh.destroyed)).toBe(true);
    } finally {
        for (const upload of uploads) upload.mockRestore();
        root.destroy({ children: true });
        DOMAdapter.set(adapter);
    }
});

test("Pegasus feather storm advances GPU time without uploading stationary position, UV or index buffers", () => {
    const root = new Container(),
        gs = grid();
    const tick = (now: number) => {
        resetPegasusWingedSwordAuras(root, now);
        drawPegasusWingedSwordAura(root, undefined, center, footprint, 2, gs, "owner", 1, 0, now);
    };
    tick(1000);
    const meshes = root.children
        .flatMap((layer) => layer.children)
        .filter((child) => child instanceof Mesh) as Mesh<MeshGeometry>[];
    expect(meshes).toHaveLength(5);
    const uploads = meshes.flatMap((mesh) => [
        spyOn(mesh.geometry.getBuffer("aPosition"), "update"),
        spyOn(mesh.geometry.getBuffer("aUV"), "update"),
        spyOn(mesh.geometry.getIndex(), "update"),
    ]);
    try {
        for (let i = 1; i <= 60; i++) tick(1000 + (i * 1000) / 60);
        for (const upload of uploads) expect(upload).not.toHaveBeenCalled();
        for (const mesh of meshes) expect(mesh.shader!.resources.aura.uniforms.uTime).toBe(1);
        resetPegasusWingedSwordAuras(root, 8000);
        expect(root.children).toHaveLength(0);
        expect(meshes.every((mesh) => mesh.destroyed)).toBe(true);
    } finally {
        for (const upload of uploads) upload.mockRestore();
        root.destroy({ children: true });
    }
});
