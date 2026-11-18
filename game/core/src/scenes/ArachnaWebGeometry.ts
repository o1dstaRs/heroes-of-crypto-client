import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Geometry, MeshGeometry } from "pixi.js";
import { arachnaSpiderRig, arachnaSpiderStep } from "./ArachnaWebSpiderMotion";
import { ArachnaContactField, attachArachnaFoot, type SilkContact } from "./ArachnaWebContacts";
import { webWeaveAt } from "./ArachnaWebStructure";
import { ARACHNA_WEB_DESIGN } from "./ArachnaWebDesign";
import { arachnaWebSway } from "./ArachnaWebMotion";
export { arachnaWebSway, ARACHNA_WEB_SWAY_MS } from "./ArachnaWebMotion";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

export const ARACHNA_WEB_SPIDER_COUNT = 8;
const SIZE = 640;
type XY = HoCMath.XY;
export type WebPlacement = { center: XY; width: number; height: number; gs: GridSettings };

function project(x: number, y: number, placement: WebPlacement): XY {
    return projectBattlefieldPoint(
        {
            x: placement.center.x + (x / SIZE - 0.5) * placement.width,
            y: placement.center.y + (0.5 - y / SIZE) * placement.height,
        },
        placement.gs,
    );
}

// Smooth connected silk curves; the shader shades their cylindrical cross-sections.
export function createArachnaSilkGeometry(placement: WebPlacement): Geometry {
    const positions: number[] = [],
        source: number[] = [],
        warp: number[] = [],
        silk: number[] = [],
        indices: number[] = [],
        knots: number[] = [],
        fibers: number[] = [],
        weave: number[] = [],
        fray: number[] = [],
        mainCable: number[] = [],
        branchTravel: number[] = [];
    for (const [strandIndex, strand] of ARACHNA_WEB_DESIGN.strands.entries()) {
        const path = strand.points;
        const start = positions.length / 2;
        let length = 0;
        let totalLength = 0;
        for (let j = 2; j < path.length; j += 2)
            totalLength += Math.hypot(path[j] - path[j - 2], path[j + 1] - path[j - 1]);
        for (let i = 0; i < path.length; i += 2) {
            const x = path[i],
                y = path[i + 1];
            const previous = Math.max(0, i - 2),
                next = Math.min(path.length - 2, i + 2);
            let tx = path[next] - path[previous],
                ty = path[next + 1] - path[previous + 1];
            const norm = Math.hypot(tx, ty) || 1;
            tx /= norm;
            ty /= norm;
            if (i) length += Math.hypot(x - path[i - 2], y - path[i - 1]);
            const crossing = webWeaveAt(strandIndex, x, y);
            const p = project(x, y, placement),
                px = project(x + 1, y, placement),
                py = project(x, y + 1, placement);
            for (const side of [-1, 1]) {
                const edge = project(x - ty * side * 4.5, y + tx * side * 4.5, placement);
                positions.push(edge.x, edge.y);
                source.push(x / SIZE, y / SIZE);
                warp.push(px.x - p.x, px.y - p.y, py.x - p.x, py.y - p.y);
                silk.push(side, length / SIZE, tx, ty);
                knots.push(Math.exp(-Math.min(length, totalLength - length) / 1.3));
                fibers.push(strand.radius, strand.opacity);
                weave.push(crossing.lift, crossing.under);
                fray.push(strand.loose ? (i / (path.length - 2)) ** 2 : 0);
                mainCable.push(strandIndex < 40 && strandIndex % 5 === 0 ? 1 : 0);
                branchTravel.push(
                    strandIndex >= 40 && strandIndex < 680 ? Math.min(length, totalLength - length) / 385 : 0,
                );
            }
            if (i < path.length - 2) {
                const a = start + i;
                indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
            }
        }
    }
    return new Geometry({
        attributes: {
            aPosition: { buffer: new Float32Array(positions), format: "float32x2" },
            aUV: { buffer: new Float32Array(source), format: "float32x2" },
            aWarp: { buffer: new Float32Array(warp), format: "float32x4" },
            aSilk: { buffer: new Float32Array(silk), format: "float32x4" },
            aKnot: { buffer: new Float32Array(knots), format: "float32" },
            aFiber: { buffer: new Float32Array(fibers), format: "float32x2" },
            aWeave: { buffer: new Float32Array(weave), format: "float32x2" },
            aFray: { buffer: new Float32Array(fray), format: "float32" },
            aMainCable: { buffer: new Float32Array(mainCable), format: "float32" },
            aBranchTravel: { buffer: new Float32Array(branchTravel), format: "float32" },
        },
        indexBuffer: new Uint32Array(indices),
    });
}

const routes = ARACHNA_WEB_DESIGN.routes.map((path) => {
    const lengths = [0];
    for (let i = 2; i < path.length; i += 2)
        lengths.push(lengths.at(-1)! + Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]));
    return { path, lengths, total: lengths.at(-1)! };
});
function routePoint(index: number, fraction: number): XY {
    const { path, lengths, total } = routes[index % routes.length];
    const distance = Math.max(0, Math.min(1, fraction)) * total;
    let n = 1;
    while (n < lengths.length - 1 && lengths[n] < distance) n++;
    const t = (distance - lengths[n - 1]) / Math.max(0.0001, lengths[n] - lengths[n - 1]);
    return {
        x: path[(n - 1) * 2] * (1 - t) + path[n * 2] * t,
        y: path[(n - 1) * 2 + 1] * (1 - t) + path[n * 2 + 1] * t,
    };
}
/** Eight independent out-and-back journeys on actual connected support strands. */
export function arachnaSpiderPose(index: number, ageMs: number, field?: ArachnaContactField) {
    const phase = (ageMs / (6800 + index * 370)) * Math.PI * 2 + index * 1.37;
    const fraction = 0.5 + 0.38 * Math.cos(phase);
    const point = routePoint(index, fraction);
    const tangentA = routePoint(index, fraction - 0.012),
        tangentB = routePoint(index, fraction + 0.012);
    // A smooth half-turn at each turnaround avoids snapping the body 180 degrees.
    const turn = ((1 + Math.tanh(Math.sin(phase) * 7)) * Math.PI) / 2;
    const angle = Math.atan2(tangentB.y - tangentA.y, tangentB.x - tangentA.x) + Math.PI / 2 + turn;
    const sway = field ? field.motion(point.x, point.y, ageMs) : arachnaWebSway(point.x, point.y, ageMs);
    return {
        x: point.x + sway.x,
        y: point.y + sway.y,
        angle,
        stride: Math.abs(Math.sin(phase)),
        sourceX: point.x,
        sourceY: point.y,
    };
}
export function createArachnaSpiderGeometry(): MeshGeometry {
    const indices: number[] = [],
        uvs: number[] = [];
    for (let i = 0; i < ARACHNA_WEB_SPIDER_COUNT; i++) {
        const n = i * 4;
        indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
        uvs.push(-1.45, -1.45, 1.45, -1.45, 1.45, 1.45, -1.45, 1.45);
    }
    const geometry = new MeshGeometry({
        positions: new Float32Array(64),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
    });
    geometry.addAttribute("aSpider", {
        buffer: new Float32Array(Array.from({ length: 32 }, (_, i) => Math.floor(i / 4))),
        format: "float32",
    });
    geometry.addAttribute("aGround", { buffer: new Float32Array(64), format: "float32x2" });
    return geometry;
}
export function updateArachnaSpiders(
    geometry: MeshGeometry,
    placement: WebPlacement,
    ageMs: number,
    field?: ArachnaContactField,
): void {
    const ground = geometry.getBuffer("aGround").data as Float32Array;
    for (let i = 0; i < ARACHNA_WEB_SPIDER_COUNT; i++) {
        const pose = arachnaSpiderPose(i, ageMs, field),
            cos = Math.cos(pose.angle),
            sin = Math.sin(pose.angle);
        const size = 27 + (i % 3) * 2;
        for (let corner = 0; corner < 4; corner++) {
            const j = i * 8 + corner * 2,
                x = geometry.uvs[j] * size,
                y = geometry.uvs[j + 1] * size;
            const sx = pose.x + x * cos - y * sin,
                sy = pose.y + x * sin + y * cos;
            ground[j] = placement.center.x + (sx / SIZE - 0.5) * placement.width;
            ground[j + 1] = placement.center.y + (0.5 - sy / SIZE) * placement.height;
            const p = project(sx, sy, placement);
            geometry.positions[j] = p.x;
            geometry.positions[j + 1] = p.y;
        }
    }
    geometry.getBuffer("aPosition").update();
    geometry.getBuffer("aGround").update();
}

export function updateArachnaSpiderRig(
    joints: Float32Array,
    body: Float32Array,
    abdomen: Float32Array,
    ageMs: number,
    field?: ArachnaContactField,
): void {
    for (let i = 0; i < ARACHNA_WEB_SPIDER_COUNT; i++) {
        const rig = arachnaSpiderRig(
            i,
            ageMs,
            (index, time) => arachnaSpiderPose(index, time, field),
            field ? (x, y, time) => field.motion(x, y, time) : arachnaWebSway,
            attachArachnaFoot,
        );
        body.set([rig.shift.x, rig.shift.y, rig.yaw, rig.roll], i * 4);
        abdomen.set([rig.abdomenLag, rig.abdomenYaw, 0, 0], i * 4);
        rig.legs.forEach((leg, n) =>
            joints.set(
                [leg.hip.x, leg.hip.y, leg.knee.x, leg.knee.y, leg.ankle.x, leg.ankle.y, leg.toe.x, leg.toe.y],
                (i * 8 + n) * 8,
            ),
        );
    }
}

export function arachnaSilkContacts(ageMs: number): SilkContact[] {
    const contacts: SilkContact[] = [];
    for (let index = 0; index < ARACHNA_WEB_SPIDER_COUNT; index++)
        for (let leg = 0; leg < 4; leg++)
            for (let side = 0; side < 2; side++) {
                const step = arachnaSpiderStep(index, leg, side, ageMs, arachnaSpiderPose, attachArachnaFoot);
                const strength =
                    0.6 +
                    0.4 * Math.abs(Math.sin((step.cycleStart / (6800 + index * 370)) * Math.PI * 2 + index * 1.37));
                contacts.push({ ...step.touchdown, load: step.load, age: step.impactAge, strength });
                contacts.push({ ...step.previous, load: 0, age: step.impactAge + step.period, strength });
            }
    return contacts;
}
