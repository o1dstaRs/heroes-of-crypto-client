import { OVERHEAD_EFFECT_DURATION_MS } from "../../settings/statusEffectTiming";
import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import { beholderDebuffFramePose } from "./beholderDebuffRegistration";
import { glyphScaleX } from "../../pixi/boardMirror";

/** Each atlas contains the animated central motif, without the original icon's tile or frame. */
export const BEHOLDER_DEBUFFS = [
    "Curse",
    "Sadness",
    "Quagmire",
    "Weakening Beam",
    "Weakness",
    "Rangebane",
    "Cowardice",
] as const;
export const isBeholderDebuff = (name: string): boolean => (BEHOLDER_DEBUFFS as readonly string[]).includes(name);
export const beholderDebuffTextureName = (name: string): string | undefined =>
    isBeholderDebuff(name) ? `vfx_beholder_${name.toLowerCase().replaceAll(" ", "_")}_pop_atlas` : undefined;
const LIFE_MS = OVERHEAD_EFFECT_DURATION_MS;
const MAX_GROUPS = 16;
const FRAME_COUNT = 16;
type Anchor = Readonly<{ x: number; y: number }>;
type Motif = { name: string; sprite: Sprite; frames: Texture[] };
type Group = {
    unitId: string;
    container: Container;
    motifs: Motif[];
    cell: number;
    anchor: Anchor;
    impactAtMs: number;
    shownAtMs?: number;
    waitedForDamage: boolean;
    waitForDamage?: () => boolean;
    follow?: () => Anchor | undefined;
};

/** One horizontal row, centered on the banner even for an even number of effects. */
export function beholderDebuffSlot(index: number, count: number): Anchor {
    return { x: (index - (count - 1) / 2) * 1.04, y: -0.69 };
}

/** Authored motion plays only after the damage/loss numbers finish, without delaying combat. */
export class BeholderDebuffPops {
    private groups: Group[] = [];
    private readonly frameCache = new Map<Texture, Texture[]>();
    public constructor(
        private readonly attach: (container: Container, z: number) => void,
        private readonly now: () => number = () => performance.now(),
    ) {}
    public get active(): boolean {
        return this.groups.length > 0;
    }
    private frames(atlas: Texture): Texture[] {
        let frames = this.frameCache.get(atlas);
        if (!frames) {
            const width = atlas.width / 4,
                height = atlas.height / 4;
            frames = Array.from(
                { length: FRAME_COUNT },
                (_, i) =>
                    new Texture({
                        source: atlas.source,
                        frame: new Rectangle((i % 4) * width, Math.floor(i / 4) * height, width, height),
                    }),
            );
            this.frameCache.set(atlas, frames);
        }
        return frames;
    }
    public spawn(
        unitId: string,
        anchor: Anchor,
        cell: number,
        name: string,
        atlas: Texture,
        follow?: () => Anchor | undefined,
        impactAtMs = this.now(),
        waitForDamage?: () => boolean,
    ): void {
        if (!isBeholderDebuff(name) || this.now() - impactAtMs >= LIFE_MS) return;
        let group = this.groups.find((g) => g.unitId === unitId && Math.abs(g.impactAtMs - impactAtMs) < 80);
        if (group?.motifs.some((m) => m.name === name)) return;
        if (!group) {
            if (this.groups.length >= MAX_GROUPS) this.groups.shift()!.container.destroy({ children: true });
            const container = new Container();
            container.visible = false;
            this.attach(container, 5520);
            group = {
                unitId,
                container,
                motifs: [],
                cell,
                anchor,
                impactAtMs,
                follow,
                waitForDamage,
                waitedForDamage: false,
            };
            this.groups.push(group);
        }
        const frames = this.frames(atlas);
        const sprite = new Sprite(frames[0]);
        sprite.anchor.set(0.5);
        sprite.width = sprite.height = cell;
        group.container.addChild(sprite);
        group.motifs.push({ name, sprite, frames });
        this.update();
    }
    public update(): void {
        const now = this.now();
        for (let i = this.groups.length - 1; i >= 0; i--) {
            const g = this.groups[i];
            const anchor = g.follow ? g.follow() : g.anchor;
            if (!anchor) {
                g.container.destroy({ children: true });
                this.groups.splice(i, 1);
                continue;
            }
            if (g.shownAtMs === undefined) {
                if (g.waitForDamage?.()) {
                    g.waitedForDamage = true;
                    continue;
                }
                g.shownAtMs = g.waitedForDamage ? now : g.impactAtMs;
            }
            const elapsed = Math.max(0, now - g.shownAtMs);
            if (elapsed >= LIFE_MS) {
                g.container.destroy({ children: true });
                this.groups.splice(i, 1);
                continue;
            }
            const matrix = g.container.parent?.getGlobalTransform();
            const aspect = matrix
                ? Math.hypot(matrix.a, matrix.b) / Math.max(0.001, Math.hypot(matrix.c, matrix.d))
                : 1;
            g.container.visible = true;
            g.container.position.set(anchor.x, anchor.y);
            g.container.scale.set(glyphScaleX(), -aspect);
            g.container.alpha = Math.min(1, elapsed / (LIFE_MS * 0.075), (LIFE_MS - elapsed) / (LIFE_MS * 0.15));
            const frame = Math.min(FRAME_COUNT - 1, Math.floor((elapsed / LIFE_MS) * FRAME_COUNT));
            g.motifs.forEach((motif, index) => {
                const slot = beholderDebuffSlot(index, g.motifs.length);
                const [offsetX, offsetY, scale] = beholderDebuffFramePose(motif.name, frame);
                motif.sprite.texture = motif.frames[frame];
                // Uniform registration around a structural landmark, never the changing silhouette.
                motif.sprite.width = motif.sprite.height = g.cell * scale;
                motif.sprite.position.set((slot.x + offsetX / 256) * g.cell, (slot.y + offsetY / 256) * g.cell);
            });
        }
    }
    public clear(): void {
        for (const group of this.groups) group.container.destroy({ children: true });
        this.groups.length = 0;
        // These are only frame views. The atlas and its shared GPU source remain owned by Assets.
        for (const frames of this.frameCache.values()) for (const frame of frames) frame.destroy(false);
        this.frameCache.clear();
    }
}
