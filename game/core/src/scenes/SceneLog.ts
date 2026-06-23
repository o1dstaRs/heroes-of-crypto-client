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

export class SceneLog implements ISceneLog {
    protected log: Denque<string>;
    protected updated: boolean;
    public constructor() {
        this.log = new Denque();
        this.updated = false;
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
            this.log.unshift(_newLog);
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
