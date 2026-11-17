import { Container, Sprite, type Texture } from "pixi.js";

type Point = Readonly<{ x: number; y: number }>;
export const WIND_SPEAR_TRAVEL_MS = 190;
export const WIND_SPEAR_FADE_MS = 150;
const MAX_SPEARS = 16;
const TRAIL_COUNT = 7;
interface Spear {
    root: Container;
    head: Sprite;
    trail: Sprite[];
    points: Point[];
    lengths: number[];
    total: number;
    cell: number;
    started: number;
}

/** Main's travelling cyan pierce for other legal owners. Cosmetic only: no damage or action delay. */
export class WindSpears {
    private spears: Spear[] = [];
    public constructor(
        private readonly attach: (root: Container, z: number) => void,
        private readonly texture: () => Texture,
        private readonly stretch: () => number,
        private readonly now: () => number = () => performance.now(),
    ) {}
    public get active(): boolean {
        return this.spears.length > 0;
    }
    public spawn(points: readonly Point[], cell: number): void {
        if (points.length < 2 || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return;
        const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
        const total = lengths.reduce((sum, length) => sum + length, 0);
        if (total < 1 || !Number.isFinite(cell) || cell <= 0) return;
        if (this.spears.length >= MAX_SPEARS) this.spears.shift()!.root.destroy({ children: true });
        const root = new Container();
        const texture = this.texture();
        const orb = (): Sprite => {
            const sprite = new Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.blendMode = "add";
            sprite.tint = 0xdff4ff;
            root.addChild(sprite);
            return sprite;
        };
        const trail = Array.from({ length: TRAIL_COUNT }, orb);
        const head = orb();
        this.spears.push({
            root,
            head,
            trail,
            points: points.map((p) => ({ ...p })),
            lengths,
            total,
            cell,
            started: this.now(),
        });
        this.attach(root, 5490);
        this.update();
    }
    private pointAt(spear: Spear, distance: number): Point {
        let left = Math.max(0, Math.min(spear.total, distance));
        for (let i = 0; i < spear.lengths.length; i++) {
            const length = spear.lengths[i];
            if (left <= length || i === spear.lengths.length - 1) {
                const t = length > 0 ? left / length : 0;
                const a = spear.points[i],
                    b = spear.points[i + 1];
                return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            }
            left -= length;
        }
        return spear.points.at(-1)!;
    }
    public update(): void {
        const now = this.now();
        for (let i = this.spears.length - 1; i >= 0; i--) {
            const spear = this.spears[i],
                age = Math.max(0, now - spear.started);
            if (age >= WIND_SPEAR_TRAVEL_MS + WIND_SPEAR_FADE_MS) {
                spear.root.destroy({ children: true });
                this.spears.splice(i, 1);
                continue;
            }
            const progress = Math.min(1, age / WIND_SPEAR_TRAVEL_MS);
            const lead = (1 - (1 - progress) ** 3) * spear.total;
            const alpha = Math.min(1, (WIND_SPEAR_TRAVEL_MS + WIND_SPEAR_FADE_MS - age) / WIND_SPEAR_FADE_MS);
            const size = (spear.cell * 0.95) / (spear.head.texture.width || 64);
            const stretch = this.stretch();
            const position = this.pointAt(spear, lead);
            spear.head.position.set(position.x, position.y);
            spear.head.scale.set(size, size * stretch);
            spear.head.alpha = alpha;
            spear.trail.forEach((orb, index) => {
                const distance = lead - spear.cell * 0.32 * (index + 1);
                orb.visible = distance >= 0;
                if (!orb.visible) return;
                const k = 1 - (index + 1) / (TRAIL_COUNT + 1);
                const point = this.pointAt(spear, distance);
                orb.position.set(point.x, point.y);
                orb.scale.set(size * (0.45 + 0.5 * k), size * (0.45 + 0.5 * k) * stretch);
                orb.alpha = alpha * 0.55 * k;
            });
        }
    }
    public clear(): void {
        for (const spear of this.spears) spear.root.destroy({ children: true });
        this.spears.length = 0;
    }
}
