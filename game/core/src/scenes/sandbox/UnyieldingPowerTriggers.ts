/** Presentation-only lap guards; extra actions and ranked snapshot echoes are not new laps. */
export class UnyieldingPowerTriggers {
    private readonly passiveLaps = new Map<string, number>();
    private readonly turnLaps = new Map<string, number>();
    public prime(unitIds: Iterable<string>): void {
        this.passiveLaps.clear();
        this.turnLaps.clear();
        for (const id of unitIds) this.passiveLaps.set(id, 0);
    }
    /** A first mid-fight observation seeds silently, rather than replaying old passive gains on reconnect. */
    public observePassive(unitId: string, lap: number, eligible: boolean): boolean {
        const previous = this.passiveLaps.get(unitId);
        if (previous !== undefined && lap <= previous) return false;
        this.passiveLaps.set(unitId, lap);
        return previous !== undefined && eligible;
    }
    public firstTurn(unitId: string, lap: number, eligible: boolean): boolean {
        if (lap <= (this.turnLaps.get(unitId) ?? 0)) return false;
        this.turnLaps.set(unitId, lap);
        return eligible;
    }
}
