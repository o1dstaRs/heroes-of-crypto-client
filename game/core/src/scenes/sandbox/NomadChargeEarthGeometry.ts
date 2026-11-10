import { MeshGeometry } from "pixi.js";

/** Four irregular chipped clods. Shared immutable faces; GPU rotates positions and normals. */
export function createChargeEarthGeometry(variant: number): MeshGeometry {
    const t = (1 + Math.sqrt(5)) / 2;
    const vertices = [
        [-1, t, 0],
        [1, t, 0],
        [-1, -t, 0],
        [1, -t, 0],
        [0, -1, t],
        [0, 1, t],
        [0, -1, -t],
        [0, 1, -t],
        [t, 0, -1],
        [t, 0, 1],
        [-t, 0, -1],
        [-t, 0, 1],
    ];
    const faces = [
        [0, 11, 5],
        [0, 5, 1],
        [0, 1, 7],
        [0, 7, 10],
        [0, 10, 11],
        [1, 5, 9],
        [5, 11, 4],
        [11, 10, 2],
        [10, 7, 6],
        [7, 1, 8],
        [3, 9, 4],
        [3, 4, 2],
        [3, 2, 6],
        [3, 6, 8],
        [3, 8, 9],
        [4, 9, 5],
        [2, 4, 11],
        [6, 2, 10],
        [8, 6, 7],
        [9, 8, 1],
    ];
    // One shared subdivision adds real chipped silhouettes, rather than just painted dots.
    const splitFaces: number[][] = [];
    const edges = new Map<string, number>();
    const midpoint = (a: number, b: number): number => {
        const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
        const found = edges.get(key);
        if (found !== undefined) return found;
        const p = vertices[a].map((v, i) => (v + vertices[b][i]) * 0.5);
        const length = Math.hypot(...p);
        vertices.push(p.map((v) => v / length));
        const index = vertices.length - 1;
        edges.set(key, index);
        return index;
    };
    for (const v of vertices) {
        const length = Math.hypot(...v);
        for (let i = 0; i < 3; i++) v[i] /= length;
    }
    for (const [a, b, c] of faces) {
        const ab = midpoint(a, b),
            bc = midpoint(b, c),
            ca = midpoint(c, a);
        splitFaces.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    vertices.forEach((v) => {
        const shape = 0.91 + 0.065 * Math.sin(v[0] * 4 + v[1] * 3 + variant * 2.1);
        // Clipped planes form broken faces; anisotropy varies the chunk silhouette.
        v[0] = Math.max(-0.8, Math.min(0.84, v[0] * shape)) * (1 + variant * 0.1);
        v[1] = Math.max(-0.72, Math.min(0.88, v[1] * shape)) * (0.8 + (variant % 2) * 0.23);
        v[2] = Math.max(-0.78, Math.min(0.86, v[2] * shape));
    });
    const positions: number[] = [],
        uvs: number[] = [],
        normals: number[] = [];
    for (const face of splitFaces) {
        const [a, b, c] = face.map((i) => vertices[i]);
        const u = b.map((v, i) => v - a[i]),
            v = c.map((n, i) => n - a[i]);
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const length = Math.hypot(...n);
        for (const p of [a, b, c]) {
            positions.push(p[0], p[1]);
            uvs.push(p[2], 0);
            normals.push(...n.map((v) => v / length));
        }
    }
    const geometry = new MeshGeometry({
        positions: new Float32Array(positions),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(Array.from({ length: positions.length / 2 }, (_, i) => i)),
    });
    geometry.addAttribute("aNormal", { buffer: new Float32Array(normals), format: "float32x3" });
    return geometry;
}
