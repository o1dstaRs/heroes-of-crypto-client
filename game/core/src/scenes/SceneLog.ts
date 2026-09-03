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

import { appendBoundedDiagnosticLine } from "../utils/boundedDiagnosticLog";

export type SceneLogTeamFlagResolver = (line: string) => string;

export const MAX_SCENE_LOG_LINES = 5_000;

export class SceneLog implements ISceneLog {
    protected log: Denque<string>;
    protected updated: boolean;
    /** Monotonic append cursor; unlike retained length it keeps advancing after the bounded queue is full. */
    private totalEntries = 0;
    private teamFlagResolver?: SceneLogTeamFlagResolver;
    // When true, updateLog() (the engine/replay text channel) is a no-op. Ranked sets this so the log is
    // driven ONLY by the authoritative journal (via pushLine, which bypasses it) — otherwise the engine's
    // replay of the opponent's turn writes unflagged lines that then fight the journal rebuild.
    private suppressed = false;
    public constructor() {
        this.log = new Denque();
        this.updated = false;
    }
    public setSuppressed(suppressed: boolean): void {
        this.suppressed = suppressed;
    }
    /**
     * Append a fully-formed line directly, bypassing both the suppression switch and the team-flag
     * resolver. Used by ranked's journal-driven log, whose lines already carry their team flag.
     */
    public pushLine(line: string): void {
        this.prependLine(line);
        // DEV-only: mirror every scene-log line into a window buffer so headless harnesses can read the
        // ranked log (e.g. count "skips turn"). Same spirit as __hocActionLog. Zero effect in prod builds.
        if (import.meta.env?.DEV && typeof window !== "undefined") {
            const w = window as unknown as { __hocSceneLog?: string[] };
            appendBoundedDiagnosticLine((w.__hocSceneLog ??= []), line);
        }
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
        this.totalEntries = 0;
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
        if (this.suppressed) {
            return;
        }
        if (_newLog && _newLog.constructor === String) {
            const flag = this.teamFlagResolver ? this.teamFlagResolver(_newLog) : "";
            this.prependLine(flag ? `${flag} ${_newLog}` : _newLog);
        }
    }
    public hasBeenUpdated(): boolean {
        return this.updated;
    }
    public getLogSize(): number {
        return this.totalEntries;
    }
    /** Returns the retained entries added since `previousSize` was captured (newest first). */
    public getEntriesSince(previousSize: number): string[] {
        const added = this.totalEntries - previousSize;
        if (added <= 0) return [];
        return this.log.toArray().slice(0, Math.min(added, this.log.length));
    }
    private prependLine(line: string): void {
        this.log.unshift(line);
        this.totalEntries += 1;
        if (this.log.length > MAX_SCENE_LOG_LINES) {
            this.log.pop();
        }
        this.updated = true;
    }
}
