import { afterEach, describe, expect, spyOn, test } from "bun:test";
import type { GridSettings, UnitsHolder } from "@heroesofcrypto/common";
import { Container, Graphics } from "pixi.js";

import { CombatVisuals } from "./CombatVisuals";
import { HelpingHandLinks, type HelpingHandUnit } from "./HelpingHandLinks";

const roots: Container[] = [];
afterEach(() => {
    for (const root of roots) root.destroy({ children: true });
    roots.length = 0;
});

const makeUnit = (x: number, y: number) => ({
    properties: {
        applied_buffs: [] as string[],
        applied_buffs_laps: [] as number[],
        helping_hand_caster_id: undefined as string | undefined,
        helping_hand_penalty_id: undefined as string | undefined,
    },
    position: { x, y },
    dead: false,
    displayedAmount: 10,
    buffActive: false,
    getUnitProperties() {
        return this.properties;
    },
    hasBuffActive(name: string) {
        return name === "Helping Hand" && this.buffActive;
    },
    isDead() {
        return this.dead;
    },
    getDisplayedAmount() {
        return this.displayedAmount;
    },
    getVisualCenter() {
        return this.position;
    },
});

const setup = () => {
    const root = new Container();
    roots.push(root);
    const caster = makeUnit(100, 200);
    const recipient = makeUnit(400, 250);
    recipient.properties.helping_hand_caster_id = "caster";
    recipient.properties.helping_hand_penalty_id = "caster";
    recipient.buffActive = true;
    const units = new Map<string, HelpingHandUnit>([
        ["caster", caster],
        ["recipient", recipient],
    ]);
    const settings = { getCellSize: () => 64 } as GridSettings;
    const attachToWorldRoot = (container: Container, zIndex: number): void => {
        container.zIndex = zIndex;
        root.addChild(container);
    };
    const layer = new HelpingHandLinks({
        getUnits: () => units,
        getGridSettings: () => settings,
        attachToWorldRoot,
    });
    return { root, caster, recipient, units, settings, layer, attachToWorldRoot };
};

const linePoints = (layer: HelpingHandLinks, dt: number): number[][] => {
    const lines = spyOn(Graphics.prototype, "lineTo");
    try {
        layer.update(dt);
        return lines.mock.calls.map(([x, y]) => [x, y]);
    } finally {
        lines.mockRestore();
    }
};

describe("Helping Hand spiritual links", () => {
    test("keeps a fixed primitive budget without textures, filters, game RNG or unit mutations", () => {
        const f = setup();
        const before = JSON.stringify([...f.units.values()].map((unit) => unit.getUnitProperties()));
        const random = spyOn(Math, "random");
        try {
            f.layer.update(0);
            const graphics = f.root.children[0] as Graphics;
            expect(graphics).toBeInstanceOf(Graphics);
            expect(graphics.blendMode).toBe("add");
            expect(graphics.eventMode).toBe("none");
            expect(graphics.filters?.length ?? 0).toBe(0);
            expect(graphics.children).toHaveLength(0);
            expect(graphics.context.instructions).toHaveLength(23);
            for (let frame = 0; frame < 240; frame++) f.layer.update(1 / 60);
            expect(f.root.children).toEqual([graphics]);
            expect(graphics.context.instructions).toHaveLength(23);
            expect(random).not.toHaveBeenCalled();
            expect(JSON.stringify([...f.units.values()].map((unit) => unit.getUnitProperties()))).toBe(before);
        } finally {
            random.mockRestore();
        }
    });

    test("uses hydrated active buff laps when the client has no live AppliedSpell", () => {
        const f = setup();
        f.recipient.buffActive = false;
        f.recipient.properties.applied_buffs = ["Courage", "Helping Hand"];
        f.recipient.properties.applied_buffs_laps = [0, 2];
        f.layer.update(0);
        expect(f.layer.active).toBe(true);
        f.recipient.properties.applied_buffs_laps[1] = 0;
        f.layer.update(0);
        expect(f.layer.active).toBe(false);
        expect(f.root.children).toHaveLength(0);
    });

    test.each([
        "caster dies",
        "recipient dies",
        "caster removed",
        "recipient removed",
        "buff expires",
        "caster metadata removed",
        "penalty metadata removed",
    ])("removes the link immediately when %s, without a death fade", (reason) => {
        const f = setup();
        f.layer.update(0);
        const graphics = f.root.children[0] as Graphics;
        if (reason === "caster dies") f.caster.dead = true;
        if (reason === "recipient dies") f.recipient.dead = true;
        if (reason === "caster removed") f.units.delete("caster");
        if (reason === "recipient removed") f.units.delete("recipient");
        if (reason === "buff expires") f.recipient.buffActive = false;
        if (reason === "caster metadata removed") f.recipient.properties.helping_hand_caster_id = undefined;
        if (reason === "penalty metadata removed") f.recipient.properties.helping_hand_penalty_id = undefined;
        f.layer.update(0);
        expect(graphics.destroyed).toBe(true);
        expect(f.layer.active).toBe(false);
        expect(f.root.children).toHaveLength(0);
    });

    test("follows replacement units and both visual centers through a mirrored, vertically stretched board", () => {
        const f = setup();
        f.root.scale.set(-0.7, -0.5);
        f.root.position.set(800, 600);
        f.layer.update(0);
        const graphics = f.root.children[0] as Graphics;
        const caster = makeUnit(180, 210);
        const recipient = makeUnit(480, 370);
        recipient.properties = { ...f.recipient.properties };
        recipient.buffActive = true;
        f.units.set("caster", caster);
        f.units.set("recipient", recipient);
        const points = linePoints(f.layer, 0);
        expect(f.root.children).toEqual([graphics]);
        expect(graphics.position).toMatchObject(caster.position);
        for (const index of [15, 31, 47, 63, 79]) expect(points[index]).toEqual([300, 160]);
        expect(graphics.toGlobal({ x: 0, y: 0 })).toEqual(f.root.toGlobal(caster.position));
        expect(graphics.toGlobal({ x: 300, y: 160 })).toEqual(f.root.toGlobal(recipient.position));
    });

    test("a replacement caster or penalty holder retires the old link instead of accumulating strands", () => {
        const f = setup();
        f.layer.update(0);
        const first = f.root.children[0];
        f.units.set("second-caster", makeUnit(50, 90));
        f.recipient.properties.helping_hand_caster_id = "second-caster";
        f.layer.update(0);
        expect(first.destroyed).toBe(true);
        expect(f.root.children).toHaveLength(1);
        const second = f.root.children[0];
        expect(second.position).toMatchObject({ x: 50, y: 90 });
        f.recipient.properties.helping_hand_penalty_id = "second-caster";
        f.layer.update(0);
        expect(second.destroyed).toBe(true);
        expect(f.root.children).toHaveLength(1);
    });

    test.each(["caster", "recipient"] as const)(
        "holds a captured link after the local %s dies until its displayed stack reaches impact",
        (endpoint) => {
            const f = setup();
            f.layer.update(0);
            f.layer.capturePresentation();
            const graphics = f.root.children[0];
            f[endpoint].dead = true;
            f.recipient.buffActive = false;
            f.recipient.properties.helping_hand_caster_id = undefined;
            f.recipient.properties.helping_hand_penalty_id = undefined;
            f.units.delete(endpoint);
            f.caster.position = { x: 120, y: 230 };
            f.recipient.position = { x: 450, y: 270 };
            f.layer.update(0.2);
            expect(f.root.children).toEqual([graphics]);
            expect(graphics.position).toMatchObject(f.caster.position);
            f[endpoint].displayedAmount = 0;
            f.layer.update(0);
            expect(graphics.destroyed).toBe(true);
            expect(f.layer.active).toBe(false);
            f[endpoint].displayedAmount = 10;
            f.layer.update(0);
            expect(f.layer.active).toBe(false);
        },
    );

    test("capture can precede the first rendered frame, and clear releases its endpoint references", () => {
        const f = setup();
        f.layer.capturePresentation();
        f.caster.dead = true;
        f.recipient.properties.helping_hand_caster_id = undefined;
        f.recipient.properties.helping_hand_penalty_id = undefined;
        f.units.delete("caster");
        f.layer.update(0);
        expect(f.layer.active).toBe(true);
        f.layer.clear();
        f.layer.update(0);
        expect(f.layer.active).toBe(false);
        expect(f.root.children).toHaveLength(0);
    });

    test("expiry or dispel drops a captured link immediately and a later death cannot revive it", () => {
        const f = setup();
        f.layer.update(0);
        f.layer.capturePresentation();
        f.recipient.buffActive = false;
        f.recipient.properties.helping_hand_caster_id = undefined;
        f.recipient.properties.helping_hand_penalty_id = undefined;
        f.layer.update(0);
        expect(f.layer.active).toBe(false);
        f.caster.dead = true;
        f.layer.update(0);
        expect(f.layer.active).toBe(false);
    });

    test("new casts after capture remain state-based and never inherit an older cast's presentation hold", () => {
        const f = setup();
        f.layer.update(0);
        f.layer.capturePresentation();
        f.recipient.properties.helping_hand_penalty_id = "cast-2";
        f.layer.update(0);
        expect(f.layer.active).toBe(true);
        f.caster.dead = true;
        f.recipient.properties.helping_hand_caster_id = undefined;
        f.recipient.properties.helping_hand_penalty_id = undefined;
        f.layer.update(0);
        expect(f.layer.active).toBe(false);
    });

    test.each(["caster", "recipient"] as const)(
        "visible %s death ends captured ranked links before another tick",
        (endpoint) => {
            const f = setup();
            f.layer.update(0);
            f.layer.capturePresentation();
            const graphics = f.root.children[0];
            f.recipient.properties.helping_hand_caster_id = undefined;
            f.recipient.properties.helping_hand_penalty_id = undefined;
            f.layer.endForUnit(endpoint);
            expect(graphics.destroyed).toBe(true);
            expect(f.layer.active).toBe(false);
            f.caster.dead = true;
            f.layer.update(0);
            expect(f.layer.active).toBe(false);
        },
    );

    test("ending a visible link cannot recreate that cast from a delayed model, but allows a new cast", () => {
        const f = setup();
        f.layer.update(0);
        f.layer.capturePresentation();
        f.layer.endForUnit("caster");
        f.layer.update(0);
        expect(f.layer.active).toBe(false);
        f.recipient.properties.helping_hand_penalty_id = "cast-2";
        f.layer.update(0);
        expect(f.layer.active).toBe(true);
    });

    test.each(["metadata cleared", "buff expired"])(
        "allows a genuine recast with the same endpoints after observing %s",
        (reason) => {
            const f = setup();
            f.layer.update(0);
            f.layer.capturePresentation();
            f.layer.endForUnit("caster");
            f.layer.update(0);
            expect(f.layer.active).toBe(false);
            if (reason === "metadata cleared") {
                f.recipient.properties.helping_hand_caster_id = undefined;
                f.recipient.properties.helping_hand_penalty_id = undefined;
            } else f.recipient.buffActive = false;
            f.layer.update(0);
            f.recipient.properties.helping_hand_caster_id = "caster";
            f.recipient.properties.helping_hand_penalty_id = "caster";
            f.recipient.buffActive = true;
            f.layer.update(0);
            expect(f.layer.active).toBe(true);
            expect(f.root.children).toHaveLength(1);
        },
    );

    test.each(["displayed death", "impact hook"])(
        "holds a third-party penalty holder's death until its %s without drawing an extra endpoint",
        (finish) => {
            const f = setup();
            const absorber = makeUnit(900, 900);
            f.units.set("absorber", absorber);
            f.recipient.properties.helping_hand_penalty_id = "absorber";
            f.layer.update(0);
            f.layer.capturePresentation();
            const graphics = f.root.children[0];
            absorber.dead = true;
            f.units.delete("absorber");
            f.recipient.properties.helping_hand_caster_id = undefined;
            f.recipient.properties.helping_hand_penalty_id = undefined;
            f.recipient.buffActive = false;
            const points = linePoints(f.layer, 0.2);
            expect(f.caster.isDead()).toBe(false);
            expect(f.recipient.isDead()).toBe(false);
            expect(f.root.children).toEqual([graphics]);
            expect(graphics.position).toMatchObject(f.caster.position);
            for (const index of [15, 31, 47, 63, 79]) expect(points[index]).toEqual([300, 50]);
            if (finish === "impact hook") f.layer.endForUnit("absorber");
            else {
                absorber.displayedAmount = 0;
                f.layer.update(0);
            }
            expect(graphics.destroyed).toBe(true);
            expect(f.layer.active).toBe(false);
            f.layer.update(0);
            expect(f.layer.active).toBe(false);
        },
    );

    test("a displayed empty endpoint removes a live link even before the ranked model changes", () => {
        const f = setup();
        f.layer.update(0);
        f.layer.capturePresentation();
        f.recipient.displayedAmount = 0;
        f.layer.update(0);
        expect(f.layer.active).toBe(false);
    });

    test("advances in seconds independently of frame count and ignores invalid frame deltas", () => {
        const first = setup();
        const second = setup();
        const oneSecond = linePoints(first.layer, 1);
        for (let frame = 0; frame < 59; frame++) second.layer.update(1 / 60);
        const sixtyFrames = linePoints(second.layer, 1 / 60);
        expect(oneSecond).toHaveLength(80);
        expect(sixtyFrames).toHaveLength(80);
        for (let index = 0; index < oneSecond.length; index++) {
            expect(sixtyFrames[index][0]).toBeCloseTo(oneSecond[index][0], 8);
            expect(sixtyFrames[index][1]).toBeCloseTo(oneSecond[index][1], 8);
        }
        for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(linePoints(first.layer, dt)).toEqual(oneSecond);
        }
        expect(linePoints(first.layer, 0.5)).not.toEqual(oneSecond);
    });

    test("supports multiple recipients and immediately releases graphics on clear and world teardown", () => {
        const f = setup();
        const second = makeUnit(350, 450);
        second.buffActive = true;
        second.properties = { ...f.recipient.properties, helping_hand_penalty_id: "cast-2" };
        f.units.set("second-recipient", second);
        f.layer.update(0);
        expect(f.root.children).toHaveLength(2);
        const graphics = [...f.root.children];
        f.layer.clear();
        expect(graphics.every((node) => node.destroyed)).toBe(true);
        expect(f.root.children).toHaveLength(0);
        expect(f.layer.active).toBe(false);
        f.layer.update(0);
        expect(f.root.children).toHaveLength(2);
        f.layer.capturePresentation();
        f.root.destroy({ children: true });
        expect(f.layer.active).toBe(false);
        expect((f.layer as unknown as { presentation: Map<string, unknown> }).presentation.size).toBe(0);
        f.layer.clear();
    });

    test("CombatVisuals updates persistent links while idle and clears them even when detached effects survive hydration", () => {
        const f = setup();
        const visuals = new CombatVisuals({
            getGridSettings: () => f.settings,
            getUnitsHolder: () => ({ getAllUnits: () => f.units }) as unknown as UnitsHolder,
            attachToWorldRoot: f.attachToWorldRoot,
            getSelectedUnitProperties: () => undefined,
            updateSelectedUnitProperties: () => undefined,
            setUnitPropertiesUpdateNeeded: () => undefined,
        });
        visuals.update(0);
        const graphics = f.root.children[0];
        expect(graphics).toBeInstanceOf(Graphics);
        visuals.clear({ keepDetachedOverlays: true });
        expect(graphics.destroyed).toBe(true);
        expect(f.root.children).toHaveLength(0);
        visuals.update(0);
        expect(f.root.children).toHaveLength(1);
        visuals.captureHelpingHandPresentation();
        f.caster.dead = true;
        f.recipient.properties.helping_hand_caster_id = undefined;
        f.recipient.properties.helping_hand_penalty_id = undefined;
        visuals.update(0);
        expect(f.root.children).toHaveLength(1);
        visuals.endHelpingHandLinksForUnit("caster");
        expect(f.root.children).toHaveLength(0);
        visuals.clear();
        expect(f.root.children).toHaveLength(0);
    });
});
