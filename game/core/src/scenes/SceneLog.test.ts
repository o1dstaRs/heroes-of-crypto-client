import { describe, expect, test } from "bun:test";

import { MAX_SCENE_LOG_LINES, SceneLog } from "./SceneLog";

describe("SceneLog retention", () => {
    test("keeps only the newest visible fight-log lines", () => {
        const log = new SceneLog();

        for (let index = 0; index < MAX_SCENE_LOG_LINES + 5; index++) {
            log.updateLog(`line-${index}`);
        }

        const retained = log.getLog().split("\n");
        expect(retained).toHaveLength(MAX_SCENE_LOG_LINES);
        expect(retained[0]).toBe(`line-${MAX_SCENE_LOG_LINES + 4}`);
        expect(retained.at(-1)).toBe("line-5");
    });

    test("keeps the attack cursor monotonic after retained storage reaches its cap", () => {
        const log = new SceneLog();
        for (let index = 0; index < MAX_SCENE_LOG_LINES; index++) {
            log.pushLine(`old-${index}`);
        }
        const beforeAttack = log.getLogSize();

        log.updateLog("first-new");
        log.updateLog("second-new");

        expect(log.getLogSize()).toBe(MAX_SCENE_LOG_LINES + 2);
        expect(log.getEntriesSince(beforeAttack)).toEqual(["second-new", "first-new"]);
    });

    test("clear resets both retained lines and the append cursor", () => {
        const log = new SceneLog();
        log.updateLog("old");

        log.clear();

        expect(log.getLog()).toBe("");
        expect(log.getLogSize()).toBe(0);
        log.updateLog("new");
        expect(log.getEntriesSince(0)).toEqual(["new"]);
    });
});
