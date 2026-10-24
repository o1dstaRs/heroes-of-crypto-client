import { describe, expect, mock, test } from "bun:test";

import {
    AbilityFactory,
    CreatureVals,
    EffectFactory,
    FightStateManager,
    Grid,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    Spell,
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
} from "@heroesofcrypto/common";
import type { GameEvent } from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot, AuthoritativeUnitState } from "../game_action_transport";
import type { SandboxReplayActionRecord } from "../replay/sandbox_replay";
import {
    applyRankedUnitSnapshotStats,
    authoritativeSnapshotToSandboxSceneState,
    RankedPlayScene,
} from "./RankedPlayScene";
import { RenderableUnit } from "./RenderableUnit";

const unitState = (overrides: Partial<AuthoritativeUnitState> = {}): AuthoritativeUnitState => ({
    id: "recipient",
    team: TeamVals.LEFT,
    name: "Squire",
    creatureId: CreatureVals.SQUIRE,
    amountAlive: 10,
    amountDied: 0,
    hp: 10,
    maxHp: 10,
    attackType: 0,
    size: 1,
    baseCell: { x: 2, y: 2 },
    cells: [{ x: 2, y: 2 }],
    initiative: 0,
    morale: 0,
    dead: false,
    placed: true,
    stackPower: 1,
    rangeShots: 1,
    luck: 0,
    onHourglass: false,
    statModsAuthoritative: true,
    attackMod: 6,
    armorMod: 4,
    ...overrides,
});

const snapshot = (overrides: Partial<AuthoritativeUnitState> = {}): AuthoritativeGameSnapshot => ({
    gameId: "helping-hand",
    phase: 2,
    gridType: GridVals.NORMAL,
    currentLap: 1,
    fightStarted: true,
    fightFinished: false,
    currentUnitId: "recipient",
    currentTurnTeam: TeamVals.LEFT,
    latestSequence: 3,
    narrowingLayers: 0,
    centerDried: false,
    units: [unitState(overrides)],
    upNext: [],
});

const linked = {
    buffs: ["Helping Hand"],
    buffLaps: [3],
    buffDescriptions: ["Transfers health and armor."],
    helpingHandCasterId: "satyr",
    helpingHandPenaltyId: "absorber",
};

const properties = (overrides: Partial<AuthoritativeUnitState> = {}) =>
    authoritativeSnapshotToSandboxSceneState(snapshot(overrides)).units[0]!.properties;

const liveUnit = (overrides: Partial<AuthoritativeUnitState> = {}) => {
    const effects = new EffectFactory();
    return RenderableUnit.fromBase(
        Unit.createUnit(
            properties(overrides),
            new GridSettings(16, 1600, 0, 1600, 0, 0, 0),
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        ),
        undefined as never,
    );
};

describe("ranked Helping Hand relationship hydration", () => {
    test("hydrates caster and absorbed penalty endpoints for ranked reconnects and replay scene states", () => {
        expect(properties(linked)).toMatchObject({
            helping_hand_caster_id: "satyr",
            helping_hand_penalty_id: "absorber",
        });
        expect(liveUnit(linked).getUnitProperties()).toMatchObject({
            helping_hand_caster_id: "satyr",
            helping_hand_penalty_id: "absorber",
        });
    });

    test("keeps an older snapshot's displayed buff without inventing relationship endpoints", () => {
        const legacy = properties({ buffs: ["Helping Hand"], buffLaps: [3] });

        expect(legacy.applied_buffs).toEqual(["Helping Hand"]);
        expect(legacy.helping_hand_caster_id).toBeUndefined();
        expect(legacy.helping_hand_penalty_id).toBeUndefined();
    });

    test("adds a relationship in place without applying the transferred stats again", () => {
        const unit = liveUnit();
        const maxHp = unit.getMaxHp();
        const armor = unit.getArmor();
        const before = unit.getUnitProperties();

        expect(applyRankedUnitSnapshotStats(unit, properties(linked))).toBe(true);

        expect(unit.getUnitProperties()).toBe(before);
        expect(unit.getUnitProperties()).toMatchObject({
            helping_hand_caster_id: "satyr",
            helping_hand_penalty_id: "absorber",
            applied_buffs: ["Helping Hand"],
        });
        expect(unit.getMaxHp()).toBe(maxHp);
        expect(unit.getArmor()).toBe(armor);
        expect(applyRankedUnitSnapshotStats(unit, properties(linked))).toBe(false);
    });

    for (const { role, maxHp, baseArmor } of [
        { role: "recipient", maxHp: 18, baseArmor: 8 },
        { role: "penalty bearer", maxHp: 6, baseArmor: 2 },
    ]) {
        test(`syncs ${role} health and armor after the cast and restores both when an endpoint dies`, () => {
            const baseline = { hp: 10, maxHp: 10, baseArmor: 5, armorMod: 0 };
            const unit = liveUnit(baseline);
            const active =
                role === "recipient"
                    ? { ...linked, hp: maxHp, maxHp, baseArmor, armorMod: 0 }
                    : { hp: maxHp, maxHp, baseArmor, armorMod: 0, debuffs: ["Helping Hand"], debuffLaps: [3] };

            expect(applyRankedUnitSnapshotStats(unit, properties(active))).toBe(true);
            expect(unit.getMaxHp()).toBe(maxHp);
            expect(unit.getHp()).toBe(maxHp);
            expect(unit.getArmor()).toBe(baseArmor);
            unit.adjustBaseStats(true, 1, 0, 0, 0, 0, 0);
            expect(unit.getMaxHp()).toBe(maxHp);
            expect(unit.getHp()).toBe(maxHp);
            expect(unit.getArmor()).toBe(baseArmor);

            expect(applyRankedUnitSnapshotStats(unit, properties(baseline))).toBe(true);
            expect(unit.getMaxHp()).toBe(10);
            expect(unit.getHp()).toBe(10);
            expect(unit.getArmor()).toBe(5);
            unit.adjustBaseStats(true, 1, 0, 0, 0, 0, 0);
            expect(unit.getMaxHp()).toBe(10);
            expect(unit.getHp()).toBe(10);
            expect(unit.getArmor()).toBe(5);
            expect(unit.getUnitProperties().helping_hand_caster_id).toBeUndefined();
            expect(unit.getUnitProperties().helping_hand_penalty_id).toBeUndefined();
            expect(applyRankedUnitSnapshotStats(unit, properties(baseline))).toBe(false);
        });
    }

    test("replaces a relationship on the persistent recipient when another caster supplies it", () => {
        const unit = liveUnit(linked);

        expect(
            applyRankedUnitSnapshotStats(
                unit,
                properties({ ...linked, helpingHandCasterId: "next-satyr", helpingHandPenaltyId: "next-satyr" }),
            ),
        ).toBe(true);

        expect(unit.getUnitProperties()).toMatchObject({
            helping_hand_caster_id: "next-satyr",
            helping_hand_penalty_id: "next-satyr",
        });
    });

    test("removes a stale live penalty object when an authoritative snapshot no longer has Helping Hand", () => {
        const unit = liveUnit();
        unit.applyDebuff(
            new Spell({ spellProperties: HoCConfig.getSpellConfig("Life", "Helping Hand"), amount: 1 }),
            4,
            3,
        );
        unit.applyDebuff(new Spell({ spellProperties: HoCConfig.getSpellConfig("Nature", "Whirlpool"), amount: 1 }));
        expect(unit.hasDebuffActive("Helping Hand")).toBe(true);

        expect(applyRankedUnitSnapshotStats(unit, properties({ debuffs: ["Whirlpool"], debuffLaps: [3] }))).toBe(true);

        expect(unit.getDebuff("Helping Hand")).toBeUndefined();
        expect(unit.hasDebuffActive("Helping Hand")).toBe(false);
        expect(unit.hasDebuffActive("Whirlpool")).toBe(true);
    });

    test("clears stale metadata and the display buff when the authoritative relationship ends", () => {
        const unit = liveUnit(linked);

        expect(applyRankedUnitSnapshotStats(unit, properties({ attackMod: 0, armorMod: 0 }))).toBe(true);

        expect(unit.getUnitProperties()).not.toHaveProperty("helping_hand_caster_id");
        expect(unit.getUnitProperties()).not.toHaveProperty("helping_hand_penalty_id");
        expect(unit.getUnitProperties().applied_buffs).toEqual([]);
        expect(unit.getUnitProperties().attack_mod).toBe(0);
        expect(unit.getUnitProperties().armor_mod).toBe(0);
    });

    test("clears a previous relationship even when a legacy snapshot still has the display buff", () => {
        const unit = liveUnit(linked);

        expect(
            applyRankedUnitSnapshotStats(
                unit,
                properties({
                    buffs: linked.buffs,
                    buffLaps: linked.buffLaps,
                    buffDescriptions: linked.buffDescriptions,
                }),
            ),
        ).toBe(true);

        expect(unit.getUnitProperties()).not.toHaveProperty("helping_hand_caster_id");
        expect(unit.getUnitProperties()).not.toHaveProperty("helping_hand_penalty_id");
        expect(unit.getUnitProperties().applied_buffs).toEqual(["Helping Hand"]);
    });
});

const replayFixture = (completed: boolean, spellName = "Helping Hand") => {
    const gs = new GridSettings(16, 1600, 0, 1600, 0, 0, 0);
    const baseline = { hp: 10, maxHp: 10, baseArmor: 5, armorMod: 0 };
    const caster = liveUnit({ ...baseline, id: "satyr", name: "Satyr", creatureId: CreatureVals.SATYR });
    const recipient = liveUnit(baseline);
    const penaltyBearer = liveUnit({ ...baseline, id: "absorber" });
    const unrelated = liveUnit({ ...baseline, id: "unrelated" });
    const units = new Map([caster, recipient, penaltyBearer, unrelated].map((unit) => [unit.getId(), unit]));
    for (const unit of units.values()) {
        const position = GridMath.getPositionForFootprintAnchor(
            gs,
            { x: 2, y: 2 },
            unit.getFootprintWidth(),
            unit.getFootprintHeight(),
        );
        unit.setPosition(position.x, position.y);
    }
    caster.hasAnimationState = () => true;
    caster.faceBoardTarget = () => undefined;
    const stateAfter = authoritativeSnapshotToSandboxSceneState({
        ...snapshot(),
        units: [
            unitState({
                ...baseline,
                id: "satyr",
                name: "Satyr",
                creatureId: CreatureVals.SATYR,
                hp: 9,
                helpingHandCasterId: "previous-donor",
                helpingHandPenaltyId: "unrelated",
            }),
            unitState({ ...baseline, ...linked, hp: 18, maxHp: 18, baseArmor: 8 }),
            unitState({
                ...baseline,
                id: "absorber",
                hp: 6,
                maxHp: 6,
                baseArmor: 2,
                debuffs: ["Helping Hand"],
                debuffLaps: [3],
            }),
            unitState({ ...baseline, id: "unrelated", hp: 1 }),
        ],
    });
    const record: SandboxReplayActionRecord = {
        sequence: 3,
        clientTimeMs: 1_000,
        action: { type: "cast_spell", casterId: "satyr", targetId: "recipient", spellName },
        events: [],
        stateAfter,
        authoritativeSnapshot: snapshot({ ...baseline, hp: 1 }),
    };
    let finishCast: () => void = () => undefined;
    const cast = new Promise<void>((resolve) => {
        finishCast = resolve;
    });
    const renderBuffs = mock((): void => undefined);
    const delay = mock(() => Promise.resolve());
    const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
        unitsHolder: { getAllUnits: () => units },
        grid: { getSettings: () => gs, getOccupantUnitId: () => undefined },
        sc_sceneSettings: { getGridSettings: () => gs },
        snapshotRenderableUnits: () => units,
        playUnitCombatSound: () => undefined,
        playReplayOneShot: () => cast,
        createActionEngine: () => ({ apply: () => ({ completed, events: [] }) }),
        renderHealVfx: () => undefined,
        renderSpellDamageVfx: () => undefined,
        spawnAbilityTransferVfx: () => undefined,
        renderCastOutcomes: () => undefined,
        renderReplayBuffApplications: renderBuffs,
        renderSnareResistVfx: () => undefined,
        cleanupAfterSpell: () => undefined,
        applyReplayEvents: () => undefined,
        refreshUnits: () => {
            for (const unit of units.values()) unit.adjustBaseStats(true, 1, 0, 0, 0, 0, 0);
        },
        delayReplay: delay,
    }) as unknown as {
        playReplayCastSpellAction: (record: SandboxReplayActionRecord) => Promise<boolean>;
    };
    return { scene, record, caster, recipient, penaltyBearer, unrelated, finishCast, renderBuffs, delay };
};

describe("ranked Helping Hand replay impact", () => {
    test.each([true, false])(
        "applies this record's endpoints at impact with local reapply completed=%s",
        async (completed) => {
            const f = replayFixture(completed);
            const expectImpactState = () => {
                expect(f.recipient.getMaxHp()).toBe(18);
                expect(f.recipient.getHp()).toBe(18);
                expect(f.recipient.getArmor()).toBe(8);
                expect(f.recipient.getUnitProperties()).toMatchObject({
                    helping_hand_caster_id: "satyr",
                    helping_hand_penalty_id: "absorber",
                });
                expect(f.penaltyBearer.getMaxHp()).toBe(6);
                expect(f.penaltyBearer.getHp()).toBe(6);
                expect(f.penaltyBearer.getArmor()).toBe(2);
                expect(f.caster.getHp()).toBe(9);
                expect(f.unrelated.getHp()).toBe(10);
            };
            f.renderBuffs.mockImplementation(expectImpactState);
            f.delay.mockImplementation(() => {
                expectImpactState();
                return Promise.resolve();
            });

            const playing = f.scene.playReplayCastSpellAction(f.record);

            expect(f.recipient.getMaxHp()).toBe(10);
            expect(f.recipient.getUnitProperties().helping_hand_caster_id).toBeUndefined();
            expect(f.penaltyBearer.getMaxHp()).toBe(10);
            expect(f.renderBuffs).not.toHaveBeenCalled();
            f.finishCast();
            expect(await playing).toBe(true);
            expect(f.renderBuffs).toHaveBeenCalledTimes(1);
            expect(f.delay).toHaveBeenCalledTimes(1);
        },
    );

    test("does not synchronize Helping Hand state during a different spell's impact", async () => {
        const f = replayFixture(false, "Courage");
        const playing = f.scene.playReplayCastSpellAction(f.record);
        f.finishCast();

        expect(await playing).toBe(true);
        expect(f.recipient.getMaxHp()).toBe(10);
        expect(f.recipient.getUnitProperties().helping_hand_caster_id).toBeUndefined();
        expect(f.penaltyBearer.getMaxHp()).toBe(10);
        expect(f.caster.getHp()).toBe(10);
        expect(f.unrelated.getHp()).toBe(10);
    });
});

const deathReplayFixture = (
    dyingId: "satyr" | "recipient" | "absorber",
    recipientHp = 18,
    penaltyHp = 6,
    sharedPenalty = false,
) => {
    FightStateManager.getInstance().reset();
    const gs = new GridSettings(16, 1600, 0, 1600, 0, 0, 0);
    const unitsHolder = new UnitsHolder(new Grid(gs, GridVals.NORMAL));
    const baseline = { maxHp: 10, hp: 10, baseArmor: 5, armorMod: 0 };
    const initial = [
        unitState({ ...baseline, id: "attacker" }),
        unitState({ ...baseline, id: "satyr" }),
        unitState({ ...baseline, ...linked, maxHp: 18, hp: recipientHp, baseArmor: 8 }),
        unitState({
            ...baseline,
            id: "absorber",
            maxHp: 6,
            hp: penaltyHp,
            baseArmor: 2,
            debuffs: ["Helping Hand"],
            debuffLaps: [3],
        }),
        unitState({ ...baseline, id: "unrelated" }),
        ...(sharedPenalty
            ? [unitState({ ...baseline, ...linked, id: "second", maxHp: 18, hp: 18, baseArmor: 8 })]
            : []),
    ];
    const units = new Map(
        initial.map((state) => {
            const unit = liveUnit(state);
            unit.syncVisual = () => undefined;
            unit.hasAnimationState = () => false;
            unit.getShatterInfo = () => null;
            unit.destroyVisuals = mock();
            unitsHolder.addUnit(unit);
            return [state.id, unit];
        }),
    );
    const deadIds = [dyingId, ...(sharedPenalty ? ["second"] : [])];
    const stateAfter = authoritativeSnapshotToSandboxSceneState({
        ...snapshot(),
        units: initial.map((state) =>
            unitState({
                ...baseline,
                id: state.id,
                amountAlive: deadIds.includes(state.id) ? 0 : 2,
                amountDied: deadIds.includes(state.id) ? 10 : 8,
                hp: deadIds.includes(state.id) ? 0 : 1,
                dead: deadIds.includes(state.id),
                attackMod: 90,
                armorMod: 90,
            }),
        ),
    });
    const attack: Extract<GameEvent, { type: "unit_attacked" }> = {
        type: "unit_attacked",
        attackerId: "attacker",
        targetId: dyingId,
        attackType: "range",
        animations: [],
        unitIdsDied: deadIds,
        damage: {
            amount: 100,
            render: true,
            unitId: dyingId,
            unitPosition: { x: 0, y: 0 },
            unitIsSmall: true,
            hits: [{ amount: 100, unitsDied: 10 }],
        },
    };
    const record: SandboxReplayActionRecord = {
        sequence: 4,
        clientTimeMs: 1_100,
        action: { type: "range_attack", attackerId: "attacker", targetId: dyingId },
        events: [
            attack,
            ...deadIds.map((unitId) => ({ type: "unit_destroyed" as const, unitId, reason: "dead_cleanup" as const })),
        ],
        stateAfter,
    };
    let impact: (id?: string) => void = () => undefined;
    let finishExchange: () => void = () => undefined;
    const exchange = new Promise<Set<string>>((resolve) => {
        finishExchange = () => resolve(new Set(deadIds));
    });
    const setSelectedUnitProperties = mock();
    const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
        unitsHolder,
        dyingVisualUnits: new Set(),
        drawer: { getUnitsContainer: () => undefined },
        sc_sceneSettings: { getGridSettings: () => gs },
        sc_sceneLog: { updateLog: () => undefined },
        sc_selectedUnitProperties: units.get("recipient")!.getUnitProperties(),
        ensureReplayActiveUnit: () => true,
        isSceneDestroyed: () => false,
        preparePyreDeaths: () => undefined,
        getReplayRetaliationDamage: () => undefined,
        buildCombatExchange: () => [],
        noteDeathBlowsFromAttackEvent: () => undefined,
        playCombatExchange: (
            _attacker: unknown,
            _target: unknown,
            _event: unknown,
            _exchange: unknown,
            onDeath: (unit: RenderableUnit) => void,
        ) => {
            impact = (id = dyingId) => onDeath(units.get(id)!);
            return exchange;
        },
        combatVisuals: { endHelpingHandLinksForUnit: mock() },
        spawnFireBreathVfx: () => undefined,
        spawnChainLightningVfx: () => undefined,
        spawnFireDamageVfx: () => undefined,
        showReplayAttackDamage: () => undefined,
        spawnAbilityStealVfx: () => undefined,
        spawnShatterArmorSlashVfx: () => undefined,
        applyReplayAttackRecoil: () => undefined,
        spawnSkewerWindSpearVfx: () => undefined,
        applyReplayEvents: () => undefined,
        setSelectedUnitProperties,
        delayReplay: () => Promise.resolve(),
    }) as unknown as {
        playSandboxReplayRecord: (record: SandboxReplayActionRecord) => Promise<boolean>;
        endHelpingHandLinksAtImpact: (id: string) => void;
        onReplayHangRecovery: () => void;
    };
    return {
        scene,
        record,
        units,
        setSelectedUnitProperties,
        impact: (id?: string) => impact(id),
        finishExchange: () => finishExchange(),
    };
};

describe("ranked Helping Hand death impact", () => {
    test.each(["satyr", "recipient", "absorber"] as const)(
        "%s death restores only surviving endpoints at the recorded impact",
        async (dyingId) => {
            const f = deathReplayFixture(dyingId);
            const recipient = f.units.get("recipient")!;
            const penalty = f.units.get("absorber")!;
            const playing = f.scene.playSandboxReplayRecord(f.record);
            recipient.beginDamagePresentation();
            recipient.presentDamageCasualties(2);
            penalty.beginDamagePresentation();
            penalty.presentDamageCasualties(1);

            expect(recipient.getMaxHp()).toBe(18);
            expect(penalty.getMaxHp()).toBe(6);
            f.impact();

            expect(recipient.getUnitProperties().helping_hand_caster_id).toBeUndefined();
            expect(recipient.getUnitProperties().applied_buffs).not.toContain("Helping Hand");
            expect(penalty.getUnitProperties().applied_debuffs).not.toContain("Helping Hand");
            for (const endpoint of [recipient, penalty]) {
                if (endpoint.getId() === dyingId) continue;
                expect(endpoint.getMaxHp()).toBe(10);
                expect(endpoint.getHp()).toBe(10);
                expect(endpoint.getArmor()).toBe(5);
                expect(endpoint.getRangeArmor()).toBe(5);
                expect(endpoint.getAmountAlive()).toBe(10);
                expect(endpoint.getAmountDied()).toBe(0);
            }
            expect(recipient.getDisplayedAmount()).toBe(8);
            expect(penalty.getDisplayedAmount()).toBe(9);
            expect(f.units.get("unrelated")!.getHp()).toBe(10);
            expect(f.units.get("unrelated")!.getAmountAlive()).toBe(10);
            f.finishExchange();
            expect(await playing).toBe(true);
            expect(Reflect.get(f.scene, "currentReplayImpactRecord")).toBeUndefined();
        },
    );

    test("wounded endpoints retain current HP and pending casualties through stat restoration", async () => {
        const f = deathReplayFixture("satyr", 15, 4);
        const recipient = f.units.get("recipient")!;
        const penalty = f.units.get("absorber")!;
        const playing = f.scene.playSandboxReplayRecord(f.record);
        recipient.beginDamagePresentation();
        const laterCasualties = recipient.captureDamageCasualties(3);

        f.impact();

        expect(recipient.getHp()).toBe(10);
        expect(penalty.getHp()).toBe(4);
        expect(penalty.getMaxHp()).toBe(10);
        laterCasualties();
        expect(recipient.getDisplayedAmount()).toBe(7);
        expect(f.setSelectedUnitProperties).toHaveBeenCalledWith(recipient.getUnitProperties());
        f.finishExchange();
        expect(await playing).toBe(true);
    });

    test("a shared penalty lasts until its final recipient's impact within a multi-hit action", async () => {
        const f = deathReplayFixture("recipient", 18, 6, true);
        const penalty = f.units.get("absorber")!;
        const playing = f.scene.playSandboxReplayRecord(f.record);

        f.impact("recipient");
        expect(penalty.getUnitProperties().applied_debuffs).toContain("Helping Hand");
        expect(penalty.getMaxHp()).toBe(6);
        expect(f.units.get("second")!.getUnitProperties().helping_hand_caster_id).toBe("satyr");

        f.impact("second");
        expect(penalty.getUnitProperties().applied_debuffs).not.toContain("Helping Hand");
        expect(penalty.getMaxHp()).toBe(10);
        expect(penalty.getHp()).toBe(10);
        expect(penalty.getArmor()).toBe(5);
        f.finishExchange();
        expect(await playing).toBe(true);
    });

    test("watchdog recovery stops a late impact from using a stale record's stats", async () => {
        const f = deathReplayFixture("satyr");
        const playing = f.scene.playSandboxReplayRecord(f.record);
        f.scene.onReplayHangRecovery();

        f.impact();

        expect(f.units.get("recipient")!.getMaxHp()).toBe(18);
        expect(f.units.get("absorber")!.getMaxHp()).toBe(6);
        f.finishExchange();
        expect(await playing).toBe(true);
        expect(Reflect.get(f.scene, "currentReplayImpactRecord")).toBeUndefined();
    });

    test("a later replay record uses its own endpoint stats and releases its context", async () => {
        const f = deathReplayFixture("satyr");
        const first = f.scene.playSandboxReplayRecord(f.record);
        f.impact();
        f.finishExchange();
        expect(await first).toBe(true);

        const recipient = f.units.get("recipient")!;
        const penalty = f.units.get("absorber")!;
        applyRankedUnitSnapshotStats(
            penalty,
            properties({ id: "absorber", maxHp: 6, hp: 6, baseArmor: 2, debuffs: ["Helping Hand"], debuffLaps: [3] }),
        );
        applyRankedUnitSnapshotStats(recipient, properties({ ...linked, maxHp: 18, hp: 18, baseArmor: 8 }));
        const later = structuredClone(f.record);
        later.sequence++;
        const laterRecipient = later.stateAfter.units.find((unit) => unit.properties.id === "recipient")!;
        laterRecipient.properties.max_hp = 12;
        laterRecipient.properties.base_armor = 7;

        const second = f.scene.playSandboxReplayRecord(later);
        f.impact();

        expect(recipient.getMaxHp()).toBe(12);
        expect(recipient.getHp()).toBe(12);
        expect(recipient.getBaseArmor()).toBe(7);
        expect(recipient.getAmountAlive()).toBe(10);
        expect(await second).toBe(true);
        expect(Reflect.get(f.scene, "currentReplayImpactRecord")).toBeUndefined();
    });
});
