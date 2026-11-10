/** Rest-space silk in the original 640 × 640 square, with a 120 px central opening.
 * Each capture arc terminates on a load-bearing radial. Nothing is raster-traced.
 */
export type SilkStrand = { points: number[]; radius: number; opacity: number; loose?: boolean };
type Point = { x: number; y: number };
const COUNT = 40;
const TAU = Math.PI * 2;
const rings = [0, 0.022, 0.048, 0.078, 0.113, 0.154, 0.202, 0.257, 0.32, 0.392, 0.474, 0.567, 0.672, 0.79, 0.895, 1];
const noise = (n: number) => Math.sin(n * 1.731 + 0.7) * Math.sin(n * 4.137 + 2.1);

function radial(index: number, t: number): Point {
    const a = (index * TAU) / COUNT - Math.PI / 2;
    // The eight principal spokes stay straight; lesser spokes have a slight bow.
    const bend = index % 5 ? noise(index) * 0.027 * Math.sin(Math.PI * t) : 0;
    const angle = a + bend + (index % 5 ? noise(index * 0.67) * 0.009 * Math.sin(Math.PI * t) : 0);
    const square = 317 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    const r = 60 + 257 * t + (square - 317) * Math.pow(t, 2.05);
    return { x: 320 + Math.cos(angle) * r, y: 320 + Math.sin(angle) * r };
}

function curve(a: Point, b: Point, sag: number, samples = 14, asymmetry = 0): number[] {
    const mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2;
    const r = Math.hypot(mx - 320, my - 320);
    const cx = mx + (b.x - a.x) * asymmetry - ((mx - 320) / r) * sag * 2;
    const cy = my + (b.y - a.y) * asymmetry - ((my - 320) / r) * sag * 2;
    const points: number[] = [];
    for (let k = 0; k <= samples; k++) {
        const t = k / samples,
            s = 1 - t;
        points.push(s * s * a.x + 2 * s * t * cx + t * t * b.x, s * s * a.y + 2 * s * t * cy + t * t * b.y);
    }
    return points;
}

function buildWeb(): { strands: SilkStrand[]; routes: number[][] } {
    const strands: SilkStrand[] = [],
        routes: number[][] = [];
    for (let i = 0; i < COUNT; i++) {
        const points: number[] = [];
        for (let k = 0; k <= 90; k++) {
            const p = radial(i, k / 90);
            points.push(p.x, p.y);
        }
        strands.push({ points, radius: i % 5 === 0 ? 1.4 : 1.0 + 0.13 * noise(i), opacity: 0.95 });
        if (i % 5 === 0) routes.push(points);
    }
    for (let row = 0; row < rings.length; row++) {
        for (let i = 0; i < COUNT; i++) {
            // Small, continuous changes in spacing avoid mechanically perfect rings.
            const at = (j: number) => {
                const t = rings[row] + Math.sin(rings[row] * Math.PI) * 0.014 * noise((j % COUNT) + row * 0.31);
                return radial(j % COUNT, t);
            };
            const a = at(i),
                b = at(i + 1);
            const gap = Math.hypot(a.x - b.x, a.y - b.y);
            const sag =
                row === 0
                    ? -0.18
                    : gap * (0.08 + 0.055 * noise(i + row * 7)) +
                      (row >= rings.length - 2 ? 3.0 + 2.8 * noise(i * 1.37 + row) : 0);
            strands.push({
                points: curve(
                    a,
                    b,
                    sag,
                    14,
                    row >= rings.length - 2 && (i + row) % 3 === 0 ? 0.3 * noise(i * 2.3 + row) : 0,
                ),
                radius:
                    row === 0 ? 1.65 : row === rings.length - 1 ? 1.4 : 0.8 + 0.22 * (0.5 + noise(i + row * 9) * 0.5),
                opacity: row === 0 ? 0.97 : 0.88 + 0.08 * noise(i * 3 + row),
            });
        }
    }
    // Short concave binding fibres wrap each junction. Their tips lie on the
    // actual radial and capture curves, so the four-way joint stays connected.
    for (let row = 1; row < rings.length - 1; row++) {
        for (let i = 0; i < COUNT; i++) {
            const t = rings[row] + Math.sin(rings[row] * Math.PI) * 0.014 * noise(i + row * 0.31);
            const p = radial(i, t),
                prev = radial(i, t - 0.002),
                next = radial(i, t + 0.002);
            const norm = Math.hypot(next.x - prev.x, next.y - prev.y);
            const dx = (next.x - prev.x) / norm,
                dy = (next.y - prev.y) / norm;
            const size = (0.85 + 0.65 * t) * (1 + noise(i * 2 + row) * 0.2);
            for (const along of [-1, 1])
                for (const across of [-1, 1]) {
                    if ((i + row) % 3 !== 0 && along === -1) continue;
                    const asymmetric = (i * 13 + row * 7) % 5 === 0;
                    const reach = size * (asymmetric && along === 1 ? 1.5 : 1);
                    const a = { x: p.x + dx * reach * along, y: p.y + dy * reach * along };
                    const b = { x: p.x - dy * size * across, y: p.y + dx * size * across };
                    const points: number[] = [];
                    for (let k = 0; k <= 6; k++) {
                        const q = k / 6,
                            r = 1 - q;
                        points.push(
                            r * r * a.x + 2 * r * q * p.x + q * q * b.x,
                            r * r * a.y + 2 * r * q * p.y + q * q * b.y,
                        );
                    }
                    strands.push({
                        points,
                        radius: asymmetric && across === 1 ? 0.26 : 0.18,
                        opacity: asymmetric && across === -1 ? 0.27 : 0.44,
                    });
                }
        }
    }
    // Bundled anchor silk fans out from each original corner into the outer two rows.
    for (const i of [5, 15, 25, 35]) {
        const corner = radial(i, 1);
        for (const side of i % 5 === 0 ? [-1.5, -1, 1, 1.5] : [-1, 1]) {
            for (let fan = 0; fan < 4; fan++) {
                const end = radial((i + side + COUNT) % COUNT, 0.71 + fan * 0.074);
                strands.push({
                    points: curve(corner, end, 1.4 + fan * 0.6, 24),
                    radius: 0.28 + fan * 0.065,
                    opacity: 0.65,
                });
            }
        }
    }
    // Sparse separated fibrils: a short split rejoins its cable, rather than
    // building a uniformly thick parallel hose along every radial.
    for (let i = 0; i < COUNT; i++) {
        const cable = strands[i];
        const count = cable.points.length / 2;
        const start = 9 + ((i * 17) % 61);
        for (const side of [-1, 1]) {
            const points: number[] = [];
            const from = start + (side > 0 ? 2 : 0);
            const span = 9 + (i % 4);
            for (let k = from; k <= from + span; k++) {
                const prev = Math.max(0, k - 1) * 2,
                    next = Math.min(count - 1, k + 1) * 2;
                const dx = cable.points[next] - cable.points[prev],
                    dy = cable.points[next + 1] - cable.points[prev + 1];
                const norm = Math.hypot(dx, dy);
                const envelope = Math.sin((Math.PI * (k - from)) / span);
                const spread = side * envelope * (0.25 + 0.12 * Math.sin(k * 0.39 + i));
                points.push(cable.points[k * 2] - (dy / norm) * spread, cable.points[k * 2 + 1] + (dx / norm) * spread);
            }
            strands.push({ points, radius: side < 0 ? 0.22 : 0.16, opacity: side < 0 ? 0.72 : 0.46 });
        }
    }
    // Occasional wisps on capture silk, not a uniform halo around the web.
    for (let i = COUNT; i < COUNT + rings.length * COUNT; i++) {
        if (i % 7 !== 3) continue;
        const cable = strands[i],
            points: number[] = [];
        const first = 2 + (i % 3),
            last = 12;
        for (let k = first; k <= last; k++) {
            const prev = (k - 1) * 2,
                next = (k + 1) * 2;
            const dx = cable.points[next] - cable.points[prev],
                dy = cable.points[next + 1] - cable.points[prev + 1];
            const norm = Math.hypot(dx, dy);
            const envelope = Math.sin((Math.PI * (k - first)) / (last - first));
            const spread = (i % 2 ? -1 : 1) * envelope * (0.14 + 0.04 * Math.sin(k * 0.39 + i));
            points.push(cable.points[k * 2] - (dy / norm) * spread, cable.points[k * 2 + 1] + (dx / norm) * spread);
        }
        strands.push({ points, radius: 0.14, opacity: 0.64 });
    }
    // A few loose ends and silk wraps, always attached to an existing junction.
    // They occupy the interior and do not alter the reference perimeter/opening.
    for (let n = 0; n < 24; n++) {
        const row = 3 + ((n * 7) % 10),
            spoke = (n * 17 + 6) % COUNT;
        const capture = strands[COUNT + row * COUNT + spoke];
        const p = { x: capture.points[0], y: capture.points[1] };
        const angle = n * 2.399;
        const length = 3.2 + (n % 4) * 0.8;
        const points: number[] = [];
        for (let k = 0; k <= 8; k++) {
            const t = k / 8,
                curl = angle + t * 0.9;
            points.push(p.x + Math.cos(curl) * length * t, p.y + Math.sin(curl) * length * t);
        }
        strands.push({ points, radius: 0.19 + (n % 3) * 0.035, opacity: 0.53, loose: true });
        for (let wrap = 0; wrap < 2; wrap++) {
            const points: number[] = [];
            for (let k = 0; k <= 10; k++) {
                const t = k / 10,
                    a = t * Math.PI * 1.4 + angle;
                const r = 0.7 + wrap * 0.4;
                points.push(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r + (t - 0.5) * 1.4);
            }
            strands.push({ points, radius: 0.2, opacity: 0.66 });
        }
    }
    return { strands, routes };
}

export const ARACHNA_WEB_DESIGN = buildWeb();
