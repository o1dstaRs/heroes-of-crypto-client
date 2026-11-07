import { expect, mock, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";
import { SceneLog } from "./SceneLog";

const resistedEvents = (): GameEvent[] => [
    {
        type: "effects_applied",
        applications: [
            { unitId: "trog", name: "Blindness", kind: "effect", resisted: true, resistedBy: "Madness" },
            { unitId: "trog", name: "Aggr", kind: "effect", resisted: true, resistedBy: "Madness" },
            { unitId: "other", name: "Sadness", kind: "debuff", resisted: true },
            { unitId: "dead", name: "Blindness", kind: "effect", resisted: true, resistedBy: "Madness" },
            { unitId: "missing", name: "Blindness", kind: "effect", resisted: true, resistedBy: "Madness" },
            { unitId: "other", name: "Stun", kind: "effect" },
        ],
    },
];

test("confirmed resists show once at impact and retain separate effect names in the local log", () => {
    const unit = (id: string, dead = false) => ({
        getId: () => id,
        getName: () => (id === "trog" ? "Troglodyte" : "Other"),
        isDead: () => dead,
    });
    const trog = unit("trog");
    const other = unit("other");
    const spawnCommonFlagPop = mock(() => undefined);
    const log = new SceneLog();
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: {
            getAllUnits: () =>
                new Map([
                    ["trog", trog],
                    ["other", other],
                    ["dead", unit("dead", true)],
                ]),
        },
        combatVisuals: { spawnCommonFlagPop },
        sc_sceneLog: log,
    });
    const events = resistedEvents();
    scene.beginDullingDefensePresentation();
    scene.popRecordedResistances(events, new Set(["trog"]));
    expect(spawnCommonFlagPop).toHaveBeenCalledTimes(1);
    expect(spawnCommonFlagPop).toHaveBeenLastCalledWith(trog, "resist");
    scene.popRecordedResistances(events);
    scene.renderCastOutcomes(events);
    expect(spawnCommonFlagPop).toHaveBeenCalledTimes(2);
    expect(spawnCommonFlagPop).toHaveBeenLastCalledWith(other, "resist");
    expect(log.getLog().split("\n")).toEqual([
        "Troglodyte resisted Aggr (Madness)",
        "Troglodyte resisted Blindness (Madness)",
    ]);
    scene.beginDullingDefensePresentation();
    scene.popRecordedResistances(events);
    expect(spawnCommonFlagPop).toHaveBeenCalledTimes(4);
});

test("new cast records can show another resist without an attack reset; landed effects stay silent", () => {
    const target = { isDead: () => false, getName: () => "Troglodyte" };
    const spawnCommonFlagPop = mock(() => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map([["trog", target]]) },
        combatVisuals: { spawnCommonFlagPop },
        sc_sceneLog: new SceneLog(),
    });
    scene.renderCastOutcomes(resistedEvents());
    scene.renderCastOutcomes(resistedEvents());
    expect(spawnCommonFlagPop).toHaveBeenCalledTimes(2);
    scene.popRecordedResistances([
        { type: "effects_applied", applications: [{ unitId: "trog", name: "Stun", kind: "effect" }] },
    ]);
    scene.popRecordedResistances(undefined);
    expect(spawnCommonFlagPop).toHaveBeenCalledTimes(2);
});
