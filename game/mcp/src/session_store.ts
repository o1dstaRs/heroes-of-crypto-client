import { HeadlessMatch } from "./headless_match";

export class HeadlessMatchStore {
    private activeMatch: HeadlessMatch | undefined;
    public createQuickstart(matchId?: string): HeadlessMatch {
        this.activeMatch = HeadlessMatch.createQuickstart({ matchId });
        return this.activeMatch;
    }
    public createApproachScenario(matchId?: string): HeadlessMatch {
        this.activeMatch = HeadlessMatch.createApproachScenario({ matchId });
        return this.activeMatch;
    }
    public createPriorityTargetScenario(matchId?: string): HeadlessMatch {
        this.activeMatch = HeadlessMatch.createPriorityTargetScenario({ matchId });
        return this.activeMatch;
    }
    public createSpellDuelScenario(matchId?: string): HeadlessMatch {
        this.activeMatch = HeadlessMatch.createSpellDuelScenario({ matchId });
        return this.activeMatch;
    }
    public createSummonScenario(matchId?: string): HeadlessMatch {
        this.activeMatch = HeadlessMatch.createSummonScenario({ matchId });
        return this.activeMatch;
    }
    public get(matchId: string): HeadlessMatch | undefined {
        return this.activeMatch?.getId() === matchId ? this.activeMatch : undefined;
    }
    public getOrThrow(matchId: string): HeadlessMatch {
        const match = this.get(matchId);
        if (!match) {
            throw new Error(`Unknown match ${matchId}. Create a match first.`);
        }
        return match;
    }
}
