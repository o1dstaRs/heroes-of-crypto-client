import { ARACHNA_WEB_DESIGN } from "./ArachnaWebDesign";
import { WEB_NODES, WEB_ROWS, WEB_SPOKES } from "./ArachnaWebStructure";

type Edge = { a: number; b: number; length: number; path: number[] };
const edges: Edge[] = [];
const adjacency = WEB_NODES.map(() => [] as { node: number; length: number }[]);
function add(a: number, b: number, path: number[]) {
    let length = 0;
    for (let j = 2; j < path.length; j += 2) length += Math.hypot(path[j] - path[j - 2], path[j + 1] - path[j - 1]);
    edges.push({ a, b, length, path });
    adjacency[a].push({ node: b, length });
    adjacency[b].push({ node: a, length });
}
for (let row = 0; row < WEB_ROWS; row++)
    for (let spoke = 0; spoke < WEB_SPOKES; spoke++) {
        const a = row * WEB_SPOKES + spoke;
        add(a, row * WEB_SPOKES + ((spoke + 1) % WEB_SPOKES), ARACHNA_WEB_DESIGN.strands[WEB_SPOKES + a].points);
        if (row < WEB_ROWS - 1) {
            const b = a + WEB_SPOKES;
            add(a, b, [WEB_NODES[a].x, WEB_NODES[a].y, WEB_NODES[b].x, WEB_NODES[b].y]);
        }
    }
const LIMIT = 145;
const distances = new Map<number, Float32Array>();
function distanceFrom(start: number): Float32Array {
    const cached = distances.get(start);
    if (cached) return cached;
    const result = new Float32Array(WEB_NODES.length).fill(Infinity);
    result[start] = 0;
    const pending = [start];
    while (pending.length) {
        let index = 0;
        for (let i = 1; i < pending.length; i++) if (result[pending[i]] < result[pending[index]]) index = i;
        const node = pending.splice(index, 1)[0];
        for (const next of adjacency[node]) {
            const value = result[node] + next.length;
            if (value < result[next.node] && value <= LIMIT) {
                result[next.node] = value;
                pending.push(next.node);
            }
        }
    }
    distances.set(start, result);
    return result;
}
export function webNodeDistances(start: number): Float32Array {
    return distanceFrom(start).slice();
}
type Influence = { cell: number; distance: number; reflection: number; weight: number };
const footprints = new Map<number, Influence[]>();
function nodeFootprint(start: number): Influence[] {
    const cached = footprints.get(start);
    if (cached) return cached;
    const dist = distanceFrom(start);
    const anchors = WEB_NODES.flatMap((node, i) => (node.pinned && Number.isFinite(dist[i]) ? [i] : []));
    const cells = new Map<number, Influence>();
    for (const edge of edges) {
        if (Math.min(dist[edge.a], dist[edge.b]) > LIMIT) continue;
        let along = 0;
        for (let j = 2; j < edge.path.length; j += 2) {
            const ax = edge.path[j - 2],
                ay = edge.path[j - 1];
            const dx = edge.path[j] - ax,
                dy = edge.path[j + 1] - ay;
            const length = Math.hypot(dx, dy),
                samples = Math.max(1, Math.ceil(length / 3));
            for (let k = 0; k <= samples; k++) {
                const t = k / samples,
                    travel = along + length * t;
                const distance = Math.min(dist[edge.a] + travel, dist[edge.b] + edge.length - travel);
                if (distance > LIMIT) continue;
                let reflection = Infinity;
                for (const anchor of anchors) {
                    const reflected = distanceFrom(anchor);
                    reflection = Math.min(
                        reflection,
                        dist[anchor] + Math.min(reflected[edge.a] + travel, reflected[edge.b] + edge.length - travel),
                    );
                }
                const x = ax + dx * t,
                    y = ay + dy * t;
                const bx = Math.floor(x / 5),
                    by = Math.floor(y / 5);
                for (let gy = by - 1; gy <= by + 1; gy++)
                    for (let gx = bx - 1; gx <= bx + 1; gx++) {
                        if (gx < 0 || gx >= 128 || gy < 0 || gy >= 128) continue;
                        const weight = Math.exp(-(((gx + 0.5) * 5 - x) ** 2 + ((gy + 0.5) * 5 - y) ** 2) / 18);
                        const cell = gy * 128 + gx,
                            previous = cells.get(cell);
                        if (!previous || weight > previous.weight)
                            cells.set(cell, { cell, distance, reflection, weight });
                    }
            }
            along += length;
        }
    }
    const result = [...cells.values()];
    if (footprints.size >= 128) footprints.delete(footprints.keys().next().value!);
    footprints.set(start, result);
    return result;
}
const sources = new Map<string, { nearest: number; distance: number }>();
/** Graph-directed wave branches through real junctions and reflects from fixed outer anchors. */
export function addWebTension(
    heights: Float32Array,
    x: number,
    y: number,
    age: number,
    strength: number,
    load: number,
): void {
    if (age > 0.66 || (strength <= 0 && load <= 0)) return;
    const key = `${x}:${y}`;
    let source = sources.get(key);
    if (!source) {
        let nearest = 0,
            distance = Infinity;
        for (let i = 0; i < WEB_NODES.length; i++) {
            const node = WEB_NODES[i],
                d = Math.hypot(x - node.x, y - node.y);
            if (d < distance) {
                distance = d;
                nearest = i;
            }
        }
        if (sources.size >= 4096) sources.clear();
        source = { nearest, distance };
        sources.set(key, source);
    }
    const { nearest, distance } = source;
    if (distance > 32) return;
    const front = age * 190;
    const attack = Math.min(1, Math.max(0, age / 0.025));
    const decay = Math.exp(-age * 4.8) * Math.max(0, Math.min(1, (0.66 - age) / 0.16));
    const pulse = (d: number) =>
        Number.isFinite(d) ? Math.exp(-(((d - front) / 8) ** 2) * 0.5) * Math.cos((d - front) * 0.3) : 0;
    for (const p of nodeFootprint(nearest)) {
        const d = p.distance + distance;
        const wave = pulse(d) - 0.32 * pulse(p.reflection + distance);
        const transmission = 1 / Math.sqrt(1 + d * 0.025);
        const sag = d < 20 ? -0.2 * load * (1 - d / 20) ** 2 : 0;
        heights[p.cell] += (wave * strength * 1.05 * attack * decay * transmission + sag) * p.weight;
    }
}
