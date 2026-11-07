import { expect, test } from "bun:test";
import { Container, Graphics } from "pixi.js";

import { ParalysisStatusVfx, type ParalysisStatusUnit } from "./ParalysisStatusVfx";

function fixture() {
    const root = new Container();
    let affected = false;
    let dead = false;
    let pending = false;
    let frame = { x: 100, y: 200, width: 64, height: 80, zIndex: 4000 };
    const unit: ParalysisStatusUnit = {
        isDead: () => dead,
        getUnitProperties: () => ({ applied_effects: affected ? ["Paralysis"] : [] }),
    };
    const units = new Map([["victim", unit]]);
    const layer = new ParalysisStatusVfx({
        getUnits: () => units,
        getFrame: () => frame,
        isImpactPending: () => pending,
        attach: (node) => {
            root.addChild(node);
        },
    });
    return {
        root,
        layer,
        units,
        affected: (value: boolean) => {
            affected = value;
        },
        dead: () => {
            dead = true;
        },
        pending: (value: boolean) => {
            pending = value;
        },
        frame: (value: typeof frame) => {
            frame = value;
        },
    };
}

test("Paralysis remains visible for the status duration, follows hydration and clears on cure", () => {
    const f = fixture();
    try {
        f.layer.update(0.1);
        expect(f.root.children).toHaveLength(0);
        f.affected(true);
        f.layer.update(0.1);
        const node = f.root.children[0] as Graphics;
        expect(node.label).toBe("paralysis-status-field");
        expect(node.eventMode).toBe("none");
        expect(node.context.instructions.length).toBeGreaterThan(0);
        expect(node.x).toBe(100);
        expect(node.y).toBe(200);
        f.layer.update(10);
        expect(node.destroyed).toBe(false);
        f.units.set("victim", { isDead: () => false, getUnitProperties: () => ({ applied_debuffs: ["Paralysis"] }) });
        f.frame({ x: 250, y: 350, width: 128, height: 80, zIndex: 4100 });
        f.layer.update(0.1);
        expect(f.root.children).toHaveLength(1);
        expect(node.x).toBe(250);
        expect(node.scale.x).toBe(128);
        expect(node.zIndex).toBe(4100);
        f.units.set("victim", { isDead: () => false, getUnitProperties: () => ({ applied_debuffs: [] }) });
        f.layer.update(0.1);
        expect(node.destroyed).toBe(true);
    } finally {
        f.layer.clear();
        f.root.destroy({ children: true });
    }
});

test("ranked pre-impact status waits for contact; the proc explicitly releases its recipient", () => {
    const f = fixture();
    try {
        f.pending(true);
        f.affected(true);
        f.layer.update(0.1);
        expect(f.root.children).toHaveLength(0);
        f.layer.present("victim");
        f.layer.update(0.1);
        const node = f.root.children[0];
        expect(node).toBeDefined();
        f.affected(false);
        f.layer.update(0.1);
        expect(node.destroyed).toBe(false);
        f.pending(false);
        f.layer.update(0.1);
        expect(node.destroyed).toBe(true);
    } finally {
        f.layer.clear();
        f.root.destroy({ children: true });
    }
});

test("death, removal, invalid frames and scene cleanup leave no electric field", () => {
    for (const reason of ["dead", "removed", "invalid", "clear"]) {
        const f = fixture();
        try {
            f.affected(true);
            f.layer.update(0.1);
            const node = f.root.children[0];
            if (reason === "dead") f.dead();
            if (reason === "removed") f.units.clear();
            if (reason === "invalid") f.frame({ x: NaN, y: 0, width: 64, height: 80, zIndex: 4000 });
            if (reason === "clear") {
                f.layer.clear();
                expect(node.destroyed).toBe(true);
                expect(f.root.children).toHaveLength(0);
                continue;
            }
            f.layer.update(0.1);
            if (reason === "invalid") expect(node.visible).toBe(false);
            else expect(node.destroyed).toBe(true);
        } finally {
            f.layer.clear();
            f.root.destroy({ children: true });
        }
    }
});

test("a unit awaiting hydration does not enter game-rule accessors to draw a status", () => {
    const f = fixture();
    try {
        f.units.set("victim", { isDead: () => false, getUnitProperties: () => undefined });
        expect(() => f.layer.update(0.1)).not.toThrow();
        expect(f.root.children).toHaveLength(0);
    } finally {
        f.layer.clear();
        f.root.destroy({ children: true });
    }
});
