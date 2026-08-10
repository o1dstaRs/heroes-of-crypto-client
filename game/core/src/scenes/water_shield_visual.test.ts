import { Unit } from "@heroesofcrypto/common";
import { describe, expect, it } from "bun:test";

/**
 * The Water Shield ring must follow the SERVER's buff list, not the client's local seeding.
 *
 * Live report (owner): an Arachna Queen that assimilated Water Shield off a Mermaid carried the shield
 * mechanically but showed no ring. In ranked the client only ever populates the buff OBJECT array from
 * its own seeding pass (trySeedWaterShield, which requires the unit to carry the Water Shield ABILITY),
 * so a shield the server granted any other way lived exclusively in the authoritative `applied_buffs`
 * display list — where the visual gate never looked.
 *
 * These exercise common's REAL lookups (bound to a minimal stand-in rather than a full textured unit) so
 * the contract the ring depends on is pinned where it actually lives, not re-implemented here.
 */

interface BuffLike {
    getName(): string;
}

const buff = (name: string): BuffLike => ({ getName: () => name });

/** A stand-in carrying only what the two lookups read: the buff objects and the display list. */
const unitWith = (buffObjects: BuffLike[], appliedBuffs: string[]) => {
    // hasStatusBuffApplied calls through to hasBuffActive on `this`, so the stand-in carries both real
    // prototype methods rather than only the one under test.
    const stub = {
        getBuffs: () => buffObjects,
        unitProperties: { applied_buffs: appliedBuffs },
        hasBuffActive: Unit.prototype.hasBuffActive,
    };
    return {
        /** What the ring used to ask — object array only. */
        hasBuffActive: (name: string): boolean =>
            (Unit.prototype.hasBuffActive as (this: unknown, n: string) => boolean).call(stub, name),
        /** What the ring asks now — either channel. */
        hasStatusBuff: (name: string): boolean =>
            (Unit.prototype.hasStatusBuffApplied as (this: unknown, n: string) => boolean).call(stub, name),
    };
};

describe("Water Shield ring visibility", () => {
    it("lights for a server-granted shield the client never seeded locally (the Arachna Queen case)", () => {
        // Ranked: the snapshot lists the buff, but the client seeded no object for it because the Queen
        // does not natively carry the ability.
        const queen = unitWith([], ["Water Shield"]);

        expect(queen.hasBuffActive("Water Shield")).toBe(false);
        expect(queen.hasStatusBuff("Water Shield")).toBe(true);
    });

    it("still lights for a natively-seeded shield (sandbox, and any ranked unit with the ability)", () => {
        const mermaid = unitWith([buff("Water Shield")], []);
        expect(mermaid.hasStatusBuff("Water Shield")).toBe(true);
    });

    it("goes dark once the shield breaks and leaves both channels", () => {
        expect(unitWith([], []).hasStatusBuff("Water Shield")).toBe(false);
        // A different buff must never light it.
        expect(unitWith([buff("Hidden")], ["Magic Mirror"]).hasStatusBuff("Water Shield")).toBe(false);
    });
});
