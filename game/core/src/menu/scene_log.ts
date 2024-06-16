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

import Denque from "denque";

export class SceneLog {
    private log: Denque<string>;

    private updated: boolean;

    public constructor() {
        this.log = new Denque();
        this.updated = false;
    }

    public getLog(): string {
        this.updated = false;
        return this.log
            .toArray()
            .filter(() => true)
            .join("\n");
    }

    public updateLog(newLog?: string): void {
        if (newLog && newLog.constructor === String) {
            this.log.unshift(newLog);
            this.updated = true;
        }
    }

    public hasBeenUpdated(): boolean {
        return this.updated;
    }
}
