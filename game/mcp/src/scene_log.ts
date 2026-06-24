import type { IDamageStatistic, ISceneLog, IStatisticHolder } from "@heroesofcrypto/common";

export class BufferedSceneLog implements ISceneLog {
    private entries: string[] = [];
    private updated = false;
    public getLog(): string {
        return this.entries.join("\n");
    }
    public updateLog(newLog = ""): void {
        if (newLog) {
            this.entries.push(newLog);
        }
        this.updated = true;
    }
    public hasBeenUpdated(): boolean {
        return this.updated;
    }
    public drain(): string[] {
        const entries = this.entries;
        this.entries = [];
        this.updated = false;
        return entries;
    }
}

export class DamageStatisticStore implements IStatisticHolder<IDamageStatistic> {
    private readonly values: IDamageStatistic[] = [];
    public add(singleDamageStatistic: IDamageStatistic): void {
        this.values.push(singleDamageStatistic);
    }
    public get(): IDamageStatistic[] {
        return this.values;
    }
    public has(lap: number): boolean {
        return this.values.some((value) => value.lap === lap);
    }
    public clear(): void {
        this.values.length = 0;
    }
}
