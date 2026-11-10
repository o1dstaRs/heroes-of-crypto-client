import { ARACHNA_WEB_DESIGN } from "./ArachnaWebDesign";

export const WEB_SPOKES = 40;
export const WEB_ROWS = 16;
export type WebNode = { x: number; y: number; row: number; spoke: number; pinned: boolean };
/** Real capture endpoints, shared by weaving and the tension graph. */
export const WEB_NODES: WebNode[] = Array.from({ length: WEB_SPOKES * WEB_ROWS }, (_, id) => {
    const strand = ARACHNA_WEB_DESIGN.strands[WEB_SPOKES + id];
    return {
        x: strand.points[0],
        y: strand.points[1],
        row: Math.floor(id / WEB_SPOKES),
        spoke: id % WEB_SPOKES,
        pinned: id >= WEB_SPOKES * (WEB_ROWS - 1),
    };
});

/** Local over/under lift and contact shade. Zero at original perimeter anchors. */
export function webWeaveAt(strand: number, x: number, y: number) {
    let node: WebNode | undefined;
    let distance = Infinity;
    let support = false;
    if (strand < WEB_SPOKES) {
        support = true;
        for (let row = 1; row < WEB_ROWS - 1; row++) {
            const candidate = WEB_NODES[row * WEB_SPOKES + strand];
            const d = Math.hypot(x - candidate.x, y - candidate.y);
            if (d < distance) {
                distance = d;
                node = candidate;
            }
        }
    } else if (strand < WEB_SPOKES * (WEB_ROWS + 1)) {
        const index = strand - WEB_SPOKES;
        const row = Math.floor(index / WEB_SPOKES);
        if (row === 0 || row === WEB_ROWS - 1) return { lift: 0, under: 0 };
        for (const id of [index, row * WEB_SPOKES + ((index + 1) % WEB_SPOKES)]) {
            const candidate = WEB_NODES[id];
            const d = Math.hypot(x - candidate.x, y - candidate.y);
            if (d < distance) {
                distance = d;
                node = candidate;
            }
        }
    }
    if (!node || distance > 7) return { lift: 0, under: 0 };
    const top = ((node.row + node.spoke) % 2 === 0) === support;
    const envelope = Math.exp((-distance * distance) / 12);
    return { lift: (top ? 0.85 : -0.35) * envelope, under: top ? 0 : Math.exp((-distance * distance) / 4.5) };
}

const nodeBins = new Map<string, number[]>();
for (let i = WEB_SPOKES; i < WEB_SPOKES * (WEB_ROWS - 1); i++) {
    const p = WEB_NODES[i],
        key = `${Math.floor(p.x / 16)}:${Math.floor(p.y / 16)}`;
    if (!nodeBins.has(key)) nodeBins.set(key, []);
    nodeBins.get(key)!.push(i);
}
const surfaceCache = new Map<string, number>();
/** Plant toes on the same lifted strand as the GPU, choosing the upper layer at a crossing. */
export function webSurfaceLift(x: number, y: number): number {
    const key = `${x}:${y}`,
        cached = surfaceCache.get(key);
    if (cached !== undefined) return cached;
    const bx = Math.floor(x / 16),
        by = Math.floor(y / 16),
        candidates = new Set<number>();
    for (let gy = by - 1; gy <= by + 1; gy++)
        for (let gx = bx - 1; gx <= bx + 1; gx++) {
            for (const id of nodeBins.get(`${gx}:${gy}`) ?? []) {
                const node = WEB_NODES[id];
                if (Math.hypot(x - node.x, y - node.y) > 7) continue;
                candidates.add(node.spoke);
                candidates.add(WEB_SPOKES + id);
                candidates.add(WEB_SPOKES + node.row * WEB_SPOKES + ((node.spoke + WEB_SPOKES - 1) % WEB_SPOKES));
            }
        }
    let nearest = Infinity,
        lift = 0;
    for (const index of candidates) {
        const path = ARACHNA_WEB_DESIGN.strands[index].points;
        let distance = Infinity;
        for (let j = 2; j < path.length; j += 2) {
            const dx = path[j] - path[j - 2],
                dy = path[j + 1] - path[j - 1];
            const t = Math.max(
                0,
                Math.min(1, ((x - path[j - 2]) * dx + (y - path[j - 1]) * dy) / (dx * dx + dy * dy || 1)),
            );
            distance = Math.min(distance, Math.hypot(x - path[j - 2] - dx * t, y - path[j - 1] - dy * t));
        }
        const height = webWeaveAt(index, x, y).lift;
        if (distance < nearest - 0.04) {
            nearest = distance;
            lift = height;
        } else if (distance <= nearest + 0.04) lift = Math.max(lift, height);
    }
    if (nearest > 1.5) lift = 0;
    if (surfaceCache.size >= 4096) surfaceCache.clear();
    surfaceCache.set(key, lift);
    return lift;
}
