import type { GameEvent } from "@heroesofcrypto/common";
import type { AuthoritativeGameSnapshot } from "../game_action_transport";

/** Sidebar chronology only: retain names and counters, never units, events or board snapshots. */
export class StatusApplicationOrder {
    private readonly units = new Map<string, Map<string, number>>();
    private nextOrder = 0;
    private gameId?: string;
    private journalSequence = -1;
    public record(events: readonly GameEvent[]): boolean {
        let changed = false;
        for (const event of events) {
            if (!event || event.type !== "effects_applied" || !Array.isArray(event.applications)) continue;
            for (const application of event.applications) {
                if (
                    !application ||
                    application.resisted ||
                    typeof application.unitId !== "string" ||
                    typeof application.name !== "string"
                )
                    continue;
                let statuses = this.units.get(application.unitId);
                if (!statuses) this.units.set(application.unitId, (statuses = new Map()));
                statuses.set(this.key(application.name, application.kind === "buff"), ++this.nextOrder);
                changed = true;
            }
        }
        return changed;
    }
    public recordSnapshot(snapshot: AuthoritativeGameSnapshot): boolean {
        let changed = false;
        if (this.gameId !== snapshot.gameId) {
            changed = this.gameId !== undefined;
            this.clear();
            this.gameId = snapshot.gameId;
        }
        const entries = (snapshot.journalTail ?? [])
            .filter((entry) => entry.sequence > this.journalSequence && entry.sequence <= snapshot.latestSequence)
            .sort((a, b) => a.sequence - b.sequence);
        for (const entry of entries) {
            if (entry.sequence <= this.journalSequence) continue;
            this.journalSequence = entry.sequence;
            try {
                const events: unknown = JSON.parse(entry.eventsJson);
                if (Array.isArray(events)) changed = this.record(events) || changed;
            } catch {
                // A legacy or malformed log must not prevent the board's status list from rendering.
            }
        }
        return changed;
    }
    public get(unitId: string, name: string, isBuff: boolean): number | undefined {
        return this.units.get(unitId)?.get(this.key(name, isBuff));
    }
    public clear(): void {
        this.units.clear();
        this.nextOrder = 0;
        this.gameId = undefined;
        this.journalSequence = -1;
    }
    private key(name: string, isBuff: boolean): string {
        return `${isBuff ? "buff" : "debuff"}:${name}`;
    }
}
