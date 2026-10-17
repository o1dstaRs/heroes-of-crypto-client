import type { GameEvent } from "@heroesofcrypto/common";

type Explosion = Extract<GameEvent, { type: "pyre_exploded" }>;
type Death<T> = {
    event: Explosion;
    units: Set<T>;
    children: string[];
    started: boolean;
    exploded: boolean;
};

/** The killing impact owns each root blast; its casualties follow on the same animation clock. */
export class LastFuseDeaths<T> {
    private readonly deaths = new Map<string, Death<T>>();
    public constructor(
        private readonly render: (event: Explosion, delay: number, removeBody: () => void) => void,
        private readonly retain: (unit: T) => void,
        private readonly remove: (unit: T) => void,
    ) {}
    public prepare(events: readonly GameEvent[], units: ReadonlyMap<string, T>): void {
        const blasts = events.filter((event): event is Explosion => event.type === "pyre_exploded");
        for (const event of blasts) {
            if (this.deaths.has(event.unitId)) continue;
            const unit = units.get(event.unitId);
            this.deaths.set(event.unitId, {
                event,
                units: new Set(unit ? [unit] : []),
                children: [],
                started: false,
                exploded: false,
            });
        }
        for (let index = 1; index < blasts.length; index++) {
            const child = blasts[index];
            // An already-dead direct victim cannot be hit by a blast. The last earlier blast that
            // removed creatures from this stack is therefore the one that finished a chain victim.
            const parent = blasts
                .slice(0, index)
                .reverse()
                .find((blast) => blast.hits.some((hit) => hit.unitId === child.unitId && hit.unitsDied > 0));
            const children = parent && this.deaths.get(parent.unitId)?.children;
            if (children && !children.includes(child.unitId)) children.push(child.unitId);
        }
    }
    public has(unitId: string): boolean {
        return this.deaths.has(unitId);
    }
    public play(unitId: string, unit?: T, delay = 0): boolean {
        const death = this.deaths.get(unitId);
        if (!death) return false;
        if (unit && !death.units.has(unit)) {
            death.units.add(unit);
            if (death.exploded) this.remove(unit);
            else if (death.started) this.retain(unit);
        }
        if (death.started) return true;
        death.started = true;
        for (const body of death.units) this.retain(body);
        this.render(death.event, delay, () => {
            if (this.deaths.get(unitId) !== death || death.exploded) return;
            death.exploded = true;
            for (const body of death.units) this.remove(body);
        });
        for (const child of death.children) this.play(child, undefined, delay + 0.18);
        return true;
    }
    public forget(unitId: string): void {
        const death = this.deaths.get(unitId);
        if (death?.started && !death.exploded) {
            for (const body of death.units) this.remove(body);
        }
        this.deaths.delete(unitId);
    }
}
