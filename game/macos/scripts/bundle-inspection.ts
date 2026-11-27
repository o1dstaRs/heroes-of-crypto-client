import { writeFileSync } from "node:fs";
import { join } from "node:path";

import abilities from "../../heroes-of-crypto-common/src/configuration/abilities.json";
import auras from "../../heroes-of-crypto-common/src/configuration/aura_effects.json";
import { getAbilityConfig, getSpellConfig } from "../../heroes-of-crypto-common/src/configuration/config_provider";
import effects from "../../heroes-of-crypto-common/src/configuration/effects.json";
import spells from "../../heroes-of-crypto-common/src/configuration/spells.json";
import { NUMBER_OF_LAPS_TOTAL } from "../../heroes-of-crypto-common/src/constants";

export const inspectionSpellNames = Object.values(spells).flatMap((faction) =>
    typeof faction === "object" ? Object.keys(faction) : [],
);

export function bundleInspection(output: string, abilityDescriptions: ReadonlyMap<string, string>): void {
    const spellDetails = Object.entries(spells).flatMap(([faction, entries]) =>
        typeof entries !== "object"
            ? []
            : Object.keys(entries).map((name) => {
                  const { desc, power, minimal_caster_stack_power } = getSpellConfig(faction, name);
                  return [
                      name,
                      {
                          description: desc.join(" ").replaceAll("{}", String(power)),
                          applied: desc
                              .filter((line) => !line.startsWith("Lasts "))
                              .join(" ")
                              .replace(/^Level \[\]\. /, ""),
                          stackPower: minimal_caster_stack_power,
                      },
                  ] as const;
              }),
    );
    const abilityDetails = Object.entries(abilities).flatMap(([name, definition]) => {
        if (typeof definition !== "object") return [];
        const { desc, power, stack_powered } = getAbilityConfig(name);
        const description = abilityDescriptions.get(name) || desc.join("\n").replaceAll("{}", String(power));
        return [[name, { description, stackPowered: stack_powered }] as const];
    });
    const statusDescriptions = (definitions: Record<string, number | { desc: string }>) =>
        Object.fromEntries(
            Object.entries(definitions).flatMap(([name, value]) =>
                typeof value === "object" ? [[name, value.desc]] : [],
            ),
        );
    writeFileSync(
        join(output, "unit-inspection.json"),
        JSON.stringify({
            abilities: Object.fromEntries(abilityDetails),
            spells: Object.fromEntries(spellDetails),
            effects: statusDescriptions(effects),
            auras: statusDescriptions(auras),
            wholeBattle: NUMBER_OF_LAPS_TOTAL,
        }),
    );
}
