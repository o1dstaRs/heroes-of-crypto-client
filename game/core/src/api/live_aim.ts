import {
    PlayAimKind,
    PlayPhase,
    type OpponentAim,
    type PlayAim,
    type PlayEvent,
    type PlaySnapshot,
} from "./play_protocol";

export const AIM_INTERVAL_MS = 200;
export const AIM_SETTLE_MS = 75;
export const AIM_REFRESH_MS = 1000;

export interface AimContext {
    sequence: number;
    unitId: string;
    playerId: string;
}

interface AimClock {
    now(): number;
    setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
    clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

const clock: AimClock = {
    now: () => performance.now(),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timer) => clearTimeout(timer),
};

/** One request in flight, one replaceable aim. Clears share the same budget as every other aim. */
export class LiveAimSender {
    private aim?: PlayAim;
    private changedAt = 0;
    private lastSentAt = -Infinity;
    private lastKey = "";
    private inFlight = false;
    private disposed = false;
    private timer?: ReturnType<typeof setTimeout>;
    public constructor(
        private readonly context: () => AimContext | undefined,
        private readonly send: (aim: PlayAim, context: AimContext) => Promise<unknown>,
        private readonly time: AimClock = clock,
    ) {}
    public update(aim?: PlayAim): void {
        if (this.disposed) return;
        if (JSON.stringify(aim) === JSON.stringify(this.aim)) return;
        this.aim = aim ? structuredClone(aim) : undefined;
        this.changedAt = this.time.now();
        this.schedule();
    }
    public reset(): void {
        this.aim = undefined;
        this.lastKey = "";
        if (this.timer !== undefined) this.time.clearTimeout(this.timer);
        this.timer = undefined;
    }
    public dispose(): void {
        this.disposed = true;
        this.reset();
    }
    private schedule(): void {
        if (this.disposed || this.inFlight) return;
        if (this.timer !== undefined) this.time.clearTimeout(this.timer);
        const context = this.context();
        if (!context || (this.aim && this.aim.unitId !== context.unitId)) {
            this.reset();
            return;
        }
        const aim = this.aim ?? { kind: PlayAimKind.CLEAR, unitId: context.unitId };
        const key = JSON.stringify([context.sequence, aim]);
        if (!this.lastKey && aim.kind === PlayAimKind.CLEAR) return;
        if (key === this.lastKey && aim.kind === PlayAimKind.CLEAR) return;
        const due = Math.max(
            this.lastSentAt + AIM_INTERVAL_MS,
            key === this.lastKey ? this.lastSentAt + AIM_REFRESH_MS : this.changedAt + AIM_SETTLE_MS,
        );
        this.timer = this.time.setTimeout(() => void this.flush(), Math.max(0, due - this.time.now()));
    }
    private async flush(): Promise<void> {
        this.timer = undefined;
        const context = this.context();
        if (this.disposed || !context || (this.aim && this.aim.unitId !== context.unitId)) {
            this.reset();
            return;
        }
        const aim = this.aim ?? { kind: PlayAimKind.CLEAR, unitId: context.unitId };
        this.lastKey = JSON.stringify([context.sequence, aim]);
        this.lastSentAt = this.time.now();
        this.inFlight = true;
        try {
            await this.send(aim, context);
        } catch {
            // A hint has no retry queue. A held aim gets a fresh lease on the next refresh.
        } finally {
            this.inFlight = false;
            this.schedule();
        }
    }
}

export class OpponentAimReceiver {
    private sequence = -1;
    private order = 0;
    public reset(): void {
        this.sequence = -1;
        this.order = 0;
    }
    public read(event: PlayEvent, snapshot: PlaySnapshot | undefined, now: number, ageMs = 0): OpponentAim | undefined {
        const intent = event.intent;
        if (
            !intent?.aimKind ||
            !snapshot ||
            snapshot.phase !== PlayPhase.PLAY ||
            snapshot.fightFinished ||
            event.sequence !== snapshot.latestSequence ||
            intent.unitId !== snapshot.currentUnitId ||
            !Object.values(PlayAimKind).some((kind) => kind === intent.aimKind) ||
            !Number.isSafeInteger(intent.intentSequence) ||
            (intent.intentSequence ?? 0) <= 0
        )
            return undefined;
        if (this.sequence !== event.sequence) {
            this.sequence = event.sequence;
            this.order = 0;
        }
        if (intent.intentSequence! <= this.order) return undefined;
        this.order = intent.intentSequence!;
        const remaining = Math.min(1800, intent.leaseMs ?? 0) - Math.max(0, ageMs);
        if (remaining <= 0) return undefined;
        return {
            kind: intent.aimKind as PlayAim["kind"],
            unitId: intent.unitId,
            cell: intent.aimCell,
            targetUnitId: intent.targetUnitId || undefined,
            attackFrom: intent.attackFrom,
            targetSide: intent.targetSide || undefined,
            targetOrientation: intent.targetOrientation || undefined,
            spellName: intent.spellName || undefined,
            expiresAt: now + remaining,
        };
    }
}
