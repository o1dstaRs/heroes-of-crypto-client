import { expect, spyOn, test } from "bun:test";
import { Container, Mesh, MeshGeometry, Texture } from "pixi.js";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import {
    drawGriffinQuestionBowAura,
    griffinAuraProjection,
    resetGriffinQuestionBowAuras,
} from "./GriffinQuestionBowAura";
import { drawPegasusWingedSwordAura, resetPegasusWingedSwordAuras } from "./PegasusWingedSwordAura";
import { drawCrusaderSixSwordsAura, resetCrusaderSixSwordsAuras } from "./CrusaderSixSwordsAura";
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

const cases = [
    { name: "Griffin", draw: drawGriffinQuestionBowAura, reset: resetGriffinQuestionBowAuras },
    { name: "Pegasus", draw: drawPegasusWingedSwordAura, reset: resetPegasusWingedSwordAuras },
    { name: "Crusader", draw: drawCrusaderSixSwordsAura, reset: resetCrusaderSixSwordsAuras },
    { name: "Champion", draw: drawChampionArrowAura, reset: resetChampionArrowAuras },
    { name: "Arachna Queen", draw: drawArachnaQueenWebAura, reset: resetArachnaQueenWebAuras },
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
    let previous = griffinAuraProjection(center, footprint, 2, 0, gs)!;
    const positions = previous.positions;
    const uvs = previous.uvs;
    expect(griffinAuraProjection({ ...center }, { ...footprint }, 2, 0.7, grid(), 0, previous)).toBe(previous);
    expect(previous.positions).toBe(positions);
    expect(previous.uvs).toBe(uvs);
    for (const [point, size, range, narrowing, settings] of [
        [{ x: -768, y: 512 }, footprint, 2, 0, gs],
        [center, { width: 3, height: 2 }, 2, 0, gs],
        [center, footprint, 3, 0, gs],
        [center, footprint, 2, 3, gs],
        [center, footprint, 2, 0, new GridSettings(16, 1024, 0, 512, -512, 5, 0.06)],
    ] as const) {
        const next = griffinAuraProjection(point, size, range, -1.2, settings, narrowing, previous)!;
        const fresh = griffinAuraProjection(point, size, range, -1.2, settings, narrowing)!;
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

test("the web preserves reveal boundaries and reprojects a changed range during a held cel", () => {
    const root = new Container();
    const gs = grid();
    const tick = (now: number, range = 2) => {
        resetArachnaQueenWebAuras(root, now);
        drawArachnaQueenWebAura(root, Texture.WHITE, center, footprint, range, gs, "owner", 1, 0, now);
    };
    tick(0);
    const mesh = root.children[0] as Mesh<MeshGeometry>;
    const upload = spyOn(mesh.geometry.getBuffer("aUV"), "update");
    try {
        tick(99);
        expect(upload).not.toHaveBeenCalled();
        tick(100);
        expect(upload).toHaveBeenCalledTimes(1);
        tick(100, 3);
        expect(upload).toHaveBeenCalledTimes(2);
        expect(mesh.geometry.positions).toEqual(arachnaWebProjection(center, footprint, 3, gs)!.positions);
        for (let time = 200; time <= 800; time += 100) tick(time, 3);
        expect(upload).toHaveBeenCalledTimes(9);
        tick(900, 3);
        expect(upload).toHaveBeenCalledTimes(9);
        tick(934, 3);
        expect(upload).toHaveBeenCalledTimes(10);
    } finally {
        upload.mockRestore();
        root.destroy({ children: true });
    }
});
