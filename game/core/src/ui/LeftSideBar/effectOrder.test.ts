import { describe, expect, test } from "bun:test";
import { orderSidebarBuffs, orderSidebarDebuffs } from "./effectOrder";

const eff = (name: string, description = "") => ({ name, description });
const names = (list: { name: string }[]) => list.map((e) => e.name);

/**
 * Owner call: the LEFT sidebar reads MOST RECENT FIRST — the newest effect sits leftmost.
 *
 * Arrival order is the input order (the engine appends as effects land), so "most recent first" is the
 * reverse of it. Buffs keep their grouping — augments, artifacts, per-turn traffic — because that is what
 * stops an effect jumping groups when a neighbour expires; reversing the FINISHED list keeps each group
 * contiguous while putting the per-turn traffic, the part that actually changes, in front.
 */
describe("left sidebar effect order", () => {
    test("debuffs read newest first", () => {
        const arrived = [eff("Poison"), eff("Slow"), eff("Break")];
        expect(names(orderSidebarDebuffs(arrived))).toEqual(["Break", "Slow", "Poison"]);
    });

    test("does not mutate the caller's array", () => {
        // The list comes straight from props; reversing in place would reorder it for every other reader.
        const arrived = [eff("Poison"), eff("Slow")];
        orderSidebarDebuffs(arrived);
        expect(names(arrived)).toEqual(["Poison", "Slow"]);
    });

    test("buffs lead with the newest per-turn effect and end with the augments", () => {
        const arrived = [
            eff("Armor Augment"),
            eff("Might Augment"),
            eff("Ring of Life", "Artifact. Adds HP."),
            eff("Courage"),
            eff("Blessing"),
        ];
        // Arrival-order grouping would be [augments, artifact, per-turn]; reversed it leads with the
        // newest per-turn buff and trails with the augments.
        expect(names(orderSidebarBuffs(arrived))).toEqual([
            "Blessing",
            "Courage",
            "Ring of Life",
            "Might Augment",
            "Armor Augment",
        ]);
    });

    test("each group stays contiguous, so nothing jumps groups when a neighbour expires", () => {
        const withCourage = [eff("Armor Augment"), eff("Courage"), eff("Ring of Life", "Artifact. X"), eff("Haste")];
        const expired = withCourage.filter((e) => e.name !== "Courage");
        // Removing a per-turn buff must not move the artifact out of its block or reorder the augment.
        expect(names(orderSidebarBuffs(withCourage))).toEqual(["Haste", "Courage", "Ring of Life", "Armor Augment"]);
        expect(names(orderSidebarBuffs(expired))).toEqual(["Haste", "Ring of Life", "Armor Augment"]);
    });

    test("empty input is empty output", () => {
        expect(orderSidebarBuffs([])).toEqual([]);
        expect(orderSidebarDebuffs([])).toEqual([]);
    });
});
