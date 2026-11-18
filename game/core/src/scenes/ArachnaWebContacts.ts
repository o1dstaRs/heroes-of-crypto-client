import { webSurfaceLift } from "./ArachnaWebStructure";
import { addWebTension } from "./ArachnaWebTension";
import { ARACHNA_WEB_DESIGN } from "./ArachnaWebDesign";
import { arachnaWebSway } from "./ArachnaWebMotion";
import { type FootReach } from "./ArachnaWebSpiderMotion";

type Point = { x: number; y: number };
type Segment = { a: Point; b: Point };
const bins = new Map<string, Segment[]>();
const footholds = new Map<string, Point>();
// Only load-bearing radial and capture silk; decorative split fibres aren't footholds.
for (const strand of ARACHNA_WEB_DESIGN.strands.slice(0, 680)) {
    for (let j = 2; j < strand.points.length; j += 2) {
        const a = { x: strand.points[j - 2], y: strand.points[j - 1] };
        const b = { x: strand.points[j], y: strand.points[j + 1] };
        const segment = { a, b };
        for (let x = Math.floor(Math.min(a.x, b.x) / 32); x <= Math.floor(Math.max(a.x, b.x) / 32); x++)
            for (let y = Math.floor(Math.min(a.y, b.y) / 32); y <= Math.floor(Math.max(a.y, b.y) / 32); y++) {
                const key = `${x}:${y}`;
                if (!bins.has(key)) bins.set(key, []);
                bins.get(key)!.push(segment);
            }
    }
}

/** Grip the nearest real thread, preserving a foot's contact until lift-off. */
export function attachArachnaFoot(point: Point, reach?: FootReach): Point {
    const key = `${point.x}:${point.y}:${reach?.radius ?? 0}:${reach?.centers.map((p) => `${p.x},${p.y}`).join(";") ?? ""}`;
    const cached = footholds.get(key);
    if (cached) return cached;
    let best = point,
        distance = Infinity;
    const bx = Math.floor(point.x / 32),
        by = Math.floor(point.y / 32);
    for (let x = bx - 1; x <= bx + 1; x++)
        for (let y = by - 1; y <= by + 1; y++) {
            for (const { a, b } of bins.get(`${x}:${y}`) ?? []) {
                const dx = b.x - a.x,
                    dy = b.y - a.y;
                let low = 0,
                    high = 1;
                for (const center of reach?.centers ?? []) {
                    const ax = a.x - center.x,
                        ay = a.y - center.y,
                        d2 = dx * dx + dy * dy;
                    const dot = ax * dx + ay * dy;
                    const discriminant = dot * dot - d2 * (ax * ax + ay * ay - reach!.radius ** 2);
                    if (discriminant < 0 || d2 < 1e-10) {
                        high = -1;
                        break;
                    }
                    const root = Math.sqrt(discriminant);
                    low = Math.max(low, (-dot - root) / d2);
                    high = Math.min(high, (-dot + root) / d2);
                }
                if (low > high) continue;
                const t = Math.max(
                    low,
                    Math.min(high, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
                );
                const p = { x: a.x + dx * t, y: a.y + dy * t };
                const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
                if (d < distance) {
                    best = p;
                    distance = d;
                }
            }
        }
    if (footholds.size > 4096) footholds.clear();
    footholds.set(key, best);
    return best;
}

export type SilkContact = Point & { load: number; age: number; strength: number };
export const CONTACT_FIELD_SIZE = 128;
const STEP = 640 / CONTACT_FIELD_SIZE;
const smooth = (v: number) => {
    const t = Math.max(0, Math.min(1, v));
    return t * t * (3 - 2 * t);
};

/** Compact dynamic height field; no per-vertex search or simulation history.
 * RG encodes signed 16-bit height, B contact occlusion, A is opaque data.
 * Bilinear sampling works on every WebGL2 device without float-filter extensions.
 */
export class ArachnaContactField {
    public readonly pixels = new Uint8Array(CONTACT_FIELD_SIZE * CONTACT_FIELD_SIZE * 4);
    private readonly heights = new Float32Array(CONTACT_FIELD_SIZE * CONTACT_FIELD_SIZE);
    private readonly pressure = new Float32Array(CONTACT_FIELD_SIZE * CONTACT_FIELD_SIZE);
    public update(contacts: readonly SilkContact[]): void {
        this.heights.fill(0);
        this.pressure.fill(0);
        for (const c of contacts) {
            const age = c.age / 1000;
            addWebTension(this.heights, c.x, c.y, age, c.strength, c.load);
            const waveRadius = age * 110;
            const amplitude =
                c.strength * 1.05 * Math.exp(-age * 7) * smooth(age / 0.035) * (1 - smooth((age - 0.5) / 0.16));
            const radius = Math.max(c.load > 0 ? 24 : 0, amplitude > 0.002 ? waveRadius + 12 : 0);
            if (!radius) continue;
            const x0 = Math.max(0, Math.floor((c.x - radius) / STEP)),
                x1 = Math.min(CONTACT_FIELD_SIZE - 1, Math.ceil((c.x + radius) / STEP));
            const y0 = Math.max(0, Math.floor((c.y - radius) / STEP)),
                y1 = Math.min(CONTACT_FIELD_SIZE - 1, Math.ceil((c.y + radius) / STEP));
            for (let y = y0; y <= y1; y++)
                for (let x = x0; x <= x1; x++) {
                    const dx = (x + 0.5) * STEP - c.x,
                        dy = (y + 0.5) * STEP - c.y;
                    const d2 = dx * dx + dy * dy,
                        d = Math.sqrt(d2),
                        n = y * CONTACT_FIELD_SIZE + x;
                    const load = c.load * Math.exp(-d2 / 100);
                    const front = (d - waveRadius) / 5;
                    const ripple = amplitude * Math.exp(-front * front * 0.5) * Math.cos((d - waveRadius) * 0.48);
                    this.heights[n] += -2.8 * load + ripple;
                    this.pressure[n] += load * Math.exp(-d2 / 48);
                }
        }
        for (let y = 0; y < CONTACT_FIELD_SIZE; y++)
            for (let x = 0; x < CONTACT_FIELD_SIZE; x++) {
                const n = y * CONTACT_FIELD_SIZE + x,
                    i = n * 4;
                const edge = Math.min(
                    (x + 0.5) * STEP - 3,
                    636 - (x + 0.5) * STEP,
                    (y + 0.5) * STEP - 3,
                    636 - (y + 0.5) * STEP,
                );
                const pinned = smooth(edge / 24);
                const packed = Math.round(32768 + Math.max(-15, Math.min(15, this.heights[n] * pinned)) * 2048);
                this.pixels[i] = packed >> 8;
                this.pixels[i + 1] = packed & 255;
                this.pixels[i + 2] = Math.round(Math.min(1, this.pressure[n]) * pinned * 255);
                this.pixels[i + 3] = 255;
            }
    }
    public sample(x: number, y: number): number {
        const px = Math.max(0, Math.min(CONTACT_FIELD_SIZE - 1, x / STEP - 0.5)),
            py = Math.max(0, Math.min(CONTACT_FIELD_SIZE - 1, y / STEP - 0.5));
        const ix = Math.floor(px),
            iy = Math.floor(py),
            fx = px - ix,
            fy = py - iy;
        const read = (u: number, v: number) => {
            const i = (v * CONTACT_FIELD_SIZE + u) * 4;
            return (this.pixels[i] * 256 + this.pixels[i + 1] - 32768) / 2048;
        };
        return (
            read(ix, iy) * (1 - fx) * (1 - fy) +
            read(Math.min(127, ix + 1), iy) * fx * (1 - fy) +
            read(ix, Math.min(127, iy + 1)) * (1 - fx) * fy +
            read(Math.min(127, ix + 1), Math.min(127, iy + 1)) * fx * fy
        );
    }
    public motion(x: number, y: number, time: number) {
        const base = arachnaWebSway(x, y, time);
        const height = Math.max(0, base.height + this.sample(x, y) + webSurfaceLift(x, y));
        return { x: base.x, y: base.y - (height - base.height) * 0.7, height };
    }
}
