type CrusadeObservation = Readonly<{
    x: number;
    y: number;
    attack: number;
    armor: number;
    eligible: boolean;
}>;

/** Observe resolved movement gains, including authoritative ranked snapshots. */
export class CrusadeTriggers {
    private readonly previous = new Map<string, CrusadeObservation>();
    public clear(): void {
        this.previous.clear();
    }
    public observe(id: string, current: CrusadeObservation): boolean {
        const previous = this.previous.get(id);
        this.previous.set(id, { ...current });
        // Initial hydration/reconnect and repeated refreshes must not replay old gains.
        return (
            !!previous &&
            previous.eligible &&
            current.eligible &&
            (previous.x !== current.x || previous.y !== current.y) &&
            (current.attack > previous.attack || current.armor > previous.armor)
        );
    }
}
