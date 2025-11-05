// pixi-animations.ts
import type { Container } from "pixi.js";
import { Graphics } from "pixi.js";
import type { HoCMath } from "@heroesofcrypto/common";

export const MOVE_ANIMATION_SPEED = 12;
export const FLY_ANIMATION_SPEED = MOVE_ANIMATION_SPEED;
export const BULLET_ANIMATION_SPEED = MOVE_ANIMATION_SPEED << 1;

// Minimal "has x/y" type that works for Container, Sprite, Graphics, etc.
type Positionable = { x: number; y: number };

export interface IAnimation {
    update(deltaTime: number): boolean; // true if complete
    destroy(): void;
}

export class MoveAnimation implements IAnimation {
    private target: Positionable;
    private path: HoCMath.XY[];
    private currentIndex = 0;
    private speed: number;
    private isComplete = false;

    public constructor(target: Positionable, path: HoCMath.XY[], speed: number = MOVE_ANIMATION_SPEED) {
        this.target = target;
        this.path = [...path];
        this.speed = speed;

        if (this.path.length > 0) {
            this.target.x = this.path[0].x;
            this.target.y = this.path[0].y;
            this.currentIndex = 1; // move toward second point
        }
    }

    public update(deltaTime: number): boolean {
        if (this.isComplete || this.currentIndex >= this.path.length) {
            this.isComplete = true;
            return true;
        }

        const targetPosition = this.path[this.currentIndex];
        const dx = targetPosition.x - this.target.x;
        const dy = targetPosition.y - this.target.y;
        const distance = Math.hypot(dx, dy);

        if (distance < 0.1) {
            this.currentIndex++;
            if (this.currentIndex >= this.path.length) this.isComplete = true;
            return this.isComplete;
        }

        const moveDistance = this.speed * deltaTime;
        if (moveDistance >= distance) {
            this.target.x = targetPosition.x;
            this.target.y = targetPosition.y;
        } else {
            const ratio = moveDistance / distance;
            this.target.x += dx * ratio;
            this.target.y += dy * ratio;
        }

        return false;
    }

    public destroy(): void {
        /* no-op */
    }
}

export class FlyAnimation implements IAnimation {
    private target: Positionable;
    private destination: HoCMath.XY;
    private speed: number;
    private isComplete = false;

    public constructor(target: Positionable, destination: HoCMath.XY, speed: number = FLY_ANIMATION_SPEED) {
        this.target = target;
        this.destination = { ...destination };
        this.speed = speed;
    }

    public update(deltaTime: number): boolean {
        if (this.isComplete) return true;

        const dx = this.destination.x - this.target.x;
        const dy = this.destination.y - this.target.y;
        const distance = Math.hypot(dx, dy);

        if (distance < 0.1) {
            this.target.x = this.destination.x;
            this.target.y = this.destination.y;
            this.isComplete = true;
            return true;
        }

        const moveDistance = this.speed * deltaTime;
        if (moveDistance >= distance) {
            this.target.x = this.destination.x;
            this.target.y = this.destination.y;
            this.isComplete = true;
        } else {
            const ratio = moveDistance / distance;
            this.target.x += dx * ratio;
            this.target.y += dy * ratio;
        }

        return false;
    }

    public destroy(): void {
        /* no-op */
    }
}

export class BulletAnimation implements IAnimation {
    private bullet: Graphics;
    private startPosition: HoCMath.XY;
    private endPosition: HoCMath.XY;
    private speed: number;
    private distance: number;
    private traveled = 0;
    private isComplete = false;
    private container: Container;

    public constructor(
        container: Container,
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        speed: number = BULLET_ANIMATION_SPEED,
    ) {
        this.container = container;
        this.startPosition = { x: startX, y: startY };
        this.endPosition = { x: endX, y: endY };
        this.speed = speed;

        const dx = endX - startX;
        const dy = endY - startY;
        this.distance = Math.hypot(dx, dy); // ✅ fix: dy*dy not dy*dx

        // v8 Graphics builder API
        this.bullet = new Graphics().circle(0, 0, 4).fill(0xffff00);
        this.bullet.x = startX;
        this.bullet.y = startY;

        this.container.addChild(this.bullet);
    }

    public update(deltaTime: number): boolean {
        if (this.isComplete) return true;

        const moveDistance = this.speed * deltaTime;
        this.traveled += moveDistance;

        if (this.traveled >= this.distance) {
            this.bullet.x = this.endPosition.x;
            this.bullet.y = this.endPosition.y;
            this.isComplete = true;
            return true;
        }

        const ratio = this.traveled / this.distance;
        const dx = this.endPosition.x - this.startPosition.x;
        const dy = this.endPosition.y - this.startPosition.y;

        this.bullet.x = this.startPosition.x + dx * ratio;
        this.bullet.y = this.startPosition.y + dy * ratio;

        return false;
    }

    public destroy(): void {
        this.container.removeChild(this.bullet);
        this.bullet.destroy();
    }
}

export class PixiAnimationManager {
    private animations: IAnimation[] = [];

    // No container in the ctor anymore
    public constructor() {}

    public addAnimation(animation: IAnimation): void {
        this.animations.push(animation);
    }

    public removeAnimation(animation: IAnimation): void {
        const index = this.animations.indexOf(animation);
        if (index !== -1) {
            this.animations.splice(index, 1);
            animation.destroy();
        }
    }

    public update(deltaTime: number): void {
        for (let i = this.animations.length - 1; i >= 0; i--) {
            const animation = this.animations[i];
            if (animation.update(deltaTime)) {
                this.animations.splice(i, 1);
                animation.destroy();
            }
        }
    }

    public hasAnimations(): boolean {
        return this.animations.length > 0;
    }

    public clear(): void {
        for (const animation of this.animations) animation.destroy();
        this.animations = [];
    }

    public destroy(): void {
        this.clear();
    }
}
