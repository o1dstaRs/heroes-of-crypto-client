import { expect, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";

import type { SandboxReplayActionRecord } from "../replay/sandbox_replay";
import { Sandbox } from "./Sandbox";

// A Lightning Spin replaces the swing: every enemy around the Hydra — the clicked one included — is
// recorded only in `damage.secondary`. Each of them must play its hit reaction, not just the target.
const run = async (source: "lightning_spin" | "skewer_strike", spinReplacesSwing: boolean) => {
    const reacted: string[] = [];
    const unit = (id: string, team: number) => ({
        getId: () => id,
        getTeam: () => team,
        getName: () => "Orc",
        getAmountAlive: () => 10,
        getUnitProperties: () => ({ id, amount_alive: 10, level: 1 }),
        getPosition: () => ({ x: id === "attacker" ? 0 : 100, y: 0 }),
        getVisualCenter: () => ({ x: id === "attacker" ? 0 : 100, y: 0 }),
        getDamagePredictionAnchor: () => ({ x: 0, y: 100 }),
        getAnimationTextureKey: () => undefined,
        hasAbilityActive: () => false,
        isDead: () => false,
        setActiveTurn: () => undefined,
        syncVisual: () => undefined,
    });
    const attacker = unit("attacker", 1);
    const victims = ["primary", "left", "right"].map((id) => unit(id, 2));
    const units = new Map([attacker, ...victims].map((entry) => [entry.getId(), entry]));
    const secondary = victims
        .filter((victim) => spinReplacesSwing || victim.getId() !== "primary")
        .map((victim) => ({
            source,
            unitId: victim.getId(),
            position: victim.getPosition(),
            amount: 7,
            unitsDied: 0,
        }));
    const attack: Extract<GameEvent, { type: "unit_attacked" }> = {
        type: "unit_attacked",
        attackerId: attacker.getId(),
        targetId: "primary",
        attackType: "melee",
        animations: [],
        unitIdsDied: [],
        damage: spinReplacesSwing
            ? { amount: 0, render: false, unitPosition: { x: 100, y: 0 }, unitIsSmall: true, secondary }
            : {
                  amount: 10,
                  render: true,
                  unitId: "primary",
                  unitPosition: { x: 100, y: 0 },
                  unitIsSmall: true,
                  hits: [{ amount: 10, unitsDied: 0 }],
                  secondary,
              },
    };
    const record = {
        action: { type: "melee_attack", attackerId: attacker.getId(), targetId: "primary" },
        events: [attack],
        stateAfter: { units: [...units.values()].map((entry) => ({ properties: entry.getUnitProperties() })) },
    } as unknown as SandboxReplayActionRecord;
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => units },
        drawer: { getUnitsContainer: () => undefined },
        sc_sceneSettings: { getGridSettings: () => ({}) },
        sc_sceneLog: { updateLog: () => undefined },
        isSceneDestroyed: () => false,
        preparePyreDeaths: () => undefined,
        prepareDirectionalAttackState: () => "attack",
        getReplayRetaliationDamage: () => undefined,
        offsetReplayDamagePosition: (position: unknown) => position,
        playReplayOneShot: (target: { getId(): string }, state: string) => {
            if (state === "hit") reacted.push(target.getId());
            return Promise.resolve();
        },
        playFireShieldPassives: () => Promise.resolve(),
        combatVisuals: { showFloatingDamage: () => undefined, spawnCommonFlagPop: () => undefined },
        spawnBorrowedGraceVfx: () => undefined,
        spawnFireBreathVfx: () => undefined,
        spawnChainLightningVfx: () => undefined,
        spawnFireDamageVfx: () => undefined,
        showReplayAttackDamage: () => undefined,
        spawnAbilityStealVfx: () => undefined,
        spawnShatterArmorSlashVfx: () => undefined,
        applyReplayAttackRecoil: () => undefined,
        spawnSkewerWindSpearVfx: () => undefined,
        destroyReplayAttackUnitsAtImpact: () => undefined,
        applyReplayEvents: () => undefined,
        delayReplay: () => Promise.resolve(),
    });
    expect(await scene.playReplayAttackRecord(record)).toBe(true);
    return reacted.sort();
};

test("every unit a Lightning Spin struck plays its hit reaction, the clicked one included", async () => {
    expect(await run("lightning_spin", true)).toEqual(["left", "primary", "right"]);
});

test("sweep victims beside a landed primary blow react once each", async () => {
    expect(await run("skewer_strike", false)).toEqual(["left", "primary", "right"]);
});
