import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { HoCMath } from "@heroesofcrypto/common";
import { BRUTALITY_ANATOMY } from "./brutality_anatomy";

export interface BrutalityPose {
    texture: Texture;
    x: number;
    y: number;
    anchorX: number;
    anchorY: number;
    scaleX: number;
    scaleY: number;
}

interface Drop {
    birth: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    landing: number;
}

interface Brutality {
    container: Container;
    body: Container;
    head: Container;
    ink: Graphics;
    ground: Graphics;
    slash: Graphics;
    age: number;
    size: number;
    neck: HoCMath.XY;
    headStart: HoCMath.XY;
    floor: number;
    vx: number;
    vy: number;
    side: number;
    mechanical: boolean;
    blood: number;
    dark: number;
    drops: Drop[];
}

const FLIGHT = 0.94;
const LIFE = 2.65;
const BLOOD = 0xa10e24;
const DARK_BLOOD = 0x4b0715;
const ease = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const noise = (i: number, salt: number): number => {
    const value = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
};

const splat = (
    graphics: Graphics,
    x: number,
    y: number,
    rx: number,
    ry: number,
    salt: number,
    alpha: number,
    blood: number,
    dark: number,
): void => {
    const points: number[] = [];
    for (let i = 0; i < 15; i++) {
        const angle = (i / 15) * Math.PI * 2;
        const radius = 0.7 + noise(i, salt) * 0.4;
        points.push(x + Math.cos(angle) * rx * radius, y + Math.sin(angle) * ry * radius);
    }
    graphics.poly(points).fill({ color: dark, alpha });
    graphics.ellipse(x - rx * 0.12, y + ry * 0.08, rx * 0.57, ry * 0.43).fill({ color: blood, alpha: alpha * 0.47 });
};

export class ZenaBrutalityVfx {
    private readonly deaths: Brutality[] = [];
    public constructor(private readonly attach: (container: Container) => number) {}
    public get active(): boolean {
        return this.deaths.length > 0;
    }
    public spawn(pose: BrutalityPose, name: string, cellSize: number, direction: HoCMath.XY): boolean {
        const anatomy = BRUTALITY_ANATOMY[name];
        if (!anatomy || pose.texture.destroyed || pose.texture.width <= 1 || pose.texture.height <= 1) return false;
        const container = new Container({ eventMode: "none", label: "zena-brutality" });
        container.position.set(pose.x, pose.y);
        const stretch = this.attach(container);
        container.scale.y = stretch;
        const width = pose.texture.width * pose.scaleX;
        const height = (pose.texture.height * pose.scaleY) / stretch;
        const point = (x: number, y: number): HoCMath.XY => ({
            x: (x - pose.anchorX) * width,
            y: (y - pose.anchorY) * height,
        });
        const [left, top, right, bottom] = anatomy.head;
        const bevelX = (right - left) * 0.12;
        const bevelY = (bottom - top) * 0.07;
        const outline = [
            point(left + bevelX, top),
            point(right - bevelX, top),
            point(right, top + bevelY),
            point(right, bottom - bevelY),
            point(right - bevelX, bottom),
            point(left + bevelX, bottom),
            point(left, bottom - bevelY),
            point(left, top + bevelY),
        ].flatMap(({ x, y }) => [x, y]);
        const headStart = point((left + right) / 2, (top + bottom) / 2);
        const neck = point(...(anatomy.neck ?? [(left + right) / 2, bottom]));
        const createFigure = (): Sprite => {
            const sprite = new Sprite(pose.texture);
            sprite.anchor.set(pose.anchorX, pose.anchorY);
            sprite.scale.set(pose.scaleX, pose.scaleY / stretch);
            return sprite;
        };
        const body = new Container({ label: "headless-body" });
        const bodyMask = new Graphics()
            .rect(-Math.abs(width), -Math.abs(height), Math.abs(width) * 2, Math.abs(height) * 2)
            .fill(0xffffff)
            .poly(outline)
            .cut();
        body.addChild(createFigure(), bodyMask);
        body.mask = bodyMask;
        const head = new Container({ label: "severed-head" });
        const headArt = new Container();
        const headMask = new Graphics().poly(outline).fill(0xffffff);
        headArt.addChild(createFigure(), headMask);
        headArt.mask = headMask;
        headArt.position.set(-headStart.x, -headStart.y);
        head.addChild(headArt);
        head.position.copyFrom(headStart);
        const ground = new Graphics({ label: "blood-pool" });
        const ink = new Graphics({ label: "blood-fountain" });
        const slash = new Graphics({ label: "neck-cut" });
        container.addChild(ground, body, ink, head, slash);
        const size = Math.max(1, cellSize);
        const side = Math.abs(direction.x) > 0.01 ? Math.sign(direction.x) : Math.sign(pose.scaleX) || 1;
        const floor = point(0.5, 0.97).y;
        const vx =
            side *
            size *
            (1.05 + Math.min(1, Math.abs(direction.x) / (Math.hypot(direction.x, direction.y) || 1)) * 0.5);
        const vy = (floor - headStart.y + size * 2.5 * FLIGHT ** 2) / FLIGHT;
        const death: Brutality = {
            container,
            body,
            head,
            ink,
            ground,
            slash,
            age: 0,
            size,
            neck,
            headStart,
            floor,
            vx,
            vy,
            side,
            mechanical: anatomy.mechanical ?? false,
            blood: anatomy.mechanical ? 0x453329 : BLOOD,
            dark: anatomy.mechanical ? 0x100f0b : DARK_BLOOD,
            drops: [],
        };
        for (let i = 0; i < 62; i++) {
            const birth = i < 18 ? noise(i, 1) * 0.075 : 0.06 + noise(i, 2) * 0.49;
            const origin = this.neckAt(death, birth);
            const dvx = size * ((noise(i, 3) - 0.5) * 1.55 + side * 0.24);
            const dvy = size * (2.05 + noise(i, 4) * 1.65);
            const gravity = size * 7;
            death.drops.push({
                birth,
                x: origin.x,
                y: origin.y,
                vx: dvx,
                vy: dvy,
                radius: size * (0.009 + noise(i, 5) * 0.019),
                landing: (dvy + Math.sqrt(dvy ** 2 + 2 * gravity * Math.max(0, origin.y - floor))) / gravity,
            });
        }
        if (this.deaths.length >= 24) this.deaths.shift()?.container.destroy({ children: true });
        this.deaths.push(death);
        this.draw(death);
        return true;
    }
    public update(dt: number): void {
        for (let i = this.deaths.length - 1; i >= 0; i--) {
            const death = this.deaths[i];
            death.age += Math.max(0, dt);
            if (death.age >= LIFE) {
                death.container.destroy({ children: true });
                this.deaths.splice(i, 1);
            } else this.draw(death);
        }
    }
    public clear(): void {
        for (const death of this.deaths) death.container.destroy({ children: true });
        this.deaths.length = 0;
    }
    private neckAt(death: Brutality, age: number): HoCMath.XY {
        const fall = ease((age - 0.06) / 0.73);
        const rotation = -death.side * fall * 1.25;
        const cs = Math.cos(rotation);
        const sn = Math.sin(rotation);
        return {
            x: death.neck.x * cs - death.neck.y * sn + death.side * death.size * 0.12 * fall,
            y: death.neck.x * sn + death.neck.y * cs - death.size * 0.08 * fall,
        };
    }
    private headAt(death: Brutality, age: number): HoCMath.XY {
        const t = Math.min(FLIGHT, age);
        const bounce = Math.max(0, Math.min(1, (age - FLIGHT) / 0.26));
        return {
            x: death.headStart.x + death.vx * t + death.side * death.size * 0.2 * ease(bounce),
            y:
                death.headStart.y +
                death.vy * t -
                death.size * 2.5 * t ** 2 +
                Math.sin(bounce * Math.PI) * death.size * 0.18,
        };
    }
    private draw(death: Brutality): void {
        const { age, size, side, floor, ground, ink, slash, blood, dark } = death;
        const fade = 1 - ease((age - 1.8) / (LIFE - 1.8));
        death.container.alpha = fade;
        const fall = ease((age - 0.06) / 0.73);
        death.body.rotation = -side * fall * 1.25;
        death.body.position.set(side * size * 0.12 * fall, -size * 0.08 * fall);
        death.body.alpha = 1 - ease((age - 0.55) / 0.6);
        const headPoint = this.headAt(death, age);
        death.head.position.copyFrom(headPoint);
        death.head.rotation = side * (Math.min(age, FLIGHT) * 6.4 + ease((age - FLIGHT) / 0.26) * 0.8);
        death.head.scale.set(1 + 0.12 * ease(age / 0.12));
        ground.clear();
        ink.clear();
        slash.clear();
        const pool = ease(age / 0.7);
        splat(ground, death.neck.x, floor, size * 0.33 * pool, size * 0.105 * pool, 12, 0.8, blood, dark);
        const shadow = Math.max(0.15, 1 - Math.max(0, headPoint.y - floor) / (size * 2.4));
        ground
            .ellipse(headPoint.x, floor - size * 0.025, size * 0.105, size * 0.035)
            .fill({ color: 0x10050a, alpha: shadow * 0.45 });
        if (age < 0.65) {
            const origin = this.neckAt(death, age);
            const pulse = Math.max(0, 1 - age / 0.65) * (0.82 + Math.sin(age * 49) * 0.18);
            for (let jet = 0; jet < 3; jet++) {
                const vx = size * ((jet - 1) * 0.47 + side * 0.12);
                const vy = size * (3 + noise(jet, 9) * 0.9) * (0.65 + pulse * 0.35);
                const travel = Math.min(0.32, age + 0.025);
                for (const [color, thickness] of [
                    [dark, 0.066],
                    [blood, 0.04],
                ] as const) {
                    const left: number[] = [];
                    const right: number[] = [];
                    for (let step = 0; step <= 9; step++) {
                        const t = (step / 9) * travel;
                        const width = size * thickness * pulse * (1 - step / 12) * (0.85 + noise(step, jet + 16) * 0.3);
                        const wobble = Math.sin(t * 34 + jet) * size * 0.012 * (step / 9);
                        const x = origin.x + vx * t + wobble;
                        const y = origin.y + vy * t - size * 3.5 * t * t;
                        left.push(x - width, y);
                        right.unshift(x + width, y);
                    }
                    ink.poly([...left, ...right]).fill({ color, alpha: 0.95 * pulse });
                }
            }
        }
        for (const [index, drop] of death.drops.entries()) {
            const t = age - drop.birth;
            if (t < 0) continue;
            const spark = death.mechanical && index < 12;
            if (spark && t > 0.34) continue;
            if (t >= drop.landing) {
                const spread = ease((t - drop.landing) / 0.12);
                ground
                    .ellipse(
                        drop.x + drop.vx * drop.landing,
                        floor + noise(index, 8) * size * 0.06,
                        drop.radius * (1.6 + spread),
                        drop.radius * 0.55,
                    )
                    .fill({ color: index % 3 ? dark : blood, alpha: 0.65 });
                continue;
            }
            const x = drop.x + drop.vx * t;
            const y = drop.y + drop.vy * t - size * 3.5 * t ** 2;
            const tail = Math.max(0, t - 0.022);
            ink.moveTo(drop.x + drop.vx * tail, drop.y + drop.vy * tail - size * 3.5 * tail ** 2)
                .lineTo(x, y)
                .stroke({
                    color: spark ? 0xffc281 : dark,
                    width: drop.radius * (spark ? 0.7 : 1.75),
                    alpha: 0.95,
                    cap: "round",
                });
            ink.circle(x, y, drop.radius * 0.78).fill({ color: spark ? 0xffd49a : blood, alpha: 0.94 });
        }
        if (age > 0.04 && age < FLIGHT) {
            for (let i = 1; i <= 6; i++) {
                const t = Math.max(0, age - i * 0.022);
                const p = this.headAt(death, t);
                ink.circle(p.x, p.y - size * i * 0.007, size * (0.022 - i * 0.002)).fill({
                    color: blood,
                    alpha: (1 - i / 7) * 0.7,
                });
            }
        }
        if (age >= FLIGHT) splat(ground, headPoint.x, floor, size * 0.15, size * 0.05, 14, 0.8, blood, dark);
        if (age < 0.17) {
            const t = age / 0.17;
            const neck = death.neck;
            slash
                .moveTo(neck.x - side * size * 0.43, neck.y - size * 0.1)
                .quadraticCurveTo(neck.x, neck.y + size * 0.12, neck.x + side * size * 0.38, neck.y + size * 0.04)
                .stroke({ color: 0xffc9b4, width: size * 0.032 * (1 - t), alpha: (1 - t) * 0.9 });
        }
    }
}
