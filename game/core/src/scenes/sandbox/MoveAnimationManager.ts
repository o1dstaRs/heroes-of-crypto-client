import { RenderableUnit } from "../RenderableUnit";
import { GridSettings, HoCMath, TeamType, GridMath } from "@heroesofcrypto/common";
import { HoverManager } from "../HoverManager";
import { Container } from "pixi.js";

export interface IMoveAnimationContext {
    getGridSettings(): GridSettings;
    updateSceneLog(msg: string): void;
    finishTurn(): void;
    setMoveBlocked(blocked: boolean): void;
    getHoverManager(): HoverManager;
    getWorldRoot(): Container;
    requestVisibleStateUpdate(): void;
}

interface IMoveAnimationState {
    unit: RenderableUnit;
    worldPath: HoCMath.XY[];
    currentSegment: number;
    t: number;
    speed: number;
    destCell: HoCMath.XY;
    lastTrackWorld: HoCMath.XY;
    onComplete?: () => void;
}

interface ILingeringTrack {
    x: number;
    y: number;
    radius: number;
    life: number;
    maxLife: number;
    phase: number;
    team: TeamType;
    flying: boolean;
    dirX: number;
    dirY: number;
    cellSize: number;
}

interface ISwapAnimSegment {
    unit: RenderableUnit;
    from: HoCMath.XY;
    to: HoCMath.XY;
    ctrl: HoCMath.XY;
}

interface ISwapAnimState {
    a: ISwapAnimSegment;
    b: ISwapAnimSegment;
    elapsed: number;
    duration: number;
    onComplete?: () => void;
}

export class MoveAnimationManager {
    private context: IMoveAnimationContext;
    // State
    private moveAnimation?: IMoveAnimationState;
    private swapAnimation?: ISwapAnimState;
    private moveTrackPath?: HoCMath.XY[];
    private moveTrackProgress = 0;
    private lingeringTracks: ILingeringTrack[] = [];
    private lastTrackDropIndex: number = -1;
    private isActiveUnitMoving = false;
    public constructor(context: IMoveAnimationContext) {
        this.context = context;
    }
    public getLingeringTracks(): ILingeringTrack[] {
        return this.lingeringTracks;
    }
    public isMoving(): boolean {
        return !!this.moveAnimation || !!this.swapAnimation;
    }
    /**
     * Force any in-flight move/swap animation to its end state immediately, firing its onComplete so
     * an awaiting caller (e.g. a replay) can't hang if the per-frame update somehow stops driving it.
     * A safety valve against a stuck animation freezing the whole scene (no AI re-trigger, snapshots
     * ignored). No-op when nothing is animating.
     */
    public forceFinish(): void {
        if (this.moveAnimation) {
            this.finishMoveAnimation();
        }
        if (this.swapAnimation) {
            const s = this.swapAnimation;
            s.a.unit.setPosition(s.a.to.x, s.a.to.y);
            s.b.unit.setPosition(s.b.to.x, s.b.to.y);
            const onComplete = s.onComplete;
            this.swapAnimation = undefined;
            this.isActiveUnitMoving = false;
            this.context.setMoveBlocked(false);
            this.context.requestVisibleStateUpdate();
            if (onComplete) onComplete();
        }
    }
    public getMovingUnit(): RenderableUnit | undefined {
        return this.moveAnimation?.unit;
    }
    public startMoveAnimation(
        unit: RenderableUnit,
        worldPath: HoCMath.XY[],
        speed: number,
        destCell: HoCMath.XY,
        moveTrackPath?: HoCMath.XY[],
        onComplete?: () => void,
    ) {
        this.isActiveUnitMoving = true;
        this.moveTrackPath = moveTrackPath;
        this.moveTrackProgress = 0;
        this.context.setMoveBlocked(true);

        // Initial track anchor
        const start = worldPath[0];
        this.moveAnimation = {
            unit,
            worldPath,
            currentSegment: 0,
            t: 0,
            // Flying units glide 20% faster than ground units.
            speed: unit.canFly() ? speed * 1.2 : speed,
            destCell,
            lastTrackWorld: { x: start.x, y: start.y },
            onComplete,
        };
    }
    public startSwapAnimation(
        unitA: RenderableUnit,
        fromA: HoCMath.XY,
        toA: HoCMath.XY,
        unitB: RenderableUnit,
        fromB: HoCMath.XY,
        toB: HoCMath.XY,
        onComplete?: () => void,
    ) {
        // Castling-style position swap: glide both units to each other's old cell along mirrored
        // arcs (quadratic Bézier whose control point bows perpendicular to the path) so they curve
        // around each other instead of clipping through the midpoint.
        this.isActiveUnitMoving = true;
        this.context.setMoveBlocked(true);
        // Snapshot every coordinate: Unit.getPosition() returns a live reference to its internal
        // position, and we call setPosition() during the animation — without copies, `to` would
        // mutate each frame and both units would collapse toward the middle.
        const snap = (p: HoCMath.XY): HoCMath.XY => ({ x: p.x, y: p.y });
        const fA = snap(fromA);
        const tA = snap(toA);
        const fB = snap(fromB);
        const tB = snap(toB);
        const arcCtrl = (from: HoCMath.XY, to: HoCMath.XY, side: number): HoCMath.XY => {
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.hypot(dx, dy) || 1;
            const px = -dy / len; // perpendicular (90° rotation)
            const py = dx / len;
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            const bow = len * 0.3;
            return { x: mx + px * bow * side, y: my + py * bow * side };
        };
        this.swapAnimation = {
            a: { unit: unitA, from: fA, to: tA, ctrl: arcCtrl(fA, tA, 1) },
            b: { unit: unitB, from: fB, to: tB, ctrl: arcCtrl(fB, tB, -1) },
            elapsed: 0,
            duration: 0.45,
            onComplete,
        };
    }
    public update(dt: number) {
        this.stepMoveAnimation(dt);
        this.stepSwapAnimation(dt);
        this.updateLingeringTracks(dt);
    }
    private stepSwapAnimation(dt: number): void {
        const s = this.swapAnimation;
        if (!s) return;
        s.elapsed += dt;
        const raw = Math.min(1, s.elapsed / s.duration);
        // ease-in-out for a smooth glide.
        const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
        const place = (seg: ISwapAnimSegment) => {
            const it = 1 - t;
            const x = it * it * seg.from.x + 2 * it * t * seg.ctrl.x + t * t * seg.to.x;
            const y = it * it * seg.from.y + 2 * it * t * seg.ctrl.y + t * t * seg.to.y;
            seg.unit.setPosition(x, y);
        };
        place(s.a);
        place(s.b);
        if (raw >= 1) {
            s.a.unit.setPosition(s.a.to.x, s.a.to.y);
            s.b.unit.setPosition(s.b.to.x, s.b.to.y);
            const onComplete = s.onComplete;
            this.swapAnimation = undefined;
            this.isActiveUnitMoving = false;
            this.context.setMoveBlocked(false);
            this.context.requestVisibleStateUpdate();
            if (onComplete) onComplete();
        }
    }
    private stepMoveAnimation(dt: number): void {
        const anim = this.moveAnimation;
        if (!anim) return;

        const gs = this.context.getGridSettings();
        const cellSize = gs.getCellSize();
        const { unit, worldPath, speed } = anim;
        const isLargeUnit = !unit.isSmallSize();

        if (!worldPath || worldPath.length < 2 || speed <= 0) {
            const end = worldPath[worldPath.length - 1] ?? unit.getPosition();
            unit.setPosition(end.x, end.y);
            this.finishMoveAnimation();
            return;
        }

        let remaining = speed * dt;

        while (remaining > 0 && this.moveAnimation) {
            const a = this.moveAnimation!;
            const segIndex = a.currentSegment;

            if (segIndex >= a.worldPath.length - 1) {
                const end = a.worldPath[a.worldPath.length - 1];
                unit.setPosition(end.x, end.y);
                this.moveTrackProgress = this.moveTrackPath ? this.moveTrackPath.length : a.worldPath.length - 1;
                this.finishMoveAnimation();
                return;
            }

            const p0 = a.worldPath[segIndex];
            const p1 = a.worldPath[segIndex + 1];
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const segLen = Math.sqrt(dx * dx + dy * dy) || 1e-6;
            const segRemaining = (1 - a.t) * segLen;

            let newPos: HoCMath.XY;

            if (remaining >= segRemaining) {
                a.t = 1;
                newPos = { x: p1.x, y: p1.y };
                unit.setPosition(newPos.x, newPos.y);
                a.currentSegment += 1;
                a.t = 0;
                remaining -= segRemaining;
            } else {
                const deltaT = remaining / segLen;
                a.t += deltaT;
                const nx = p0.x + dx * a.t;
                const ny = p0.y + dy * a.t;
                newPos = { x: nx, y: ny };
                unit.setPosition(newPos.x, newPos.y);
                remaining = 0;
            }

            if (isLargeUnit) {
                // Space the large-unit puffs further apart so they read as one cohesive trailing
                // cloud rather than a dense stream of many small particles.
                const spacing = cellSize * 1.5;
                let lx = a.lastTrackWorld.x;
                let ly = a.lastTrackWorld.y;
                let vx = newPos.x - lx;
                let vy = newPos.y - ly;
                let dist = Math.sqrt(vx * vx + vy * vy);

                while (dist >= spacing && dist > 1e-6) {
                    const stepT = spacing / dist;
                    lx += vx * stepT;
                    ly += vy * stepT;
                    this.dropLargeUnitTrackAtPosition(unit, { x: lx, y: ly }, gs, dx / segLen, dy / segLen);
                    vx = newPos.x - lx;
                    vy = newPos.y - ly;
                    dist = Math.sqrt(vx * vx + vy * vy);
                }
                a.lastTrackWorld = { x: lx, y: ly };
            }

            this.moveTrackProgress = a.currentSegment + a.t;

            if (!isLargeUnit && this.moveTrackPath && this.moveTrackPath.length > 0) {
                const idx = Math.floor(this.moveTrackProgress);
                // Skip the final cell (the destination) — dust only trails behind, not where it lands.
                if (idx >= 0 && idx < this.moveTrackPath.length - 1 && idx !== this.lastTrackDropIndex) {
                    const cell = this.moveTrackPath[idx];
                    const pos = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
                    if (pos) {
                        this.lingeringTracks.push({
                            x: pos.x,
                            y: pos.y,
                            radius: cellSize * 0.42,
                            life: 0.25,
                            maxLife: 0.25,
                            phase: Math.random() * Math.PI * 2,
                            team: unit.getTeam(),
                            flying: unit.canFly(),
                            dirX: dx / segLen,
                            dirY: dy / segLen,
                            cellSize,
                        });
                        this.lastTrackDropIndex = idx;
                    }
                }
            }
        }
    }
    private finishMoveAnimation(): void {
        const anim = this.moveAnimation;
        if (!anim) return;
        const { unit, worldPath, destCell, onComplete } = anim;
        const end = worldPath[worldPath.length - 1] ?? unit.getPosition();

        unit.setPosition(end.x, end.y);

        // No dust at the destination — the trail leads up to it and fades behind the unit. (Large
        // units still drop their trail along the way via dropLargeUnitTrackAtPosition in stepMove.)

        this.context.updateSceneLog(`${unit.getName()} moved to(${destCell.x}, ${destCell.y})`);

        this.moveAnimation = undefined;
        this.moveTrackPath = undefined;
        this.moveTrackProgress = 0;
        this.context.setMoveBlocked(false);
        this.isActiveUnitMoving = false;

        this.context.getHoverManager().setSilhouetteLocked(false);
        this.context.getHoverManager().clearHoverSilhouette(true);
        this.context.requestVisibleStateUpdate();

        unit.syncVisual(this.context.getWorldRoot(), this.context.getGridSettings());
        unit.setSpriteRotation(0);

        if (onComplete) {
            onComplete();
        } else {
            this.context.finishTurn();
        }
    }
    private updateLingeringTracks(dt: number): void {
        if (!this.lingeringTracks.length) return;
        this.lingeringTracks = this.lingeringTracks.filter((t) => {
            t.life -= dt;
            // NOTE: do NOT advance `phase` here — the drawer uses it as a *stable* per-track seed for
            // the dust puff's randomness; mutating it per frame makes the puff flicker.
            return t.life > 0;
        });
    }
    private dropLargeUnitTrackAtPosition(
        unit: RenderableUnit,
        worldPos: HoCMath.XY,
        gs: GridSettings,
        dirX = 0,
        dirY = 0,
    ): void {
        const cellSize = gs.getCellSize();
        // `worldPos` is already the large unit's visual (footprint) center, so drop one cohesive
        // puff right there — no grid round-trip, which only snapped the puff onto cell corners.
        //
        // The wind trail's twin contrails are drawn ±radius to each side of travel (see WindLayer).
        // A small unit uses ~0.42*cell, so its contrails sit tight off the wingtips and read as one
        // body. Scaling that proportionally to the 2x2 unit (~2x) keeps the same look; the previous
        // 1.05*cell pushed the contrails out to the footprint edges, so they appeared to stream from
        // each corner of the unit.
        this.lingeringTracks.push({
            x: worldPos.x,
            y: worldPos.y,
            radius: cellSize * 0.84,
            life: 0.25,
            maxLife: 0.25,
            phase: Math.random() * Math.PI * 2,
            team: unit.getTeam(),
            flying: unit.canFly(),
            dirX,
            dirY,
            cellSize,
        });
    }
}
