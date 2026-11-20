/** Starts a creature's idle loop; `alive` must stay true for as long as the loop may (still) begin. */
export type StartTurnIdleSound = (name: string, unitId: string, alive: () => boolean) => () => void;

/**
 * One idle loop for the creature whose turn is waiting for a decision. The scene calls `sync` every step with
 * the thinking creature (or nothing while a move, strike or replay presents, or between fights); a new
 * creature replaces the loop, and the same creature never restarts it.
 */
export class TurnIdleSound {
    private current?: { unitId: string; stop: () => void };
    public constructor(
        private readonly start: StartTurnIdleSound,
        private readonly sceneAlive: () => boolean,
    ) {}
    public sync(thinking?: { id: string; name: string }): void {
        if (this.current?.unitId === thinking?.id) return;
        this.clear();
        if (!thinking) return;
        // Register the turn before starting: the loop checks `alive` synchronously, and again once decoded.
        const entry = { unitId: thinking.id, stop: () => undefined as void };
        this.current = entry;
        entry.stop = this.start(thinking.name, thinking.id, () => this.sceneAlive() && this.current === entry);
    }
    public clear(): void {
        const current = this.current;
        this.current = undefined;
        current?.stop();
    }
    public get unitId(): string | undefined {
        return this.current?.unitId;
    }
}
