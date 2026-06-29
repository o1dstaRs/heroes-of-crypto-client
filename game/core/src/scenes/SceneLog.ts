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

import { ISceneLog } from "@heroesofcrypto/common";

import Denque from "denque";

export type SceneLogTeamFlagResolver = (line: string) => string;

export class SceneLog implements ISceneLog {
    protected log: Denque<string>;
    protected updated: boolean;
    private teamFlagResolver?: SceneLogTeamFlagResolver;
    public constructor() {
        this.log = new Denque();
        this.updated = false;
    }
    /**
     * Optional hook (set by the sandbox scene) returning a team marker — 🟢 / 🔴 — for a log line based
     * on the unit it's about, so each entry is prefixed with its side's colour like the ranked log.
     * Ranked leaves this unset: it rebuilds its log from events and prefixes lines itself by unit id.
     */
    public setTeamFlagResolver(resolver?: SceneLogTeamFlagResolver): void {
        this.teamFlagResolver = resolver;
    }
    public clear(): void {
        this.log.clear();
        this.updated = true;
    }
    public getLog(): string {
        this.updated = false;
        return this.log
            .toArray()
            .filter(() => true)
            .join("\n");
    }
    public updateLog(_newLog?: string): void {
        if (_newLog && _newLog.constructor === String) {
            const flag = this.teamFlagResolver ? this.teamFlagResolver(_newLog) : "";
            this.log.unshift(flag ? `${flag} ${_newLog}` : _newLog);
            this.updated = true;
        }
    }
    public hasBeenUpdated(): boolean {
        return this.updated;
    }
    public getLogSize(): number {
        return this.log.length;
    }
    /** Returns the entries added since the log had `previousSize` items (newest first). */
    public getEntriesSince(previousSize: number): string[] {
        const added = this.log.length - previousSize;
        if (added <= 0) return [];
        return this.log.toArray().slice(0, added);
    }
}
