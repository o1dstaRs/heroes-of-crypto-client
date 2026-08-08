import type { FactionType, UnitProperties } from "@heroesofcrypto/common";

import type { IVisibleOverallImpact } from "../../scenes/VisibleState";

export type UnitStatsListItemProps = {
    unitProperties: UnitProperties;
    overallImpact: IVisibleOverallImpact;
    factionType: FactionType;
};

export const areUnitStatsPropsEqual = (prev: UnitStatsListItemProps, next: UnitStatsListItemProps) => {
    if (prev.factionType !== next.factionType) return false;
    // setSelectedUnitProperties rebuilds this object when an existing ranked RenderableUnit is reconciled
    // in place. Check it before the unit identity shortcut: the unit reference can stay identical while
    // live primitives such as remaining shots have changed underneath the previous React props.
    if (prev.overallImpact !== next.overallImpact) return false;
    const pUnit = prev.unitProperties;
    const nUnit = next.unitProperties;
    if (pUnit === nUnit) return true;
    if (!pUnit || !nUnit) return false;
    if (
        pUnit.id !== nUnit.id ||
        pUnit.amount_alive !== nUnit.amount_alive ||
        pUnit.hp !== nUnit.hp ||
        pUnit.steps !== nUnit.steps ||
        pUnit.name !== nUnit.name
    )
        return false;
    if (
        pUnit.attack_mod !== nUnit.attack_mod ||
        pUnit.attack_multiplier !== nUnit.attack_multiplier ||
        pUnit.armor_mod !== nUnit.armor_mod ||
        pUnit.steps_mod !== nUnit.steps_mod ||
        pUnit.luck_mod !== nUnit.luck_mod ||
        pUnit.range_shots !== nUnit.range_shots ||
        pUnit.range_shots_mod !== nUnit.range_shots_mod ||
        pUnit.magic_resist_mod !== nUnit.magic_resist_mod
    )
        return false;
    return true;
};
