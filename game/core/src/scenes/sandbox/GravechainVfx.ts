import { Container, Graphics } from "pixi.js";
import type { IGravechainWave, HoCMath } from "@heroesofcrypto/common";

type Link = IGravechainWave["links"][number];

interface ChainLink {
    entry: Link;
    from: HoCMath.XY;
    chain: Graphics;
    burst: Graphics;
    arrived: boolean;
}

interface ChainWave {
    container: Container;
    links: ChainLink[];
    age: number;
    cellSize: number;
    stretch: number;
    onBind: (unitId: string) => void;
}

const TRAVEL = 0.24;
const RELAY_PAUSE = 0.1;
const HOP = TRAVEL + RELAY_PAUSE;
const AFTERGLOW = 0.55;
const SHADOW = 0x21162f;
const VIOLET = 0x9653d8;
const METAL = 0xa9abbc;
const HIGHLIGHT = 0xe3d5ff;

/** Footprint branches unfurl together at each hop; only actual bindings close a shackle. */
export class GravechainVfx {
    private waves: ChainWave[] = [];
    public constructor(private readonly attach: (container: Container) => number) {}
    public get active(): boolean {
        return this.waves.length > 0;
    }
    public spawn(links: readonly Link[], cellSize: number, onBind: (unitId: string) => void): void {
        if (!links.some((link) => link.applied)) return;
        const positions = new Map(links.map((link) => [link.unitId, link.position]));
        const container = new Container();
        const stretch = this.attach(container);
        const wave: ChainWave = {
            container,
            age: 0,
            cellSize,
            stretch,
            onBind,
            links: links.map((entry) => {
                const chain = new Graphics();
                const burst = new Graphics();
                burst.blendMode = "add";
                container.addChild(chain, burst);
                return {
                    entry: { ...entry, position: { ...entry.position } },
                    from: { ...(positions.get(entry.fromUnitId ?? "") ?? entry.position) },
                    chain,
                    burst,
                    arrived: false,
                };
            }),
        };
        this.waves.push(wave);
        this.draw(wave);
    }
    public update(dt: number): void {
        for (let index = this.waves.length - 1; index >= 0; index--) {
            const wave = this.waves[index];
            wave.age += dt;
            this.draw(wave);
            const lastArrival = Math.max(...wave.links.map((link) => link.entry.depth * HOP));
            if (wave.age >= lastArrival + AFTERGLOW) {
                wave.container.destroy({ children: true });
                this.waves.splice(index, 1);
            }
        }
    }
    public clear(): void {
        for (const wave of this.waves) wave.container.destroy({ children: true });
        this.waves = [];
    }
    private draw(wave: ChainWave): void {
        for (const link of wave.links) {
            const arrival = link.entry.depth * HOP;
            if (wave.age >= arrival && !link.arrived) {
                link.arrived = true;
                if (link.entry.applied) wave.onBind(link.entry.unitId);
            }
            this.drawChain(link, wave, arrival);
            this.drawShackle(link, wave, wave.age - arrival);
        }
    }
    private drawChain(link: ChainLink, wave: ChainWave, arrival: number): void {
        const gfx = link.chain.clear();
        if (!link.entry.fromUnitId) return;
        const travel = Math.max(0, Math.min(1, (wave.age - (arrival - TRAVEL)) / TRAVEL));
        const fade = Math.max(0, 1 - Math.max(0, wave.age - arrival - 0.1) / 0.4);
        if (travel <= 0 || fade <= 0) return;
        const from = link.from;
        const to = link.entry.position;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy) || 1;
        const nx = -dy / length;
        const ny = dx / length;
        const curve = Math.min(wave.cellSize * 0.2, length * 0.16);
        const count = Math.max(3, Math.ceil(length / (wave.cellSize * 0.13)));
        const point = (t: number) => ({
            x: from.x + dx * t + nx * Math.sin(t * Math.PI) * curve,
            y: from.y + dy * t + ny * Math.sin(t * Math.PI) * curve,
        });
        // A dark core gives the metal definition against both bright terrain and dark figures.
        for (const [width, color, alpha] of [
            [wave.cellSize * 0.1, VIOLET, 0.2],
            [wave.cellSize * 0.035, SHADOW, 0.85],
        ]) {
            gfx.moveTo(from.x, from.y);
            for (let step = 1; step <= 24; step++) {
                const p = point((step / 24) * travel);
                gfx.lineTo(p.x, p.y);
            }
            gfx.stroke({ width, color, alpha: alpha * fade });
        }
        for (let index = 0; index <= count; index++) {
            const t = index / count;
            if (t > travel) break;
            const p = point(t);
            const tangent = point(Math.min(1, t + 0.01));
            const previous = point(Math.max(0, t - 0.01));
            const angle = Math.atan2(tangent.y - previous.y, tangent.x - previous.x);
            const rx = wave.cellSize * 0.084;
            const ry = wave.cellSize * (index % 2 ? 0.023 : 0.05);
            this.oval(gfx, p.x, p.y, rx, ry, angle);
            gfx.stroke({ width: wave.cellSize * 0.031, color: SHADOW, alpha: fade });
            this.oval(gfx, p.x, p.y, rx, ry, angle);
            gfx.stroke({ width: wave.cellSize * 0.016, color: METAL, alpha: fade });
            this.oval(gfx, p.x, p.y + wave.cellSize * 0.01, rx * 0.87, ry * 0.78, angle);
            gfx.stroke({ width: wave.cellSize * 0.006, color: HIGHLIGHT, alpha: fade * 0.8 });
        }
        const head = point(travel);
        gfx.circle(head.x, head.y, wave.cellSize * 0.095).fill({ color: VIOLET, alpha: 0.5 * fade });
        gfx.circle(head.x, head.y, wave.cellSize * 0.035).fill({ color: HIGHLIGHT, alpha: fade });
    }
    private drawShackle(link: ChainLink, wave: ChainWave, age: number): void {
        const gfx = link.burst.clear();
        if (age < 0 || age >= AFTERGLOW) return;
        const { x, y } = link.entry.position;
        const size = wave.cellSize;
        const t = age / AFTERGLOW;
        const fade = 1 - t;
        if (!link.entry.applied) {
            // A passing wisp marks the relay without claiming that a resisted slow landed.
            gfx.ellipse(x, y, size * (0.14 + t * 0.24), size * (0.1 + t * 0.15) * wave.stretch).stroke({
                width: size * 0.018,
                color: VIOLET,
                alpha: fade * 0.45,
            });
            return;
        }
        const close = Math.min(1, age / 0.14);
        const radius = size * (0.45 - 0.14 * close);
        gfx.ellipse(x, y, size * (0.25 + t * 0.6), size * (0.16 + t * 0.4) * wave.stretch).stroke({
            width: size * 0.05 * fade,
            color: VIOLET,
            alpha: fade * 0.8,
        });
        // Two iron half-cuffs close around the figure, with interlocking links around their rim.
        for (let index = 0; index < 12; index++) {
            const angle = (index / 12) * Math.PI * 2;
            const gap = (1 - close) * size * 0.2 * Math.sign(Math.cos(angle));
            const px = x + Math.cos(angle) * radius + gap;
            const py = y + Math.sin(angle) * radius * 0.65 * wave.stretch;
            this.oval(gfx, px, py, size * 0.09, size * 0.045 * wave.stretch, angle + Math.PI / 2);
            gfx.stroke({ width: size * 0.025, color: VIOLET, alpha: fade });
            this.oval(gfx, px, py, size * 0.09, size * 0.045 * wave.stretch, angle + Math.PI / 2);
            gfx.stroke({ width: size * 0.01, color: HIGHLIGHT, alpha: fade });
        }
        for (let index = 0; index < 8; index++) {
            const angle = (index / 8) * Math.PI * 2 + 0.2;
            const distance = size * (0.22 + t * 0.65);
            const px = x + Math.cos(angle) * distance;
            const py = y + Math.sin(angle) * distance * wave.stretch;
            gfx.circle(px, py, size * 0.018 * fade).fill({ color: HIGHLIGHT, alpha: fade * fade });
        }
    }
    private oval(gfx: Graphics, x: number, y: number, rx: number, ry: number, rotation: number): void {
        const points: number[] = [];
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        for (let index = 0; index < 12; index++) {
            const angle = (index / 12) * Math.PI * 2;
            const px = Math.cos(angle) * rx;
            const py = Math.sin(angle) * ry;
            points.push(x + px * cos - py * sin, y + px * sin + py * cos);
        }
        gfx.poly(points, true);
    }
}
