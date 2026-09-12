import { expect, test } from "bun:test";

import { FactionVals, type UnitProperties } from "@heroesofcrypto/common";
import React from "react";

import { DeferredUnitStatsListItem } from "./DeferredUnitStatsListItem";
import type { UnitStatsListItemProps } from "./unitStatsMemo";

const emptySelection: UnitStatsListItemProps = {
    unitProperties: {} as UnitProperties,
    overallImpact: { abilities: [], buffs: [], debuffs: [] },
    factionType: FactionVals.NO_FACTION,
};

test("hovering or selecting a creature loads its card without a faction selection", () => {
    const props = {
        ...emptySelection,
        unitProperties: { id: "peasant", name: "Peasant", amount_alive: 200 } as UnitProperties,
    };
    const card = DeferredUnitStatsListItem(props);

    expect(React.isValidElement(card)).toBe(true);
    if (!React.isValidElement<{ children: React.ReactElement<UnitStatsListItemProps> }>(card)) {
        throw new Error("Expected the deferred creature card");
    }
    expect(card.type).toBe(React.Suspense);
    expect(card.props.children.props).toEqual(props);
});

test("an empty sidebar does not load the stats module", () => {
    const card = DeferredUnitStatsListItem(emptySelection);

    expect(React.isValidElement(card)).toBe(true);
    if (!React.isValidElement(card)) throw new Error("Expected the empty sidebar item");
    expect(card.type).not.toBe(React.Suspense);
});

test("a faction selection still loads the card without a creature", () => {
    const factionType = Object.values(FactionVals).find((value) => typeof value === "number" && value !== 0);
    if (typeof factionType !== "number") throw new Error("Expected a selectable faction");
    const card = DeferredUnitStatsListItem({ ...emptySelection, factionType });

    expect(React.isValidElement(card)).toBe(true);
    if (!React.isValidElement(card)) throw new Error("Expected the deferred faction card");
    expect(card.type).toBe(React.Suspense);
});
