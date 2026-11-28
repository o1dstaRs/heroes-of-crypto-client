import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { ArachnaContactField } from "../../core/src/scenes/ArachnaWebContacts";
import { arachnaDewLoads, createArachnaDewGeometry, updateArachnaDew } from "../../core/src/scenes/ArachnaWebDew";
import {
    arachnaSilkContacts,
    createArachnaSilkGeometry,
    createArachnaSpiderGeometry,
    updateArachnaSpiderRig,
    updateArachnaSpiders,
} from "../../core/src/scenes/ArachnaWebGeometry";

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const cell = gs.getCellSize();
const contacts = new ArachnaContactField();
const spiders = createArachnaSpiderGeometry();
const dew = createArachnaDewGeometry();
const joints = new Float32Array(512);
const body = new Float32Array(32);
const abdomen = new Float32Array(32);
type Geometry = ReturnType<typeof createArachnaSilkGeometry>;
const webs = new Map<string, Geometry>();

function buffers(geometry: Geometry) {
    return {
        ...Object.fromEntries(Object.keys(geometry.attributes).map((name) => [name, geometry.getBuffer(name).data])),
        indices: geometry.indexBuffer.data,
    };
}

Object.assign(globalThis, {
    hocArachnaGrid: [gs.getMinX(), gs.getMinY(), cell],
    hocArachnaLoads(age: number) {
        const loads = [...arachnaSilkContacts(age), ...arachnaDewLoads];
        return {
            loads: new Float64Array(loads.flatMap(({ x, y, load, age, strength }) => [x, y, load, age, strength])),
            pixels: contacts.pixels,
        };
    },
    hocArachnaFrame(x: number, y: number, width: number, height: number, age: number, includeSilk: boolean) {
        const center = { x: gs.getMinX() + x * cell, y: gs.getMinY() + y * cell };
        const placement = { center, width: width * cell, height: height * cell, gs };
        const key = [x, y, width, height].join(":");
        let silk = webs.get(key);
        if (includeSilk && !silk) {
            if (webs.size >= 8) {
                const oldest = webs.keys().next().value!;
                webs.get(oldest)?.destroy();
                webs.delete(oldest);
            }
            silk = createArachnaSilkGeometry(placement);
            webs.set(key, silk);
        }

        updateArachnaDew(dew, placement, age, contacts);
        updateArachnaSpiders(spiders, placement, age, contacts);
        updateArachnaSpiderRig(joints, body, abdomen, age, contacts);
        return {
            silk: includeSilk && silk ? buffers(silk) : undefined,
            spiders: buffers(spiders),
            dew: buffers(dew),
            contact: contacts.pixels,
            joints,
            body,
            abdomen,
        };
    },
});
