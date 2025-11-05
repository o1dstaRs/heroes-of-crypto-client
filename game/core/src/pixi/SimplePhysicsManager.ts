export interface IPosition {
    x: number;
    y: number;
}

export interface IVelocity {
    x: number;
    y: number;
}

export interface IUnitPhysics {
    id: string;
    position: IPosition;
    velocity: IVelocity;
    size: number; // 1 for small, 2 for large
    mass: number;
    isStatic: boolean;
}

export class SimplePhysicsManager {
    private units: Map<string, IUnitPhysics> = new Map();
    private gravity: IPosition = { x: 0, y: 0 }; // No gravity for turn-based game
    private friction: number = 0.95;

    public constructor() {}

    public setGravity(x: number, y: number): void {
        this.gravity.x = x;
        this.gravity.y = y;
    }

    public addUnit(unit: IUnitPhysics): void {
        this.units.set(unit.id, unit);
    }

    public removeUnit(unitId: string): void {
        this.units.delete(unitId);
    }

    public getUnit(unitId: string): IUnitPhysics | undefined {
        return this.units.get(unitId);
    }

    public getAllUnits(): IUnitPhysics[] {
        return Array.from(this.units.values());
    }

    public setUnitPosition(unitId: string, x: number, y: number): void {
        const unit = this.units.get(unitId);
        if (unit) {
            unit.position.x = x;
            unit.position.y = y;
        }
    }

    public setUnitVelocity(unitId: string, x: number, y: number): void {
        const unit = this.units.get(unitId);
        if (unit) {
            unit.velocity.x = x;
            unit.velocity.y = y;
        }
    }

    public applyForce(unitId: string, fx: number, fy: number): void {
        const unit = this.units.get(unitId);
        if (unit && !unit.isStatic) {
            // F = ma, so a = F/m
            unit.velocity.x += fx / unit.mass;
            unit.velocity.y += fy / unit.mass;
        }
    }

    public update(deltaTime: number): void {
        // Update positions based on velocity
        for (const unit of this.units.values()) {
            if (unit.isStatic) continue;

            // Apply gravity
            unit.velocity.x += this.gravity.x * deltaTime;
            unit.velocity.y += this.gravity.y * deltaTime;

            // Apply friction
            unit.velocity.x *= this.friction;
            unit.velocity.y *= this.friction;

            // Update position
            unit.position.x += unit.velocity.x * deltaTime;
            unit.position.y += unit.velocity.y * deltaTime;

            // Simple boundary checking
            // This would be expanded based on game requirements
        }
    }

    public checkCollision(unitId1: string, unitId2: string): boolean {
        const unit1 = this.units.get(unitId1);
        const unit2 = this.units.get(unitId2);

        if (!unit1 || !unit2) return false;

        // Simple circle collision detection
        const dx = unit1.position.x - unit2.position.x;
        const dy = unit1.position.y - unit2.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Assuming size represents radius or half-size
        const minDistance = (unit1.size + unit2.size) / 2;

        return distance < minDistance;
    }

    public resolveCollisions(): void {
        // Simple collision resolution
        const unitArray = Array.from(this.units.values());

        for (let i = 0; i < unitArray.length; i++) {
            for (let j = i + 1; j < unitArray.length; j++) {
                const unit1 = unitArray[i];
                const unit2 = unitArray[j];

                if (unit1.isStatic && unit2.isStatic) continue;

                if (this.checkCollision(unit1.id, unit2.id)) {
                    // Simple elastic collision response
                    if (!unit1.isStatic) {
                        unit1.velocity.x *= -0.5;
                        unit1.velocity.y *= -0.5;
                    }

                    if (!unit2.isStatic) {
                        unit2.velocity.x *= -0.5;
                        unit2.velocity.y *= -0.5;
                    }
                }
            }
        }
    }

    public moveToPosition(unitId: string, targetX: number, targetY: number, speed: number = 1): void {
        const unit = this.units.get(unitId);
        if (!unit || unit.isStatic) return;

        const dx = targetX - unit.position.x;
        const dy = targetY - unit.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0.1) {
            // If not already at target
            const normalizedDx = dx / distance;
            const normalizedDy = dy / distance;

            unit.velocity.x = normalizedDx * speed;
            unit.velocity.y = normalizedDy * speed;
        } else {
            unit.velocity.x = 0;
            unit.velocity.y = 0;
            unit.position.x = targetX;
            unit.position.y = targetY;
        }
    }

    public stopUnit(unitId: string): void {
        const unit = this.units.get(unitId);
        if (unit) {
            unit.velocity.x = 0;
            unit.velocity.y = 0;
        }
    }
}
