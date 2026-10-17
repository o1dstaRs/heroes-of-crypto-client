import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";

type Anchor = Readonly<{ x: number; y: number }>;
const atlasUrl = images.vfx_borrowed_grace_pop_atlas;
const meta = animationAtlases["Vfx Borrowed Grace"].pop;
export const BORROWED_GRACE_REVEAL_MS = 1000;
const LIFE_MS = 2000;
let leases = 0;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** The enemy's hand finishes before the actual stolen buff appears above the monk. */
export function borrowedGracePose(age: number) {
    let end = 0;
    const frame = meta.frameDurationsMs!.findIndex((duration) => {
        end += duration;
        return Math.max(0, age) < end;
    });
    const revealAge = age - BORROWED_GRACE_REVEAL_MS;
    return {
        frame,
        reveal: age >= BORROWED_GRACE_REVEAL_MS,
        iconAlpha: clamp(revealAge / 120) * clamp((LIFE_MS - age) / 240),
        iconScale: 0.9 + 0.1 * clamp(revealAge / 160),
        finished: age >= LIFE_MS,
    };
}

export class BorrowedGracePops {
    private frames?: Texture[];
    private load?: Promise<Texture[] | undefined>;
    private generation = 0;
    private leased = false;
    private pops: {
        enemy: Container;
        monk: Container;
        hand: Sprite;
        icon: Sprite;
        from: Anchor;
        cell: number;
        started: number;
        source: () => Anchor | undefined;
        recipient: () => Anchor | undefined;
        onReveal?: () => void;
        revealed: boolean;
    }[] = [];
    public constructor(
        private readonly attach: (container: Container, zIndex: number) => void,
        private readonly now: () => number = () => performance.now(),
    ) {}
    public get active(): boolean {
        return this.pops.length > 0;
    }
    private loadFrames(): Promise<Texture[] | undefined> {
        if (this.frames) return Promise.resolve(this.frames);
        if (this.load) return this.load;
        if (!this.leased) {
            this.leased = true;
            leases++;
        }
        const generation = this.generation;
        this.load = Assets.load<Texture>(atlasUrl).then(
            (atlas) => {
                if (generation !== this.generation) return undefined;
                this.frames = Array.from(
                    { length: meta.frameCount },
                    (_, i) =>
                        new Texture({
                            source: atlas.source,
                            frame: new Rectangle(
                                (i % meta.layout.cols) * meta.frameWidth,
                                Math.floor(i / meta.layout.cols) * meta.frameHeight,
                                meta.frameWidth,
                                meta.frameHeight,
                            ),
                        }),
                );
                return this.frames;
            },
            () => {
                if (generation === this.generation) this.clear();
                return undefined;
            },
        );
        return this.load;
    }
    public async spawn(
        from: Anchor,
        cell: number,
        texture: Texture,
        source: () => Anchor | undefined,
        recipient: () => Anchor | undefined,
        onReveal?: () => void,
    ): Promise<void> {
        const generation = this.generation;
        const frames = await this.loadFrames();
        if (!frames || generation !== this.generation || !recipient()) return;
        const enemy = new Container(),
            monk = new Container();
        const hand = new Sprite(frames[0]),
            icon = new Sprite(texture);
        hand.anchor.set(0.5, 1);
        hand.width = hand.height = cell * 1.45 * 0.9;
        icon.anchor.set(0.5);
        enemy.addChild(hand);
        monk.addChild(icon);
        this.attach(enemy, 5520);
        this.attach(monk, 5520);
        this.pops.push({
            enemy,
            monk,
            hand,
            icon,
            from,
            cell,
            started: this.now(),
            source,
            recipient,
            onReveal,
            revealed: false,
        });
        this.update(0);
    }
    public update(_dt: number): void {
        for (let i = this.pops.length - 1; i >= 0; i--) {
            const pop = this.pops[i];
            const age = Math.max(0, this.now() - pop.started),
                pose = borrowedGracePose(age);
            const to = pop.recipient();
            if (pose.finished || !to) {
                pop.enemy.destroy({ children: true });
                pop.monk.destroy({ children: true });
                this.pops.splice(i, 1);
                continue;
            }
            // Preserve the victim's last flag position if it dies or a snapshot rebuild removes it.
            pop.from = pop.source() ?? pop.from;
            pop.enemy.position.set(pop.from.x, pop.from.y + pop.cell * 0.07);
            pop.monk.position.set(to.x, to.y + pop.cell * 0.72);
            pop.enemy.visible = !pose.reveal;
            pop.monk.visible = pose.reveal;
            if (pose.frame >= 0) pop.hand.texture = this.frames![pose.frame];
            pop.icon.alpha = pose.iconAlpha;
            pop.icon.width = pop.icon.height = pop.cell * 0.65 * pose.iconScale;
            if (pose.reveal && !pop.revealed) {
                pop.revealed = true;
                pop.onReveal?.();
            }
            for (const root of [pop.enemy, pop.monk]) {
                const transform = root.parent?.getGlobalTransform();
                root.scale.set(
                    1,
                    transform
                        ? -Math.hypot(transform.a, transform.b) / Math.max(0.001, Math.hypot(transform.c, transform.d))
                        : -1,
                );
            }
        }
    }
    public clear(): void {
        this.generation++;
        for (const pop of this.pops) {
            pop.enemy.destroy({ children: true });
            pop.monk.destroy({ children: true });
        }
        this.pops.length = 0;
        for (const frame of this.frames ?? []) frame.destroy();
        this.frames = undefined;
        this.load = undefined;
        if (this.leased) {
            this.leased = false;
            leases--;
            queueMicrotask(() => {
                if (leases === 0) void Assets.unload(atlasUrl).catch(() => undefined);
            });
        }
    }
}
