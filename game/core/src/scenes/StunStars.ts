import { Container, Graphics, GraphicsContext, Point } from "pixi.js";
import { readStunOrbitSettings, type StunOrbitSettings } from "../settings/stunOrbitSettings";

export const STUN_STAR_COUNT = 5;
const TAIL_COUNT = 4;
const TAU = Math.PI * 2;

/** Screen-facing ellipse, with a small independent bob and a slow metal-face tumble. */
export function stunStarPose(index: number, nowMs: number, lag = 0) {
    const phase = nowMs * 0.0028 + (index * TAU) / STUN_STAR_COUNT - lag;
    const depth = Math.sin(phase);
    return {
        x: Math.cos(phase),
        y: depth + Math.sin(phase * 2 + index) * 0.06,
        depth,
        scale: 0.82 + (depth + 1) * 0.12,
        rotation: Math.sin(nowMs * 0.0017 + index) * 0.35,
        roll: 0.72 + Math.sin(nowMs * 0.0022 + index * 1.7) * 0.25,
    };
}

/** Bounded engine geometry, built once. No textures, filters or per-frame geometry allocation. */
export class StunStars {
    public readonly root = new Container();
    private readonly starContext = new GraphicsContext();
    private readonly sparkContext = new GraphicsContext();
    private readonly glintContext = new GraphicsContext();
    private readonly glints: Graphics[] = [];
    private readonly stars: Graphics[] = [];
    private readonly tails: Graphics[][] = [];
    private readonly screenPoint = new Point();
    private readonly localPoint = new Point();
    private startedAt = 0;
    public constructor() {
        this.root.label = "stun-orbit-stars";
        this.root.eventMode = "none";
        this.root.sortableChildren = true;
        this.root.visible = false;
        const g = this.starContext;
        g.star(0, 0, 5, 1.7, 0.72).fill({ color: 0xffa52b, alpha: 0.035 });
        g.star(0, 0, 5, 1.35, 0.57).fill({ color: 0xffd469, alpha: 0.09 });
        // Dark extruded edge, gold bevel and thirty enamel/metal facets.
        g.star(0.055, 0.11, 5, 1.03, 0.45).fill(0x703c12);
        g.star(0, 0, 5, 1, 0.43).fill(0xe2a03a).stroke({ color: 0xffe6a0, width: 0.055 });
        for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            const b = a + Math.PI / 5;
            const r1 = i % 2 === 0 ? 0.98 : 0.42;
            const r2 = i % 2 === 0 ? 0.42 : 0.98;
            const ax = Math.cos(a) * r1,
                ay = Math.sin(a) * r1;
            const bx = Math.cos(b) * r2,
                by = Math.sin(b) * r2;
            g.poly([ax, ay, bx, by, bx * 0.78, by * 0.78, ax * 0.78, ay * 0.78]).fill(
                [0xfff7c7, 0xe3a239, 0xffdf78, 0x9b581a, 0xffeea4][i % 5],
            );
            const mx = (ax + bx) * 0.39,
                my = (ay + by) * 0.39;
            g.poly([-0.08, -0.1, ax * 0.78, ay * 0.78, mx, my]).fill(
                [0xffe79c, 0xd18a25, 0xffc856, 0xaa641b, 0xffe8a9][i % 5],
            );
            g.poly([-0.08, -0.1, mx, my, bx * 0.78, by * 0.78]).fill(
                [0xfff5c3, 0xf8c74c, 0xe6a12b, 0xc38727, 0xffd86b][i % 5],
            );
        }
        g.circle(-0.08, -0.1, 0.12).fill(0xffefb2);
        this.glintContext.star(0, 0, 4, 0.7, 0.055).fill({ color: 0xffce67, alpha: 0.18 });
        this.glintContext.star(0, 0, 4, 0.42, 0.035).fill(0xfff8d9);
        this.glintContext.circle(0, 0, 0.08).fill(0xffffff);
        // Short tapered wakes, oriented along the projected orbit, with tiny point sparks.
        this.sparkContext.poly([-2.2, 0, 0, -0.5, 0.9, 0, 0, 0.5]).fill({ color: 0xffbe49, alpha: 0.22 });
        this.sparkContext.poly([-1.6, 0, 0, -0.16, 0.65, 0, 0, 0.16]).fill({ color: 0xffe29b, alpha: 0.65 });
        this.sparkContext.star(0, 0, 4, 0.6, 0.1).fill(0xfff1bc);
        for (let i = 0; i < STUN_STAR_COUNT; i++) {
            const star = new Graphics(g);
            this.root.addChild(star);
            this.stars.push(star);
            const glint = new Graphics(this.glintContext);
            glint.blendMode = "add";
            star.addChild(glint);
            this.glints.push(glint);
            const tail = Array.from({ length: TAIL_COUNT }, () => {
                const spark = new Graphics(this.sparkContext);
                this.root.addChild(spark);
                return spark;
            });
            this.tails.push(tail);
        }
    }
    public update(
        flag: Container,
        nowMs: number,
        cell: number,
        flagWidth: number,
        flagHeight: number,
        orbit: StunOrbitSettings = readStunOrbitSettings(),
    ): void {
        const parent = flag.parent;
        if (!parent || !flag.visible || !flag.renderable || flag.destroyed) {
            this.hide();
            return;
        }
        if (this.root.parent !== parent) parent.addChild(this.root);
        if (!this.root.visible) this.startedAt = nowMs;
        this.root.visible = true;
        const transform = parent.getGlobalTransform();
        const sx = Math.hypot(transform.a, transform.b);
        const sy = Math.hypot(transform.c, transform.d);
        // Anchor to the cloth itself; status icons and the creature's animated bounds cannot shift the orbit.
        flag.toGlobal(this.screenPoint.set(0, 0), this.screenPoint);
        parent.toLocal(this.screenPoint, undefined, this.localPoint);
        this.root.position.copyFrom(this.localPoint);
        this.root.scale.set(transform.a < 0 ? -1 : 1, -sx / Math.max(0.001, sy));
        this.root.zIndex = flag.zIndex + 0.05;
        this.root.alpha = Math.min(1, Math.max(0, (nowMs - this.startedAt) / 140)) * flag.alpha;
        const flagTransform = flag.getGlobalTransform();
        const radius = cell * 0.055;
        const rx =
            ((flagWidth * Math.hypot(flagTransform.a, flagTransform.b)) / Math.max(0.001, sx)) * 0.72 + radius * 1.8;
        const ry =
            ((flagHeight * Math.hypot(flagTransform.c, flagTransform.d)) / Math.max(0.001, sx)) * 0.72 + radius * 1.8;
        // Tilt the entire orbital plane, then rotate that projected ellipse in screen space.
        // At 90° the path crosses the quantity; star glyphs keep their own independent tumble.
        const tilt = Math.cos((orbit.tiltDeg * Math.PI) / 180);
        const angle = (orbit.rotationDeg * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        for (let i = 0; i < this.stars.length; i++) {
            const pose = stunStarPose(i, nowMs);
            const star = this.stars[i];
            const x = pose.x * rx;
            const y = pose.y * ry * tilt;
            star.position.set(x * cos - y * sin, x * sin + y * cos);
            star.scale.set(radius * 1.13 * pose.scale * pose.roll, radius * 1.13 * pose.scale);
            star.rotation = pose.rotation;
            star.alpha = 0.75 + (pose.depth + 1) * 0.125;
            star.zIndex = pose.depth;
            const shine = Math.pow(Math.max(0, Math.sin(nowMs * 0.0038 + i * 2.1)), 8);
            const glint = this.glints[i];
            glint.position.set(-0.19 + Math.sin(nowMs * 0.0012 + i) * 0.12, -0.3);
            glint.alpha = 0.12 + shine * 0.88;
            glint.scale.set(0.65 + shine * 0.65);
            glint.rotation = -pose.rotation;
            for (let j = 0; j < TAIL_COUNT; j++) {
                const tailPose = stunStarPose(i, nowMs, (j + 1) * 0.12);
                const spark = this.tails[i][j];
                const tx = tailPose.x * rx;
                const ty = tailPose.y * ry * tilt;
                spark.position.set(tx * cos - ty * sin, tx * sin + ty * cos);
                const phase = nowMs * 0.0028 + (i * TAU) / STUN_STAR_COUNT - (j + 1) * 0.12;
                const dx = -Math.sin(phase) * rx;
                const dy = (Math.cos(phase) + Math.cos(phase * 2 + i) * 0.12) * ry * tilt;
                spark.rotation = angle + Math.atan2(dy, dx);
                spark.scale.set(cell * 0.017 * (1 - j / 5), cell * 0.009 * (1 - j / 5));
                spark.alpha = (0.6 - j * 0.12) * (0.85 + Math.sin(nowMs * 0.007 + i + j) * 0.15);
                spark.zIndex = tailPose.depth - 0.01;
            }
        }
    }
    public hide(): void {
        this.root.visible = false;
    }
    public destroy(): void {
        this.root.destroy({ children: true });
        this.starContext.destroy();
        this.sparkContext.destroy();
        this.glintContext.destroy();
    }
}
