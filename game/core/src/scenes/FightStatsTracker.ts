/*
 * -----------------------------------------------------------------------------
 * This file is part of the browser implementation of the Heroes of Crypto game client.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { TeamType, TeamVals } from "@heroesofcrypto/common";

import { IFightDeathEntry, IFightStatsReport, IFightStatsSample } from "./VisibleState";

/**
 * Minimal structural view of a unit needed for casualty tracking. RenderableUnit
 * (and the shared `Unit`) both satisfy this, so the tracker stays decoupled from
 * the heavy unit types.
 */
interface IStatUnit {
    getTeam(): TeamType;
    getName(): string;
    getSmallTextureName(): string;
    getAmountAlive(): number;
}

interface IRosterEntry {
    smallTextureName: string;
    start: number;
}

/**
 * Tracks casualties over the course of a single fight, entirely on the client side.
 *
 * Kills are derived as `startingSoldiers - currentlyAliveSoldiers` per team, so it
 * needs no hook into the shared rules engine: dead stacks simply drop out of the
 * units holder and stop contributing to the alive sum (which is exactly what we want).
 */
export class FightStatsTracker {
    private started = false;
    private lowerStartTotal = 0;
    private upperStartTotal = 0;
    private lastLowerKilled = 0;
    private lastUpperKilled = 0;
    private series: IFightStatsSample[] = [];
    private readonly lowerRoster = new Map<string, IRosterEntry>();
    private readonly upperRoster = new Map<string, IRosterEntry>();
public reset(): void {
        this.started = false;
        this.lowerStartTotal = 0;
        this.upperStartTotal = 0;
        this.lastLowerKilled = 0;
        this.lastUpperKilled = 0;
        this.series = [];
        this.lowerRoster.clear();
        this.upperRoster.clear();
    }
/** Snapshot the starting roster. Call once, right after the fight starts. */
    public start(units: Iterable<IStatUnit>): void {
        this.reset();
        for (const unit of units) {
            const team = unit.getTeam();
            const amount = unit.getAmountAlive();
            if (amount <= 0) continue;
            const roster = team === TeamVals.LOWER ? this.lowerRoster : team === TeamVals.UPPER ? this.upperRoster : undefined;
            if (!roster) continue;

            if (team === TeamVals.LOWER) this.lowerStartTotal += amount;
            else this.upperStartTotal += amount;

            const name = unit.getName();
            const entry = roster.get(name);
            if (entry) {
                entry.start += amount;
            } else {
                roster.set(name, { smallTextureName: unit.getSmallTextureName(), start: amount });
            }
        }
        this.started = true;
        this.series = [{ lap: 1, lowerKilled: 0, upperKilled: 0, lowerKilledPct: 0, upperKilledPct: 0 }];
    }
/**
     * Record a data point if the casualty count changed. Cheap to call every frame:
     * it dedupes against the last recorded totals, so the series only grows on real
     * losses.
     */
    public sample(units: Iterable<IStatUnit>, lap: number): boolean {
        if (!this.started) return false;

        let lowerAlive = 0;
        let upperAlive = 0;
        for (const unit of units) {
            const team = unit.getTeam();
            if (team === TeamVals.LOWER) lowerAlive += unit.getAmountAlive();
            else if (team === TeamVals.UPPER) upperAlive += unit.getAmountAlive();
        }

        const lowerKilled = Math.max(0, this.lowerStartTotal - lowerAlive);
        const upperKilled = Math.max(0, this.upperStartTotal - upperAlive);
        if (lowerKilled === this.lastLowerKilled && upperKilled === this.lastUpperKilled) return false;

        this.lastLowerKilled = lowerKilled;
        this.lastUpperKilled = upperKilled;
        this.series.push({
            lap,
            lowerKilled,
            upperKilled,
            lowerKilledPct: FightStatsTracker.pct(lowerKilled, this.lowerStartTotal),
            upperKilledPct: FightStatsTracker.pct(upperKilled, this.upperStartTotal),
        });
        return true;
    }
/** Build the end-of-fight report consumed by the overlay. */
    public buildReport(winner: TeamType, units: Iterable<IStatUnit>, lap: number): IFightStatsReport {
        const unitArray = Array.from(units);
        // Capture the final state in the time series.
        this.sample(unitArray, lap);

        const aliveByNameLower = new Map<string, number>();
        const aliveByNameUpper = new Map<string, number>();
        for (const unit of unitArray) {
            const team = unit.getTeam();
            const target = team === TeamVals.LOWER ? aliveByNameLower : team === TeamVals.UPPER ? aliveByNameUpper : undefined;
            if (!target) continue;
            const name = unit.getName();
            target.set(name, (target.get(name) ?? 0) + unit.getAmountAlive());
        }

        return {
            winner,
            series: this.series.slice(),
            lowerDeaths: FightStatsTracker.buildDeaths(this.lowerRoster, aliveByNameLower, TeamVals.LOWER),
            upperDeaths: FightStatsTracker.buildDeaths(this.upperRoster, aliveByNameUpper, TeamVals.UPPER),
            lowerStartTotal: this.lowerStartTotal,
            upperStartTotal: this.upperStartTotal,
            lowerKilledTotal: this.lastLowerKilled,
            upperKilledTotal: this.lastUpperKilled,
            totalLaps: lap,
        };
    }
private static buildDeaths(
        roster: Map<string, IRosterEntry>,
        aliveByName: Map<string, number>,
        team: TeamType,
    ): IFightDeathEntry[] {
        const deaths: IFightDeathEntry[] = [];
        for (const [name, entry] of roster) {
            const died = Math.max(0, entry.start - (aliveByName.get(name) ?? 0));
            if (died <= 0) continue;
            deaths.push({ name, smallTextureName: entry.smallTextureName, died, start: entry.start, team });
        }
        deaths.sort((a, b) => b.died - a.died);
        return deaths;
    }
private static pct(killed: number, total: number): number {
        if (total <= 0) return 0;
        return Math.round((killed / total) * 1000) / 10;
    }
}
