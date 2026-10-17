import { describe, expect, mock, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";

import type { SandboxReplayActionRecord } from "../replay/sandbox_replay";
import { Sandbox } from "./Sandbox";

const fixture = (source: "skewer_strike" | "lightning_spin") => {
    const flashes: string[] = [];
    const pops: string[] = [];
    const unit = (id: string) => {
        let properties = { id, amount_alive: 10, base_attack: 8 };
        return {
            getId: () => id,
            getName: () => "Orc",
            getAmountAlive: () => properties.amount_alive,
            getUnitProperties: () => properties,
            getPosition: () => ({ x: id === "attacker" ? 0 : 100, y: 0 }),
            getVisualCenter: () => ({ x: id === "attacker" ? 0 : 100, y: 0 }),
            getDamagePredictionAnchor: () => ({ x: 0, y: 100 }),
            getAnimationTextureKey: () => undefined,
            hasAbilityActive: () => false,
            isDead: () => false,
            setActiveTurn: () => undefined,
            syncVisual: () => undefined,
            flashDebuffDarken: () => flashes.push(id),
            applyRecordedAttack: () => {
                properties = { ...properties, base_attack: 4 };
            },
        };
    };
    const attacker = unit("attacker");
    const primary = unit("primary");
    const secondary = unit("secondary");
    const resisted = unit("resisted");
    const units = new Map([attacker, primary, secondary, resisted].map((entry) => [entry.getId(), entry]));
    const attack: Extract<GameEvent, { type: "unit_attacked" }> = {
        type: "unit_attacked",
        attackerId: attacker.getId(),
        targetId: primary.getId(),
        attackType: "melee",
        animations: [],
        unitIdsDied: [],
        damage: {
            amount: 10,
            render: true,
            unitId: primary.getId(),
            unitPosition: primary.getPosition(),
            unitIsSmall: true,
            hits: [{ amount: 10, unitsDied: 0 }],
            secondary: [
                { source, unitId: secondary.getId(), position: secondary.getPosition(), amount: 5, unitsDied: 0 },
            ],
        },
    };
    const record = {
        action: { type: "melee_attack", attackerId: attacker.getId(), targetId: primary.getId() },
        events: [
            attack,
            {
                type: "effects_applied",
                applications: [
                    { unitId: primary.getId(), name: "Dulling Defense", kind: "debuff", laps: 15 },
                    { unitId: secondary.getId(), name: "Dulling Defense", kind: "debuff", laps: 15 },
                    { unitId: resisted.getId(), name: "Dulling Defense", kind: "debuff", laps: 15, resisted: true },
                ],
            },
        ],
        stateAfter: { units: [...units.values()].map((entry) => ({ properties: entry.getUnitProperties() })) },
    } as unknown as SandboxReplayActionRecord;
    const setSelectedUnitProperties = mock(() => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => units },
        drawer: { getUnitsContainer: () => undefined },
        sc_sceneSettings: { getGridSettings: () => ({}) },
        sc_sceneLog: { updateLog: () => undefined },
        sc_selectedUnitProperties: { ...secondary.getUnitProperties() },
        isSceneDestroyed: () => false,
        preparePyreDeaths: () => undefined,
        prepareDirectionalAttackState: () => "attack",
        getReplayRetaliationDamage: () => undefined,
        offsetReplayDamagePosition: (position: unknown) => position,
        playReplayOneShot: () => Promise.resolve(),
        playFireShieldPassives: () => Promise.resolve(),
        combatVisuals: {
            showFloatingDamage: () => undefined,
            spawnCommonFlagPop: (recipient: { getId(): string }, kind: string) => {
                expect(kind).toBe("dulling_defense");
                pops.push(recipient.getId());
            },
        },
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
        applyReplayEvents: () => secondary.applyRecordedAttack(),
        setSelectedUnitProperties,
        delayReplay: () => Promise.resolve(),
    });
    return {
        scene,
        secondary,
        pops,
        flashes,
        setSelectedUnitProperties,
        run: () => scene.playReplayAttackRecord(record) as Promise<boolean>,
    };
};

describe("recorded Dulling Defense presentation", () => {
    test.each(["skewer_strike", "lightning_spin"] as const)(
        "%s presents successful secondary recipients without repeating the primary pop",
        async (source) => {
            const h = fixture(source);
            expect(await h.run()).toBe(true);
            expect(h.pops).toEqual(["primary", "secondary"]);
            expect(h.flashes).toEqual(["primary", "secondary"]);
        },
    );

    test("the selected secondary card refreshes from the applied recorded state", async () => {
        const h = fixture("skewer_strike");
        expect(await h.run()).toBe(true);
        expect(h.setSelectedUnitProperties).toHaveBeenCalledTimes(1);
        expect(h.setSelectedUnitProperties).toHaveBeenCalledWith(h.secondary.getUnitProperties());
        expect(h.scene.sc_selectedUnitProperties.base_attack).toBe(4);
    });

    test("playing the same action again presents each recipient once again", async () => {
        const h = fixture("lightning_spin");
        expect(await h.run()).toBe(true);
        expect(await h.run()).toBe(true);
        expect(h.pops).toEqual(["primary", "secondary", "primary", "secondary"]);
        expect(h.setSelectedUnitProperties).toHaveBeenCalledTimes(2);
    });
});
