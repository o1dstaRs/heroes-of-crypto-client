import { describe, expect, test } from "bun:test";
import {
    AbilityFactory,
    EffectFactory,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";

import { RenderableUnit } from "./RenderableUnit";
import { FIGHT_EVENT_VFX } from "./testSupport/fightVfxCatalog";

describe("Dulling Defense VFX wiring", () => {
    test("is driven by authoritative effect applications", () => {
        expect(FIGHT_EVENT_VFX.effects_applied.rendered).toBe(true);
        expect(FIGHT_EVENT_VFX.effects_applied.ranked).toBe("replay");
        expect(FIGHT_EVENT_VFX.effects_applied.note).toContain("Dulling Defense");
        expect(FIGHT_EVENT_VFX.effects_applied.note).toContain("impact");
    });

    test("the ability card prints the flat attack loss, not a stack-and-luck count", () => {
        const effects = new EffectFactory();
        const knight = RenderableUnit.fromBase(
            Unit.createUnit(
                HoCConfig.getCreatureConfig(TeamVals.LEFT, "Chaos", "Goblin Knight", "", 10),
                new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06),
                TeamVals.LEFT,
                UnitVals.CREATURE,
                new AbilityFactory(effects),
                effects,
                false,
            ),
            () => undefined,
        ) as unknown as RenderableUnit & { refreshAbilitiesDescriptions(synergyIncrease: number): void };
        const power = knight.getAbility("Dulling Defense")!.getPower();
        const card = () => {
            const properties = knight.getUnitProperties();
            return properties.abilities_descriptions[properties.abilities.indexOf("Dulling Defense")];
        };
        for (const stackPower of [1, 5]) {
            knight.setStackPower(stackPower);
            knight.refreshAbilitiesDescriptions(0);
            expect(card()).toEndWith(`base attack by ${power}`);
        }
    });
});
