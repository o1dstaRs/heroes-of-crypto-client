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
}

export class MoveAnimationManager {
    private context: IMoveAnimationContext;
    // State
    private moveAnimation?: IMoveAnimationState;
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
        return !!this.moveAnimation;
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
            speed,
            destCell,
            lastTrackWorld: { x: start.x, y: start.y },
            onComplete,
        };
    }
    public update(dt: number) {
        this.stepMoveAnimation(dt);
        this.updateLingeringTracks(dt);
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
                const spacing = cellSize * 0.9;
                let lx = a.lastTrackWorld.x;
                let ly = a.lastTrackWorld.y;
                let vx = newPos.x - lx;
                let vy = newPos.y - ly;
                let dist = Math.sqrt(vx * vx + vy * vy);

                while (dist >= spacing && dist > 1e-6) {
                    const stepT = spacing / dist;
                    lx += vx * stepT;
                    ly += vy * stepT;
                    this.dropLargeUnitTrackAtPosition(unit, { x: lx, y: ly }, gs);
                    vx = newPos.x - lx;
                    vy = newPos.y - ly;
                    dist = Math.sqrt(vx * vx + vy * vy);
                }
                a.lastTrackWorld = { x: lx, y: ly };
            }

            this.moveTrackProgress = a.currentSegment + a.t;

            if (!isLargeUnit && this.moveTrackPath && this.moveTrackPath.length > 0) {
                const idx = Math.floor(this.moveTrackProgress);
                if (idx >= 0 && idx < this.moveTrackPath.length && idx !== this.lastTrackDropIndex) {
                    const cell = this.moveTrackPath[idx];
                    const pos = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
                    if (pos) {
                        this.lingeringTracks.push({
                            x: pos.x,
                            y: pos.y,
                            radius: cellSize * 0.5,
                            life: 0.25,
                            maxLife: 0.25,
                            phase: Math.random() * Math.PI * 2,
                            team: unit.getTeam(),
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

        if (!unit.isSmallSize()) {
            const gs = this.context.getGridSettings();
            this.dropLargeUnitTrackAtPosition(unit, end, gs);
        }

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
            t.phase += dt * 2;
            return t.life > 0;
        });
    }
    private dropLargeUnitTrackAtPosition(unit: RenderableUnit, worldPos: HoCMath.XY, gs: GridSettings): void {
        const cellSize = gs.getCellSize();
        const halfSize = cellSize * 0.5;
        const adjustedPos = { x: worldPos.x - halfSize, y: worldPos.y - halfSize };

        const anchorCell = GridMath.getCellForPosition(gs, adjustedPos);
        if (!anchorCell) return;

        const footprintCells: HoCMath.XY[] = [
            { x: anchorCell.x, y: anchorCell.y },
            { x: anchorCell.x + 1, y: anchorCell.y },
            { x: anchorCell.x, y: anchorCell.y + 1 },
            { x: anchorCell.x + 1, y: anchorCell.y + 1 },
        ];

        for (const c of footprintCells) {
            const pos = GridMath.getPositionForCell(c, gs.getMinX(), gs.getStep(), gs.getHalfStep());
            if (!pos) continue;
            this.lingeringTracks.push({
                x: pos.x,
                y: pos.y,
                radius: cellSize * 0.5,
                life: 0.25,
                maxLife: 0.25,
                phase: Math.random() * Math.PI * 2,
                team: unit.getTeam(),
            });
        }
    }
}
