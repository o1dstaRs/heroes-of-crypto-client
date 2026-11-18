import type { FlagOverlayAttach } from "./FlagOverlayLayout";
import { overheadEffectElapsedMs } from "../../settings/statusEffectTiming";
import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";

type Anchor = Readonly<{ x: number; y: number }>;
const atlasUrl = images.vfx_predatory_assimilation_grab_atlas;
const GRIP_MS = 420;
const ARRIVAL_MS = 980;
const RELEASE_MS = 1200;
const LIFE_MS = 2200;
let leases = 0;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
    const t = clamp(v);
    return t * t * (3 - 2 * t);
};

/** Claw closes before travelling; the acquired card appears only after the claw releases it. */
export function assimilationPose(age: number) {
    return {
        travel: smooth((age - GRIP_MS) / (ARRIVAL_MS - GRIP_MS)),
        frame:
            age < 140
                ? 0
                : age < 260
                  ? 1
                  : age < 340
                    ? 2
                    : age < GRIP_MS
                      ? 3
                      : age < 700
                        ? 4
                        : age < ARRIVAL_MS
                          ? 5
                          : age < 1090
                            ? 6
                            : 7,
        clawAlpha: smooth(age / 120) * (1 - smooth((age - 1090) / 110)),
        capturedAlpha: smooth((age - 260) / 120) * (1 - smooth((age - ARRIVAL_MS) / 100)),
        acquiredAlpha: smooth((age - RELEASE_MS) / 130) * smooth((LIFE_MS - age) / 250),
        finished: age >= LIFE_MS,
    };
}

/** Painted claw cels carry the actual stolen card, then reveal it above the recipient's live flag. */
export class PredatoryAssimilationPops {
    private frames?: Texture[];
    private load?: Promise<Texture[] | undefined>;
    private generation = 0;
    private leased = false;
    private pops: {
        root: Container;
        claw: Sprite;
        captured: Sprite;
        acquired: Sprite;
        from: Anchor;
        to: Anchor;
        cell: number;
        started: number;
        follow: () => Anchor | undefined;
        arrival?: () => void;
        arrived: boolean;
    }[] = [];
    public constructor(
        private readonly attach: FlagOverlayAttach,
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
                const meta = animationAtlases["Vfx Predatory Assimilation"].grab;
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
        to: Anchor,
        cell: number,
        icon: Texture,
        follow: () => Anchor | undefined,
        arrival?: () => void,
        stackIndex = 0,
    ): Promise<void> {
        const generation = this.generation;
        const frames = await this.loadFrames();
        if (!frames || generation !== this.generation || !follow()) return;
        const root = new Container();
        const claw = new Sprite(frames[0]);
        const captured = new Sprite(icon);
        const acquired = new Sprite(icon);
        for (const sprite of [claw, captured, acquired]) sprite.anchor.set(0.5);
        claw.width = claw.height = cell * 1.5;
        captured.width = captured.height = cell * 0.26;
        acquired.width = acquired.height = cell * 0.78;
        root.addChild(captured, claw, acquired);
        root.scale.set(1, -1);
        const started = this.now();
        this.attach(root, 5520, () => {
            const pose = assimilationPose(overheadEffectElapsedMs(this.now() - started, LIFE_MS));
            if (pose.travel > 0 && pose.travel < 1) return undefined;
            return pose.travel >= 1 ? (follow() ?? to) : from;
        });
        // Offset is fixed in world units; following resolves replacement units after ranked hydration.
        const offset = cell * (0.85 + stackIndex * 0.9);
        this.pops.push({
            root,
            claw,
            captured,
            acquired,
            from: { x: from.x, y: from.y + offset },
            to: { x: to.x, y: to.y + offset },
            cell,
            started,
            follow: () => {
                const p = follow();
                return p ? { x: p.x, y: p.y + offset } : undefined;
            },
            arrival,
            arrived: false,
        });
        this.update(0);
    }
    public update(_dt: number): void {
        for (let i = this.pops.length - 1; i >= 0; i--) {
            const pop = this.pops[i];
            const age = overheadEffectElapsedMs(this.now() - pop.started, LIFE_MS),
                pose = assimilationPose(age);
            const current = pop.follow();
            if (pose.finished) {
                pop.root.destroy({ children: true });
                this.pops.splice(i, 1);
                continue;
            }
            // Keep the last flag position through a transient board rebuild or lethal response.
            if (current) pop.to = current;
            if (age >= RELEASE_MS && !pop.arrived) {
                pop.arrived = true;
                if (current) pop.arrival?.();
            }
            const p = pose.travel;
            pop.root.position.set(
                pop.from.x + (pop.to.x - pop.from.x) * p,
                pop.from.y + (pop.to.y - pop.from.y) * p + Math.sin(p * Math.PI) * pop.cell * 0.35,
            );
            const transform = pop.root.parent?.getGlobalTransform();
            if (transform)
                pop.root.scale.set(
                    1,
                    -Math.hypot(transform.a, transform.b) / Math.max(0.001, Math.hypot(transform.c, transform.d)),
                );
            pop.claw.texture = this.frames![pose.frame];
            pop.claw.alpha = pose.clawAlpha;
            pop.captured.alpha = pose.capturedAlpha;
            pop.acquired.alpha = pose.acquiredAlpha;
            const size = pop.cell * 0.78 * (0.85 + 0.15 * smooth((age - RELEASE_MS) / 160));
            pop.acquired.width = pop.acquired.height = size;
        }
    }
    public clear(): void {
        this.generation++;
        for (const pop of this.pops) pop.root.destroy({ children: true });
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
