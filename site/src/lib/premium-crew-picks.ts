import {
    applyCreatureRoleFitMultiplier,
    creatureInfo,
    creatureRoleFitMultiplier,
    rankedSpellRangedCoPlayAffinity,
    scoreCreature,
} from "@heroesofcrypto/common/src/ai/setup/creature_score";
import {
    CREW_LEVELS,
    premiumCrewArtifactBenefit,
    premiumCrewArtifacts,
    premiumCrewSlots,
    premiumCrewSynergies,
    premiumCrewSynergyEffect,
} from "./premium-crew";
import type { PremiumCatalog, PremiumLibrary, PremiumRow } from "./premium-library";

type Lang = "en" | "ru";
export interface CrewPickSignal {
    kind: "synergy" | "lost-synergy" | "role" | "pair";
    text: string;
    faction?: string;
    detail?: string;
}
export interface PremiumCrewPick {
    id: number;
    selected: boolean;
    current: boolean;
    score: number;
    signals: CrewPickSignal[];
    artifacts: (ReturnType<typeof premiumCrewArtifacts>[number] & {
        benefit: ReturnType<typeof premiumCrewArtifactBenefit>;
    })[];
    evidence?: PremiumRow;
}

const factionNames: Record<string, string> = { Life: "Жизнь", Nature: "Природа", Chaos: "Хаос", Might: "Сила" };

/** A planner's crew-fit order, not a win probability or a claim to reproduce a live draft. */
export function rankPremiumCrewPicks(
    ids: readonly number[],
    slot: number,
    catalog: PremiumCatalog,
    library?: PremiumLibrary | null,
    lang: Lang = "en",
): PremiumCrewPick[] {
    if (!Number.isInteger(slot) || slot < 0 || slot >= CREW_LEVELS.length) return [];
    const slots = premiumCrewSlots(ids, catalog);
    const others = slots.filter((id, index): id is number => id !== undefined && index !== slot);
    const own = others.flatMap((id) => creatureInfo(id) ?? []);
    const baseline = premiumCrewSynergies(ids, catalog);
    const rows = new Map(library?.units.map((row) => [row.ids[0], row]));
    const candidates = Object.entries(catalog.units)
        .filter(([, item]) => item.level === CREW_LEVELS[slot] && item.kit?.amount)
        .map(([id]) => Number(id));
    const strengths = candidates.map((id) =>
        applyCreatureRoleFitMultiplier(scoreCreature(id), creatureRoleFitMultiplier(id, others, [])),
    );
    const scale = Math.max(1, ...strengths.map(Math.abs));
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    return candidates
        .map((id, index): PremiumCrewPick => {
            const item = catalog.units[id];
            const info = creatureInfo(id);
            const crew = others.includes(id) ? [...ids] : [...others, id];
            const synergies = premiumCrewSynergies(crew, catalog);
            const signals: CrewPickSignal[] = [];
            let fit = rankedSpellRangedCoPlayAffinity(id, others);
            for (const bonus of synergies) {
                const previous = baseline.find((row) => row.faction === bonus.faction);
                const name = lang === "ru" ? factionNames[bonus.faction] : bonus.faction;
                if (bonus.level > (previous?.level ?? 0)) {
                    fit += 0.2 * (bonus.level - (previous?.level ?? 0));
                    signals.push({
                        kind: "synergy",
                        faction: bonus.faction,
                        text: t(`${name} level ${bonus.level}`, `${name}: уровень ${bonus.level}`),
                        detail:
                            bonus.variants
                                .map(({ variant, power }) =>
                                    premiumCrewSynergyEffect(bonus.faction, variant, power, lang),
                                )
                                .join(" / ") +
                            " · " +
                            t("One variant is rolled per match.", "В матче выпадает один вариант."),
                    });
                } else if (bonus.faction === item.faction && bonus.count > (previous?.count ?? 0) && bonus.level < 3) {
                    fit += 0.04;
                    signals.push({
                        kind: "synergy",
                        faction: bonus.faction,
                        text: t(`${name} ${bonus.count}/${bonus.next}`, `${name}: ${bonus.count}/${bonus.next}`),
                    });
                }
            }
            for (const previous of baseline.filter((row) => row.level > 0)) {
                const level = synergies.find((row) => row.faction === previous.faction)?.level ?? 0;
                if (level >= previous.level) continue;
                fit -= 0.2 * (previous.level - level);
                const name = lang === "ru" ? factionNames[previous.faction] : previous.faction;
                signals.push({
                    kind: "lost-synergy",
                    faction: previous.faction,
                    text: t(`${name} drops to L${level}`, `${name}: снижение до ${level}`),
                });
            }
            if (info?.melee && own.some((unit) => unit.ranged || unit.caster) && !own.some((unit) => unit.melee)) {
                fit += 0.12;
                signals.push({ kind: "role", text: t("Adds a melee unit", "Добавит ближний бой") });
            }
            if (info?.ranged && !own.some((unit) => unit.ranged)) {
                fit += 0.12;
                signals.push({ kind: "role", text: t("Adds ranged damage", "Добавит стрелковый урон") });
            }
            if (creatureRoleFitMultiplier(id, others, []) > 1)
                signals.push({
                    kind: "role",
                    text:
                        info?.name === "Healer"
                            ? t("Heals your front line", "Лечит переднюю линию")
                            : t("Pairs with your Healer", "Подходит вашему Healer"),
                });
            if (rankedSpellRangedCoPlayAffinity(id, others) > 0)
                signals.push({ kind: "role", text: t("Spell damage pairing", "Совместный магический урон") });
            const pair = (library?.pairs ?? [])
                .filter(
                    (row) =>
                        row.families >= 50 &&
                        row.ids.length === 2 &&
                        row.ids.includes(id) &&
                        row.ids.every((ally) => ally === id || others.includes(ally)),
                )
                .sort((a, b) => b.interval[0] - a.interval[0] || b.families - a.families)[0];
            if (pair) {
                fit += 0.12 * Math.max(0, pair.interval[0] - 0.5);
                const ally = catalog.units[pair.ids.find((ally) => ally !== id)!];
                if (ally)
                    signals.push({
                        kind: "pair",
                        text: t(`Recorded with ${ally.name}`, `Есть бои с ${ally.name}`),
                    });
            }
            const artifacts = premiumCrewArtifacts(crew, catalog).map((artifact) => ({
                ...artifact,
                benefit: premiumCrewArtifactBenefit(artifact.item.slug, crew, lang),
            }));
            const artifactFit = artifacts.reduce((sum, artifact) => {
                return sum + artifact.benefit.names.length / Math.max(1, crew.length);
            }, 0);
            const evidence = rows.get(id);
            // Keep sample-size-qualified historical results bounded; they are associations, not simulated swaps.
            const history = evidence && evidence.families >= 50 ? 0.3 * (evidence.interval[0] - 0.5) : 0;
            return {
                id,
                selected: ids.includes(id),
                current: slots[slot] === id,
                score: strengths[index] / scale + fit + 0.04 * artifactFit + history,
                signals,
                artifacts,
                evidence,
            };
        })
        .sort(
            (a, b) =>
                Number(a.selected) - Number(b.selected) ||
                b.score - a.score ||
                catalog.units[a.id].name.localeCompare(catalog.units[b.id].name),
        );
}

/** Find a legal slot to edit toward the next faction threshold without counting the replaced unit. */
export function premiumCrewFactionSlot(
    ids: readonly number[],
    faction: string,
    catalog: PremiumCatalog,
    library?: PremiumLibrary | null,
): number | undefined {
    const slots = premiumCrewSlots(ids, catalog);
    return slots
        .flatMap((id, slot) => {
            if (id !== undefined && catalog.units[id].faction === faction) return [];
            const picks = rankPremiumCrewPicks(ids, slot, catalog, library);
            const pick = picks.find(
                (candidate) => !candidate.selected && catalog.units[candidate.id].faction === faction,
            );
            const current = picks.find((candidate) => candidate.current)?.score ?? 0;
            return pick ? [{ slot, gain: pick.score - current }] : [];
        })
        .sort((a, b) => b.gain - a.gain || a.slot - b.slot)[0]?.slot;
}
