import { CREW_LEVELS, premiumCrewSlots, premiumCrewSynergies, premiumCrewSynergyEffect } from "./premium-crew";
import { CREW_HISTORY_MINIMUM, compareCrewHistory, type PremiumCrewHistory } from "./premium-crew-history";
import type { PremiumCatalog, PremiumLibrary, PremiumRow } from "./premium-library";

type Lang = "en" | "ru";
export interface CrewPickSignal {
    kind: "synergy" | "lost-synergy" | "pair";
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
    contextUnits: number[];
    evidence?: PremiumRow;
}
export interface PremiumCrewRosterPick extends PremiumCrewPick {
    slot: number;
    suggestion?: number;
}
const factionNames: Record<string, string> = { Life: "Жизнь", Nature: "Природа", Chaos: "Хаос", Might: "Сила" };

/** Rank only observed SQLite outcomes in a shared population, using their lower 95% bound. */
export function rankPremiumCrewPicks(
    ids: readonly number[],
    slot: number,
    catalog: PremiumCatalog,
    library?: PremiumLibrary | null,
    lang: Lang = "en",
    history?: PremiumCrewHistory,
): PremiumCrewPick[] {
    if (!Number.isInteger(slot) || slot < 0 || slot >= CREW_LEVELS.length) return [];
    const slots = premiumCrewSlots(ids, catalog);
    const others = slots.filter((id, index): id is number => id !== undefined && index !== slot);
    const baseline = premiumCrewSynergies(ids, catalog);
    const group = history?.slots[slot];
    const rows = new Map((group ? group.rows : (library?.units ?? [])).map((row) => [row.ids[0], row]));
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    return Object.entries(catalog.units)
        .filter(([, item]) => item.level === CREW_LEVELS[slot] && item.kit?.amount)
        .map(([key]): PremiumCrewPick => {
            const id = Number(key);
            const crew = others.includes(id) ? [...ids] : [...others, id];
            const synergies = premiumCrewSynergies(crew, catalog);
            const signals: CrewPickSignal[] = [];
            for (const bonus of synergies) {
                const previous = baseline.find((row) => row.faction === bonus.faction);
                if (bonus.level <= (previous?.level ?? 0)) continue;
                const name = lang === "ru" ? factionNames[bonus.faction] : bonus.faction;
                signals.push({
                    kind: "synergy",
                    faction: bonus.faction,
                    text: t(`${name} level ${bonus.level}`, `${name}: уровень ${bonus.level}`),
                    detail:
                        bonus.variants
                            .map(({ variant, power }) => premiumCrewSynergyEffect(bonus.faction, variant, power, lang))
                            .join(" / ") +
                        " · " +
                        t("One variant is rolled per match.", "В матче выпадает один вариант."),
                });
            }
            for (const previous of baseline.filter((row) => row.level > 0)) {
                const level = synergies.find((row) => row.faction === previous.faction)?.level ?? 0;
                if (level >= previous.level) continue;
                const name = lang === "ru" ? factionNames[previous.faction] : previous.faction;
                signals.push({
                    kind: "lost-synergy",
                    faction: previous.faction,
                    text: t(`${name} drops to L${level}`, `${name}: снижение до ${level}`),
                });
            }
            const evidence = rows.get(id);
            return {
                id,
                selected: ids.includes(id),
                current: slots[slot] === id,
                score: evidence?.interval[0] ?? -1,
                signals,
                contextUnits: group?.contextUnits ?? [],
                evidence,
            };
        })
        .sort(
            (a, b) =>
                Number(a.selected) - Number(b.selected) ||
                compareCrewHistory(a.evidence, b.evidence) ||
                catalog.units[a.id].name.localeCompare(catalog.units[b.id].name),
        );
}

/** A legal way to pursue a requested faction bonus; outcomes remain separate from its rules. */
export function premiumCrewFactionSlot(
    ids: readonly number[],
    faction: string,
    catalog: PremiumCatalog,
    library?: PremiumLibrary | null,
    history?: PremiumCrewHistory,
): number | undefined {
    return premiumCrewSlots(ids, catalog)
        .flatMap((id, slot) => {
            if (id !== undefined && catalog.units[id].faction === faction) return [];
            const pick = rankPremiumCrewPicks(ids, slot, catalog, library, "en", history).find(
                (pick) => !pick.selected && catalog.units[pick.id].faction === faction,
            );
            return pick ? [{ slot, evidence: pick.evidence }] : [];
        })
        .sort((a, b) => compareCrewHistory(a.evidence, b.evidence) || a.slot - b.slot)[0]?.slot;
}

/** All 56 icons stay selectable. Missing results never become invented percentages. */
export function rankPremiumCrewRoster(
    ids: readonly number[],
    activeSlot: number,
    catalog: PremiumCatalog,
    library?: PremiumLibrary | null,
    lang: Lang = "en",
    faction?: string,
    history?: PremiumCrewHistory,
): PremiumCrewRosterPick[] {
    const slots = premiumCrewSlots(ids, catalog);
    const active = Number.isInteger(activeSlot) && activeSlot >= 0 && activeSlot < CREW_LEVELS.length ? activeSlot : 0;
    const ranked = CREW_LEVELS.map((_, slot) => rankPremiumCrewPicks(ids, slot, catalog, library, lang, history));
    const bySlot = ranked.map((picks) => new Map(picks.map((pick) => [pick.id, pick])));
    const roster = Object.entries(catalog.units)
        .filter(([, unit]) => unit.kit?.amount)
        .map(([key, unit]): PremiumCrewRosterPick => {
            const id = Number(key);
            let targets = CREW_LEVELS.flatMap((level, slot) => (level === unit.level ? [slot] : []));
            const selected = slots.indexOf(id);
            if (selected >= 0) targets = [selected];
            else if (unit.level === CREW_LEVELS[active]) targets = [active];
            else {
                const empty = targets.find((slot) => slots[slot] === undefined);
                if (empty !== undefined) targets = [empty];
            }
            const slot = [...targets].sort(
                (a, b) => compareCrewHistory(bySlot[a].get(id)?.evidence, bySlot[b].get(id)?.evidence) || a - b,
            )[0];
            return { ...bySlot[slot].get(id)!, slot };
        });
    const priority = (pick: PremiumCrewRosterPick) =>
        pick.selected ? 3 : pick.slot !== active ? 2 : faction && catalog.units[pick.id].faction !== faction ? 1 : 0;
    roster.sort(
        (a, b) =>
            priority(a) - priority(b) ||
            compareCrewHistory(a.evidence, b.evidence) ||
            catalog.units[a.id].name.localeCompare(catalog.units[b.id].name),
    );
    roster
        .filter((pick) => priority(pick) === 0 && (pick.evidence?.families ?? 0) >= CREW_HISTORY_MINIMUM)
        .slice(0, 3)
        .forEach((pick, index) => {
            pick.suggestion = index + 1;
        });
    return roster;
}
