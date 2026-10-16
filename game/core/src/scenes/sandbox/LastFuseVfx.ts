import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { HoCMath } from "@heroesofcrypto/common";

interface Fragment {
    node?: Graphics;
    angle: number;
    distance: number;
    lift: number;
    size: number;
    spin: number;
    flight: number;
}

interface Plume {
    sprite: Sprite;
    angle: number;
    distance: number;
    lift: number;
    size: number;
    delay: number;
    life: number;
    smoke: boolean;
}

interface Burst {
    container: Container;
    ground: Graphics;
    spray: Graphics;
    light: Graphics;
    chunks: Fragment[];
    drops: Fragment[];
    sparks: Fragment[];
    plumes: Plume[];
    age: number;
    life: number;
    size: number;
    stretch: number;
    impact: boolean;
    started: boolean;
    onImpact?: () => void;
}

const TAU = Math.PI * 2;
const BLOOD = [0x650a13, 0x981425, 0xc82e38];
const FLESH = [0x8e1c2a, 0xb13740, 0x751b29];
const FIRE = [0xff4914, 0xff8d25, 0xffcb70];
const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const scatter = (index: number, salt = 0): number => {
    const value = Math.sin((index + 1) * 127.1 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
};

export class LastFuseVfx {
    private bursts: Burst[] = [];
    public constructor(
        private readonly attach: (container: Container) => number,
        private readonly texture: () => Texture,
    ) {}
    public get active(): boolean {
        return this.bursts.length > 0;
    }
    public spawn(position: HoCMath.XY, cellSize: number, delaySec = 0): void {
        this.create(position, cellSize, delaySec);
    }
    public hit(
        position: HoCMath.XY,
        origin: HoCMath.XY,
        cellSize: number,
        delaySec: number,
        onImpact: (direction: HoCMath.XY) => void,
    ): void {
        const dx = position.x - origin.x;
        const dy = position.y - origin.y;
        const length = Math.hypot(dx, dy);
        const direction = length > 0.001 ? { x: dx / length, y: dy / length } : { x: 0, y: 1 };
        this.create(position, cellSize * 0.52, delaySec, direction, () => onImpact(direction));
    }
    public update(dt: number): void {
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            const burst = this.bursts[i];
            burst.age += Math.max(0, dt);
            if (burst.age < 0) continue;
            if (!burst.started) {
                burst.started = true;
                if (burst.age < burst.life) burst.onImpact?.();
                burst.onImpact = undefined;
            }
            if (burst.age >= burst.life) {
                burst.container.destroy({ children: true });
                this.bursts.splice(i, 1);
                continue;
            }
            burst.container.visible = true;
            this.draw(burst);
        }
    }
    public clear(): void {
        for (const burst of this.bursts) burst.container.destroy({ children: true });
        this.bursts.length = 0;
    }
    private create(
        position: HoCMath.XY,
        cellSize: number,
        delaySec: number,
        direction?: HoCMath.XY,
        onImpact?: () => void,
    ): void {
        const container = new Container();
        container.position.set(position.x, position.y);
        container.visible = false;
        container.eventMode = "none";
        const stretch = this.attach(container);
        const ground = new Graphics();
        const spray = new Graphics();
        const light = new Graphics();
        light.blendMode = "add";
        container.addChild(ground);
        const size = Math.max(1, cellSize);
        const impact = !!direction;
        const heading = direction ? Math.atan2(direction.y / stretch, direction.x) : 0;
        const angleFor = (i: number, count: number, salt: number) =>
            impact ? heading + (scatter(i, salt) - 0.5) * 1.9 : (i / count) * TAU + scatter(i, salt) * 0.45;
        const makeFragments = (count: number, salt: number, chunky = false): Fragment[] =>
            Array.from({ length: count }, (_, i) => ({
                angle: angleFor(i, count, salt),
                distance: size * (0.65 + scatter(i, salt + 1) * (chunky ? 1.25 : 1.85)),
                lift: size * (0.4 + scatter(i, salt + 2) * (chunky ? 1.5 : 1.05)),
                size:
                    size *
                    (chunky
                        ? 0.045 + Math.pow(scatter(i, salt + 3), 1.5) * 0.115
                        : 0.012 + scatter(i, salt + 3) * 0.025),
                spin: (scatter(i, salt + 4) - 0.5) * 18,
                flight: 0.38 + scatter(i, salt + 5) * (chunky ? 0.55 : 0.4),
            }));
        const plumes: Plume[] = [];
        const texture = this.texture();
        for (const smoke of [true, false]) {
            const count = impact ? (smoke ? 4 : 7) : smoke ? 10 : 18;
            for (let i = 0; i < count; i++) {
                const sprite = new Sprite(texture);
                sprite.anchor.set(0.5);
                sprite.visible = false;
                sprite.blendMode = smoke ? "normal" : "add";
                sprite.tint = smoke ? [0x302525, 0x4c3932, 0x231d24][i % 3] : FIRE[i % FIRE.length];
                container.addChild(sprite);
                plumes.push({
                    sprite,
                    angle: angleFor(i, count, 12),
                    distance: size * (0.25 + scatter(i, 13) * (smoke ? 0.8 : 0.95)),
                    lift: size * (0.3 + scatter(i, 14) * (smoke ? 1.25 : 0.65)),
                    size: size * (smoke ? 0.95 + scatter(i, 15) * 0.6 : 0.55 + scatter(i, 15) * 0.7),
                    delay: smoke ? 0.06 + scatter(i, 16) * 0.12 : scatter(i, 16) * 0.055,
                    life: smoke ? 0.65 + scatter(i, 17) * 0.4 : 0.22 + scatter(i, 17) * 0.2,
                    smoke,
                });
            }
        }
        container.addChild(light, spray);
        const chunks = impact ? [] : makeFragments(14, 21, true);
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const node = new Graphics();
            const vertices = Array.from({ length: 9 }, (_, vertex) => {
                const angle = (vertex / 9) * TAU;
                const radius = 0.55 + scatter(i * 9 + vertex, 31) * 0.65;
                return { x: Math.cos(angle) * radius * (i % 3 ? 1 : 1.3), y: Math.sin(angle) * radius * 0.7 };
            });
            for (const [scale, color, offset] of [
                [1, 0x460b19, 0],
                [0.88, FLESH[i % FLESH.length], 0.06],
            ]) {
                const first = vertices[0];
                const last = vertices[vertices.length - 1];
                node.moveTo((first.x + last.x) * scale * 0.5, (first.y + last.y) * scale * 0.5 + offset);
                for (let j = 0; j < vertices.length; j++) {
                    const p = vertices[j];
                    const next = vertices[(j + 1) % vertices.length];
                    node.quadraticCurveTo(
                        p.x * scale,
                        p.y * scale + offset,
                        (p.x + next.x) * scale * 0.5,
                        (p.y + next.y) * scale * 0.5 + offset,
                    );
                }
                node.closePath().fill(color);
            }
            for (let tissue = 0; tissue < 4; tissue++) {
                const y = -0.22 + tissue * 0.13;
                node.moveTo(-0.48, y)
                    .quadraticCurveTo(-0.14, y + 0.2, 0.43, y - 0.08)
                    .stroke({
                        color: tissue % 2 ? 0xe4867c : 0x420913,
                        width: 0.055,
                        alpha: 0.5,
                    });
                node.ellipse(-0.24 + tissue * 0.12, y + 0.17, 0.065, 0.035).fill({ color: 0xf6aea1, alpha: 0.45 });
            }
            if (i % 4 === 0) {
                node.moveTo(0.16, 0.12).lineTo(0.86, 0.2).stroke({ color: 0xd8b4a2, width: 0.12 });
            }
            const wrapper = new Container();
            wrapper.scale.y = stretch;
            wrapper.addChild(node);
            container.addChild(wrapper);
            chunk.node = node;
        }
        this.bursts.push({
            container,
            ground,
            spray,
            light,
            chunks,
            drops: makeFragments(impact ? 13 : 32, 41),
            sparks: makeFragments(impact ? 10 : 25, 51),
            plumes,
            age: -Math.max(0, delaySec),
            life: impact ? 0.95 : 1.45,
            size,
            stretch,
            impact,
            started: false,
            onImpact,
        });
    }
    private point(fragment: Fragment, age: number, stretch: number): HoCMath.XY {
        const t = clamp(age / fragment.flight);
        const travel = 1 - (1 - t) * (1 - t);
        const bounce = Math.max(0, 1 - (age - fragment.flight) / 0.18);
        const height =
            age < fragment.flight ? 4 * fragment.lift * t * (1 - t) : fragment.lift * 0.12 * Math.sin(bounce * Math.PI);
        return {
            x: Math.cos(fragment.angle) * fragment.distance * travel,
            y: Math.sin(fragment.angle) * fragment.distance * travel * 0.42 + height * stretch,
        };
    }
    private draw(burst: Burst): void {
        const { age, size, stretch } = burst;
        const fade = clamp((burst.life - age) / 0.45);
        const ground = burst.ground.clear();
        const light = burst.light.clear();
        const spray = burst.spray.clear();
        if (!burst.impact) {
            ground.ellipse(0, 0, size * 0.72, size * 0.25).fill({ color: 0x250d10, alpha: 0.48 * fade });
            const shock = clamp(age / 0.32);
            const radius = size * (0.12 + 1.65 * (1 - Math.pow(1 - shock, 3)));
            light.ellipse(0, 0, radius, radius * 0.42).stroke({
                width: size * (0.012 + 0.07 * (1 - shock)),
                color: 0xffc075,
                alpha: Math.pow(1 - shock, 2) * 0.85,
            });
        }
        const flash = clamp(1 - age / 0.16);
        light.ellipse(0, size * 0.15 * stretch, size * (0.2 + age), size * (0.3 + age) * stretch).fill({
            color: 0xffefd1,
            alpha: flash * 0.95,
        });
        for (const plume of burst.plumes) {
            const t = (age - plume.delay) / plume.life;
            plume.sprite.visible = t >= 0 && t < 1;
            if (!plume.sprite.visible) continue;
            const travel = 1 - Math.pow(1 - t, 3);
            plume.sprite.position.set(
                Math.cos(plume.angle) * plume.distance * travel,
                Math.sin(plume.angle) * plume.distance * travel * 0.42 + plume.lift * travel * stretch,
            );
            const diameter = plume.size * (plume.smoke ? 0.55 + t : 0.4 + Math.sin(Math.PI * t) * 0.7);
            plume.sprite.width = diameter;
            plume.sprite.height = diameter * stretch;
            plume.sprite.alpha = plume.smoke ? Math.sin(Math.PI * t) * 0.7 : clamp(t / 0.08) * (1 - t) * 0.95;
        }
        for (const [i, drop] of burst.drops.entries()) {
            const p = this.point(drop, age, stretch);
            if (age < drop.flight) {
                const previous = this.point(drop, Math.max(0, age - 0.026), stretch);
                spray
                    .moveTo(previous.x, previous.y)
                    .lineTo(p.x, p.y)
                    .stroke({
                        color: BLOOD[i % BLOOD.length],
                        width: drop.size * 1.6,
                        alpha: fade,
                        cap: "round",
                    });
                spray.ellipse(p.x, p.y, drop.size, drop.size * 0.7 * stretch).fill({ color: 0xb92b38, alpha: fade });
            } else {
                ground
                    .ellipse(p.x, Math.sin(drop.angle) * drop.distance * 0.42, drop.size * 2.4, drop.size * 0.8)
                    .fill({
                        color: BLOOD[i % BLOOD.length],
                        alpha: 0.68 * fade,
                    });
            }
        }
        for (const spark of burst.sparks) {
            if (age > spark.flight) continue;
            const p = this.point(spark, age, stretch);
            const previous = this.point(spark, Math.max(0, age - 0.035), stretch);
            const alpha = Math.pow(1 - age / spark.flight, 1.2);
            light.moveTo(previous.x, previous.y).lineTo(p.x, p.y).stroke({
                width: spark.size,
                color: 0xffaa43,
                alpha,
                cap: "round",
            });
            light.circle(p.x, p.y, spark.size * 0.6).fill({ color: 0xffefb5, alpha });
        }
        for (const chunk of burst.chunks) {
            const node = chunk.node!;
            const p = this.point(chunk, age, stretch);
            node.parent!.position.set(p.x, p.y);
            const tumble = Math.min(age, chunk.flight + 0.18) * chunk.spin;
            node.rotation = chunk.angle + tumble;
            node.scale.set(chunk.size, chunk.size * (0.72 + Math.abs(Math.cos(tumble)) * 0.28));
            node.alpha = fade;
            const groundY =
                Math.sin(chunk.angle) * chunk.distance * clamp(1 - Math.pow(1 - clamp(age / chunk.flight), 2)) * 0.42;
            ground
                .ellipse(p.x, groundY, chunk.size * 1.2, chunk.size * 0.42)
                .fill({ color: 0x210d13, alpha: 0.3 * fade });
            if (age < chunk.flight && age > 0.08) {
                const tail = this.point(chunk, Math.max(0, age - 0.065), stretch);
                spray
                    .moveTo(tail.x, tail.y)
                    .lineTo(p.x, p.y)
                    .stroke({
                        color: 0x8f1626,
                        width: chunk.size * 0.3,
                        alpha: 0.45 * fade,
                        cap: "round",
                    });
            }
        }
    }
}
