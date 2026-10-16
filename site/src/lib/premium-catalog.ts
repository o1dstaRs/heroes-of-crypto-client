import { CreatureVals } from "@heroesofcrypto/common";
import { creatureInfo } from "@heroesofcrypto/common/src/ai/setup/creature_score";
import { TIER1_ARTIFACT_LIST, TIER2_ARTIFACT_LIST } from "@heroesofcrypto/common/src/artifacts/artifact_properties";
import { DOCTRINE_LIST } from "@heroesofcrypto/common/src/doctrines/doctrine_properties";
import { knowledgeEntryId } from "./knowledge-base";
import { allUnits } from "./units-data";
import { artifacts } from "./artifacts-data";
import type { PremiumCatalog } from "./premium-library";

export function premiumCatalog(lang: "en" | "ru"): PremiumCatalog {
    const units: PremiumCatalog["units"] = {};
    for (const id of Object.values(CreatureVals)) {
        if (typeof id !== "number" || id <= 0) continue;
        const info = creatureInfo(id);
        const unit = allUnits.find((unit) => unit.name === info?.name);
        if (unit)
            units[id] = {
                name: unit.name,
                slug: unit.slug,
                anchor: knowledgeEntryId("units", unit.name),
                level: unit.level,
                faction: unit.faction,
            };
    }
    return {
        units,
        artifacts: Object.fromEntries(
            [TIER1_ARTIFACT_LIST, TIER2_ARTIFACT_LIST].flatMap((list, index) =>
                list.map((props) => {
                    const artifact = artifacts.find((item) => item.tier === index + 1 && item.slug === props.slug)!;
                    return [
                        `${index + 1}:${props.id}`,
                        {
                            name: artifact.name,
                            icon: artifact.icon,
                            slug: artifact.slug,
                            anchor: knowledgeEntryId("artifacts", artifact.name),
                            description: lang === "ru" ? artifact.descriptionRu : artifact.description,
                        },
                    ];
                }),
            ),
        ),
        doctrines: Object.fromEntries(
            DOCTRINE_LIST.map((item) => [
                item.id,
                { name: item.name, points: item.upgradePoints, description: item.description },
            ]),
        ),
    };
}
