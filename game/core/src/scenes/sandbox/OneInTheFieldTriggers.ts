/** Incoming attack actions, counted separately for each defender during a battle round. */
export class OneInTheFieldTriggers {
    private lap?: number;
    private readonly attacks = new Map<string, number>();
    public clear(): void {
        this.lap = undefined;
        this.attacks.clear();
    }
    /** Call once per resolved action, not once per hit of a double attack or retaliation. */
    public recordAttack(unitId: string, lap: number): boolean {
        if (this.lap !== lap) {
            this.attacks.clear();
            this.lap = lap;
        }
        const count = (this.attacks.get(unitId) ?? 0) + 1;
        this.attacks.set(unitId, count);
        return count >= 2;
    }
}
