import { cells, valid, propose, type PublicInput, type Point } from "@heroesofcrypto/common/src/ai/placement/layout";
import type { finalizeA19Placement } from "@heroesofcrypto/common/src/ai/placement/adapter";
import { creatureInfo } from "@heroesofcrypto/common/src/ai/setup/creature_score";
import { dualStrikeRelativeDamageGain } from "@heroesofcrypto/common/src/ai/setup/dual_strike_fit";
import { DOUBLE_SHOT_ABILITY_NAMES } from "@heroesofcrypto/common/src/abilities/double_shot_names";
import { RectanglePlacement } from "@heroesofcrypto/common/src/grid/rectangle_placement";
import { PlacementPositionType } from "@heroesofcrypto/common/src/grid/placement_properties";
import { GridSettings } from "@heroesofcrypto/common/src/grid/grid_settings";
import {
    GRID_SIZE,
    MAX_Y,
    MIN_Y,
    MAX_X,
    MIN_X,
    MOVEMENT_DELTA,
    UNIT_SIZE_DELTA,
} from "@heroesofcrypto/common/src/grid/grid_constants";
import { SynergyKeysToPower } from "@heroesofcrypto/common/src/synergies/synergy_properties";
import { escapePremiumHtml as e, rankPremiumRows, type PremiumCatalog, type PremiumLibrary } from "./premium-library";
import { portraitMarkup } from "./portrait";
import { compareCrewHistory, type PremiumCrewHistory } from "./premium-crew-history";

type Lang = "en" | "ru";
export type CrewLayout = "screen" | "spread";
export const CREW_SIZE = 6;
export const CREW_LEVELS = [1, 1, 2, 2, 3, 4] as const;
export type PremiumCrewPlanner = typeof finalizeA19Placement;

/** Draw without replacement, preserving any enemy picks that are still available. */
export function randomPremiumEnemy(
    own: readonly number[],
    catalog: PremiumCatalog,
    random: () => number = Math.random,
    retained: readonly number[] = [],
): number[] {
    const available = Object.keys(catalog.units)
        .map(Number)
        .filter((id) => catalog.units[id].kit?.amount && !own.includes(id));
    const kept = CREW_LEVELS.map((level, index) => {
        const id = retained[index];
        return available.includes(id) && catalog.units[id].level === level && retained.indexOf(id) === index
            ? id
            : undefined;
    });
    const picked: number[] = [];
    for (const [index, level] of CREW_LEVELS.entries()) {
        if (kept[index] !== undefined) {
            picked.push(kept[index]!);
            continue;
        }
        const pool = available.filter(
            (id) => catalog.units[id].level === level && !picked.includes(id) && !kept.includes(id),
        );
        if (!pool.length) return [];
        picked.push(pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))]);
    }
    return picked;
}
export function premiumCrewSlots(ids: readonly number[], catalog: PremiumCatalog): (number | undefined)[] {
    const remaining = [...ids];
    return CREW_LEVELS.map((level) => {
        const index = remaining.findIndex((id) => catalog.units[id]?.level === level);
        return index < 0 ? undefined : remaining.splice(index, 1)[0];
    });
}
export const crewRole = (role: string | undefined, lang: Lang) =>
    ({
        ranged: lang === "ru" ? "Стрелок" : "Ranged",
        support: lang === "ru" ? "Магия / поддержка" : "Magic / support",
        flyer: lang === "ru" ? "Летающий" : "Flying",
        melee: lang === "ru" ? "Ближний бой" : "Melee",
    })[role ?? "melee"];
const unitPortrait = (item: PremiumCatalog["units"][string], eager = false) =>
    portraitMarkup(item.slug, item.name, { className: "premium-portrait", eager });
const kb = (anchor: string, lang: Lang) => `${lang === "ru" ? "/ru" : ""}/knowledge-base/#${e(anchor)}`;

/** Fill a legal starting crew, retaining saved picks and using current rules when battle data is missing. */
export function samplePremiumCrew(
    library: PremiumLibrary | null | undefined,
    catalog: PremiumCatalog,
    existing: readonly number[] = [],
): number[] {
    const rows = library?.units ?? [];
    const fallback = Object.keys(catalog.units)
        .map(Number)
        .filter((id) => catalog.units[id].kit?.amount)
        .sort((a, b) => catalog.units[a].name.localeCompare(catalog.units[b].name));
    const pool = [
        ...rankPremiumRows(rows, 50).map((row) => row.ids[0]),
        ...rankPremiumRows(rows, 1).map((row) => row.ids[0]),
        ...fallback,
    ];
    const chosen = premiumCrewSlots(existing, catalog).filter(
        (id, index, slots): id is number =>
            id !== undefined && Boolean(catalog.units[id]?.kit?.amount) && slots.indexOf(id) === index,
    );
    const slots = premiumCrewSlots(chosen, catalog);
    for (const [index, level] of CREW_LEVELS.entries()) {
        if (slots[index] !== undefined) continue;
        const id = pool.find(
            (id) => !chosen.includes(id) && catalog.units[id]?.level === level && catalog.units[id]?.kit?.amount,
        );
        if (id !== undefined) {
            slots[index] = id;
            chosen.push(id);
        }
    }
    return slots.filter((id): id is number => id !== undefined);
}

/** Legal starting positions, optionally refined by the unchanged game's A19 final-placement planner. */
export function premiumCrewFormation(
    ids: readonly number[],
    catalog: PremiumCatalog,
    layout: CrewLayout = "screen",
    map = 1,
    opponent: readonly number[] = [],
    left = true,
    planner?: PremiumCrewPlanner,
    artifacts: readonly [number, number] = [1, 1],
) {
    if (ids.length > CREW_SIZE || new Set(ids).size !== ids.length || ids.some((id) => !catalog.units[id]?.kit?.amount))
        throw new Error("Choose up to six distinct draftable units");
    for (const level of [1, 2, 3, 4]) {
        if (
            ids.filter((id) => catalog.units[id].level === level).length >
            CREW_LEVELS.filter((value) => value === level).length
        )
            throw new Error(`No free level ${level} draft slot`);
    }
    const zone = new RectanglePlacement(
        new GridSettings(GRID_SIZE, MAX_Y, MIN_Y, MAX_X, MIN_X, MOVEMENT_DELTA, UNIT_SIZE_DELTA),
        left ? PlacementPositionType.LEFT_BOTTOM : PlacementPositionType.RIGHT_TOP,
        3,
        true,
    );
    const input: PublicInput = {
        bodies: ids.map((id) => {
            const item = catalog.units[id],
                kit = item.kit!,
                info = creatureInfo(id)!;
            return {
                id: String(id),
                creature: id,
                name: item.name,
                amount: kit.amount,
                width: kit.width,
                height: kit.height,
                ranged: info.ranged,
                caster: info.caster,
                healer: item.name === "Healer",
                aura: info.auraCount > 0,
                fly: info.canFly,
                driven: info.abilities.includes("AI Driven"),
                hp: kit.hp,
                damage: info.maxDamage,
                range: info.distance,
                steps: kit.steps,
                initiative: kit.initiative,
                level: item.level,
            };
        }),
        enemyIds: [...new Set(opponent)].sort((a, b) => a - b),
        enemyKits: [...new Set(opponent)].sort((a, b) => a - b).map((id) => creatureInfo(id)?.abilities ?? ""),
        map,
        artifacts: [...artifacts],
        doctrine: 3,
        augments: [
            { kind: "Armor", value: 3 },
            { kind: "Might", value: 3 },
            { kind: "Sniper", value: 1 },
        ],
        left,
        legal: [...zone.possibleCellHashes()],
    };
    const positions: Point[] = new Array(ids.length);
    const occupied = new Set<number>();
    const ordered = input.bodies
        .map((body, index) => ({ body, index }))
        .sort((a, b) => b.body.width * b.body.height - a.body.width * a.body.height || a.index - b.index);
    for (const { body, index } of ordered) {
        const back = body.ranged || body.caster;
        const targetY = 3 + (index % 3) * 4;
        const anchors = zone
            .possibleCellPositions(true, body.width, body.height)
            .filter((p) => cells(body, p).every((c) => !occupied.has((c.x << 4) | c.y)));
        anchors.sort((a, b) => {
            const targetX = back ? body.width : 3;
            const score = (p: Point) =>
                Math.abs(p.x - (left ? targetX : 15 - targetX + body.width - 1)) * 10 + Math.abs(p.y - targetY);
            return score(a) - score(b) || a.y - b.y || a.x - b.x;
        });
        const anchor = anchors[0];
        if (!anchor) throw new Error("Crew does not fit the base deployment zone");
        positions[index] = anchor;
        cells(body, anchor).forEach((c) => occupied.add((c.x << 4) | c.y));
    }
    if (!valid(input, positions)) throw new Error("Invalid crew formation");
    const baseline = ids.length && layout === "spread" ? propose(input, positions, 2) : positions;
    const planned = !!planner && ids.length === CREW_SIZE && input.enemyIds.length === CREW_SIZE;
    if (!planned) return { input, positions: baseline, planned: false };
    const units = input.bodies.map((body) => ({
        getId: () => body.id,
        getName: () => body.name,
        getAmountAlive: () => body.amount,
        getFootprintWidth: () => body.width,
        getFootprintHeight: () => body.height,
    }));
    const result = planner!(
        units,
        {
            team: left ? 2 : 1,
            gridType: map,
            sideOrientedPlacement: true,
            legalCellHashes: new Set(input.legal),
            publicOpponentCreatureIds: input.enemyIds,
            artifacts,
            doctrine: input.doctrine,
            augments: input.augments,
        },
        new Map(input.bodies.map((body, i) => [body.id, baseline[i]])),
    );
    const selected = input.bodies.map((body) => result.get(body.id)!);
    if (selected.some((point) => !point) || !valid(input, selected)) throw new Error("Invalid AI crew formation");
    return { input, positions: selected, planned: true };
}

export function premiumCrewBoardPlan(
    ids: readonly number[],
    enemyIds: readonly number[],
    catalog: PremiumCatalog,
    layout: CrewLayout,
    map: number,
    planner?: PremiumCrewPlanner,
    library?: PremiumLibrary | null,
    history?: PremiumCrewHistory,
    artifactIds: readonly number[] = [],
) {
    const artifactOptions = premiumCrewArtifacts(ids, catalog, 3, library, history);
    const artifacts = [1, 2].map((tier) => {
        const chosen = artifactIds[tier - 1];
        const item = catalog.artifacts[`${tier}:${chosen}`];
        return item && premiumCrewArtifactBenefit(item.slug, ids, "en").names.length
            ? chosen
            : (artifactOptions.find((item) => item.tier === tier)?.id ?? 1);
    }) as [number, number];
    return {
        artifactOptions,
        own: premiumCrewFormation(ids, catalog, layout, map, enemyIds, true, planner, artifacts),
        enemy: premiumCrewFormation(enemyIds, catalog, "screen", map, ids, false, planner),
    };
}
export type PremiumCrewBoardPlan = ReturnType<typeof premiumCrewBoardPlan>;

export function premiumCrewArtifacts(
    ids: readonly number[],
    catalog: PremiumCatalog,
    perTier = 1,
    library?: PremiumLibrary | null,
    history?: PremiumCrewHistory,
) {
    if (!ids.length) return [];
    return ([1, 2] as const).flatMap((tier) => {
        const group = history?.artifacts.find((item) => item.tier === tier);
        const rows = group?.rows ?? (tier === 1 ? library?.artifactsTier1 : library?.artifactsTier2) ?? [];
        return [...rows]
            .sort(compareCrewHistory)
            .flatMap((evidence) => {
                const id = evidence.ids[0],
                    key = `${tier}:${id}`,
                    item = catalog.artifacts[key];
                if (!item || !premiumCrewArtifactBenefit(item.slug, ids, "en").names.length) return [];
                return [
                    {
                        key,
                        id,
                        tier,
                        item,
                        score: evidence.interval[0],
                        evidence,
                        contextUnits: group?.contextUnits ?? [],
                    },
                ];
            })
            .slice(0, Math.max(1, perTier));
    });
}

export function premiumCrewSynergies(ids: readonly number[], catalog: PremiumCatalog) {
    return ["Life", "Nature", "Chaos", "Might"]
        .map((faction) => {
            const count = ids.filter((id) => catalog.units[id]?.faction === faction).length;
            const level = count >= 6 ? 3 : count >= 4 ? 2 : count >= 2 ? 1 : 0;
            return {
                faction,
                count,
                level,
                next: level === 3 ? 6 : [2, 4, 6][level],
                variants: [1, 2].map((variant) => ({
                    variant,
                    power: level ? SynergyKeysToPower[`${faction}:${variant}:${level}`] : [],
                })),
            };
        })
        .filter((item) => item.count > 0)
        .sort(
            (a, b) => a.next - a.count - (b.next - b.count) || b.level - a.level || a.faction.localeCompare(b.faction),
        );
}

export function premiumCrewArtifactBenefit(slug: string, ids: readonly number[], lang: Lang) {
    const own = ids.flatMap((id) => creatureInfo(id) ?? []);
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    let kind = "crew";
    const beneficiaries = own.filter((unit) => {
        if (["hunters_longbow", "farsight_quiver", "quiver_of_echoes"].includes(slug)) {
            kind = "ranged";
            return (
                unit.ranged &&
                (slug !== "quiver_of_echoes" ||
                    unit.shots > (DOUBLE_SHOT_ABILITY_NAMES.some((name) => unit.abilities.includes(name)) ? 2 : 1))
            );
        }
        if (slug === "winged_boots") {
            kind = "flying";
            return unit.canFly;
        }
        if (slug === "swift_boots") {
            kind = "melee";
            return unit.melee;
        }
        if (["mages_ring", "archmages_ring"].includes(slug)) {
            kind = "magic";
            return unit.dealsMagicDamage;
        }
        if (slug === "tome_of_amplification") {
            kind = "buff";
            return unit.castsAmplifiableBuff;
        }
        if (slug === "dual_strike_charm") {
            kind = "extra";
            return dualStrikeRelativeDamageGain(unit, own) > 0;
        }
        return true;
    });
    const n = beneficiaries.length;
    const labels: Record<string, string> = {
        crew: t("Whole crew", "Вся армия"),
        ranged: t(`For ${n} ranged ${n === 1 ? "unit" : "units"}`, `Стрелков: ${n}`),
        flying: t(`For ${n} flying ${n === 1 ? "unit" : "units"}`, `Летающих: ${n}`),
        melee: t(`For ${n} melee ${n === 1 ? "unit" : "units"}`, `Ближний бой: ${n}`),
        magic: t(`For ${n} magic-damage ${n === 1 ? "unit" : "units"}`, `Магический урон: ${n}`),
        buff: t(`For ${n} buff ${n === 1 ? "caster" : "casters"}`, `Заклинания усиления: ${n}`),
        extra: t(`For ${n} extra-attack ${n === 1 ? "unit" : "units"}`, `Дополнительные атаки: ${n}`),
    };
    return { label: labels[kind], names: beneficiaries.map((unit) => unit.name) };
}

export function premiumCrewShell(lang: Lang): string {
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    return `<section id="premium-crew" class="premium-section premium-crew"><header class="premium-section-heading"><span>02</span><div><h2>${t("Build your crew", "Соберите армию")}</h2><p>${t("Pick a slot, then a unit. Your formation, battle plan and bonuses update automatically.", "Выберите слот, затем юнита. Расстановка, план боя и бонусы обновятся автоматически.")}</p></div></header><div data-crew-content></div></section>`;
}

export function renderPremiumCrew(
    ids: number[],
    catalog: PremiumCatalog,
    lang: Lang,
    layout: CrewLayout,
    map: number,
    _hasEvidence = true,
    library?: PremiumLibrary | null,
    history?: PremiumCrewHistory,
    enemyIds: readonly number[] = [],
    planner?: PremiumCrewPlanner,
    plan = premiumCrewBoardPlan(ids, enemyIds, catalog, layout, map, planner, library, history),
) {
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    const { artifactOptions, own: formation, enemy } = plan;
    const slots = premiumCrewSlots(ids, catalog)
        .map((id, index) => {
            const item = id ? catalog.units[id] : undefined;
            return `<div class="premium-crew-slot ${item ? "premium-crew-slot-filled" : ""}"><span class="premium-crew-slot-level">${t("Level", "Уровень")} ${CREW_LEVELS[index]}</span><button type="button" data-crew-slot="${index}" ${item ? `data-knowledge-reference="${e(item.anchor)}"` : ""} aria-label="${e(item ? t(`Replace ${item.name}`, `Заменить ${item.name}`) : t(`Choose level ${CREW_LEVELS[index]} unit, slot ${index + 1}`, `Выбрать юнита ${CREW_LEVELS[index]} уровня, слот ${index + 1}`))}">${item ? `<span class="premium-crew-slot-portrait">${unitPortrait(item, true)}</span><strong>${e(item.name)}</strong><small>${crewRole(item.kit?.role, lang)}</small>` : `<span class="premium-crew-add" aria-hidden="true">+</span><strong>${t("Add unit", "Добавить")}</strong><small>${index + 1} / 6</small>`}</button>${item ? `<button type="button" class="premium-crew-remove" data-crew-remove="${index}" aria-label="${e(t(`Remove ${item.name}`, `Убрать ${item.name}`))}">×</button>` : ""}</div>`;
        })
        .join("");
    const boardCells = Array.from({ length: 256 }, (_, i) => {
        const x = i % 16,
            y = 15 - Math.floor(i / 16);
        const zone = x >= 1 && x <= 3 && y >= 1 && y <= 14;
        const enemyZone = x >= 12 && x <= 14 && y >= 1 && y <= 14;
        const lava = map === 3 && x >= 6 && x < 10 && y >= 6 && y < 10;
        const block = map === 4 && [5, 6, 9, 10].includes(x) && [7, 8].includes(y);
        return `<i style="grid-column:${x + 1};grid-row:${16 - y}" class="${zone ? "crew-zone" : enemyZone ? "crew-zone-enemy" : ""}${lava ? " crew-lava" : ""}${block ? " crew-block" : ""}" aria-hidden="true"></i>`;
    }).join("");
    const tokens = ids
        .map((id, index) => {
            const item = catalog.units[id],
                body = formation.input.bodies[index],
                point = formation.positions[index];
            const coordinate = `${String.fromCharCode(65 + point.x)}${point.y + 1}`;
            const slot = premiumCrewSlots(ids, catalog).indexOf(id);
            return `<button type="button" class="premium-crew-token" data-crew-slot="${slot}" data-knowledge-reference="${e(item.anchor)}" style="grid-column:${point.x - body.width + 2} / span ${body.width};grid-row:${16 - point.y} / span ${body.height}" aria-label="${e(t(`Replace ${item.name} at ${coordinate}`, `Заменить ${item.name} на ${coordinate}`))}"><span class="premium-crew-token-crop">${unitPortrait(item)}</span><b>${index + 1}</b></button>`;
        })
        .join("");
    const enemyTokens = enemyIds
        .map((id, index) => {
            const item = catalog.units[id],
                body = enemy.input.bodies[index],
                point = enemy.positions[index];
            const coordinate = `${String.fromCharCode(65 + point.x)}${point.y + 1}`;
            return `<button type="button" class="premium-crew-token premium-crew-token-enemy" data-crew-enemy="${id}" data-knowledge-reference="${e(item.anchor)}" style="grid-column:${point.x - body.width + 2} / span ${body.width};grid-row:${16 - point.y} / span ${body.height}" aria-label="${e(t(`Enemy ${item.name} at ${coordinate}`, `Враг ${item.name} на ${coordinate}`))}"><span class="premium-crew-token-crop">${unitPortrait(item)}</span><b>${index + 1}</b></button>`;
        })
        .join("");
    const axes = Array.from(
        { length: 16 },
        (_, i) =>
            `<span class="premium-crew-axis" style="left:${(i + 0.5) * 6.25}%;top:2px" aria-hidden="true">${String.fromCharCode(65 + i)}</span><span class="premium-crew-axis" style="left:3px;top:${(15 - i + 0.5) * 6.25}%" aria-hidden="true">${i + 1}</span>`,
    ).join("");
    const bestArtifacts = [1, 2].flatMap((tier) => artifactOptions.find((item) => item.tier === tier) ?? []);
    const renderArtifact = (
        { item, tier, key, evidence, contextUnits }: (typeof artifactOptions)[number],
        alternative = false,
    ) => {
        const benefit = premiumCrewArtifactBenefit(item.slug, ids, lang);
        const rank = artifactOptions.filter((item) => item.tier === tier).findIndex((item) => item.key === key) + 1;
        return `<a class="premium-crew-artifact" href="${kb(item.anchor, lang)}" data-premium-applies-to="${e(benefit.names.join(", "))}" data-premium-reference-note="${e(`${(evidence.score * 100).toFixed(1)}% · n=${evidence.families} · 95%: ${(evidence.interval[0] * 100).toFixed(1)}%–${(evidence.interval[1] * 100).toFixed(1)}%`)}"><img src="${e(item.icon)}" alt="" width="52" height="52"/><span><small>${t("Tier", "Уровень")} ${tier}${alternative ? ` · #${rank}` : ""}${/^(Cursed|Проклятие):/.test(item.description) ? ` · <em class="premium-crew-cursed">${t("Cursed", "Проклятие")}</em>` : ""}</small><strong>${e(item.name)}</strong><small class="premium-crew-benefit">${(evidence.score * 100).toFixed(1)}% · n=${evidence.families}${evidence.families < 50 ? ` · ${t("Small sample", "Малая выборка")}` : ""}</small><small>${e(contextUnits.length ? t("With ", "Вместе с ") + contextUnits.map((id) => catalog.units[id].name).join(", ") : t("All selected armies", "Все выбранные армии"))}</small></span></a>`;
    };
    const artifactMarkup =
        bestArtifacts.map((item) => renderArtifact(item)).join("") ||
        `<p class="premium-fine">${t("No recorded artifact results for these filters.", "Нет результатов артефактов для этих фильтров.")}</p>`;
    const alternatives = artifactOptions
        .filter((option) => !bestArtifacts.some((best) => best.key === option.key))
        .map((item) => renderArtifact(item, true))
        .join("");
    const names: Record<string, [string, string]> = {
        Life: ["Life", "Жизнь"],
        Nature: ["Nature", "Природа"],
        Chaos: ["Chaos", "Хаос"],
        Might: ["Might", "Сила"],
    };
    const renderSynergyHistory = (faction: string, level: number) => {
        if (!level) return "";
        const code = ({ Chaos: 1, Might: 2, Nature: 3, Life: 4 } as Record<string, number>)[faction];
        const rows = history?.synergies.rows ?? library?.synergies ?? [];
        return (
            [1, 2]
                .map((variant) => {
                    const row = rows.find((item) => item.key === `${code}:${variant}:${level}`);
                    return `<p class="premium-fine">${t("Variant", "Вариант")} ${variant}: ${row ? `${(row.score * 100).toFixed(1)}% · n=${row.families}${row.families < 50 ? ` · ${t("Small sample", "Малая выборка")}` : ""}` : t("No recorded games", "Нет записанных боёв")}</p>`;
                })
                .join("") +
            `<p class="premium-fine">${e(history?.synergies.contextUnits.length ? t("Armies with ", "Армии с ") + history.synergies.contextUnits.map((id) => catalog.units[id].name).join(", ") : t("All armies in the selected data and filters.", "Все армии в выбранном наборе и фильтрах."))}</p>`
        );
    };
    const synergyMarkup = premiumCrewSynergies(ids, catalog)
        .map(
            ({ faction, count, level, next, variants }) =>
                `<div class="premium-crew-synergy-option"><details class="premium-crew-synergy"><summary data-premium-help="${e(level ? variants.map(({ variant, power }) => premiumCrewSynergyEffect(faction, variant, power, lang)).join(" / ") + " · " + t("One variant is rolled per match.", "В матче выпадает один вариант.") : t(`Add ${next - count} more to activate.`, `Для активации нужно ещё ${next - count}.`))}" data-premium-help-title="${e(t(...names[faction]))}"><img src="/assets/images/units/factions/${faction.toLowerCase()}_128.webp" alt="" width="36" height="36"/><span><strong>${t(...names[faction])}</strong><small>${level ? `${t("Level", "Уровень")} ${level}` : t("Inactive", "Не активна")}</small></span><span class="premium-synergy-pips" aria-label="${count} / ${next}">${Array.from({ length: 6 }, (_, i) => `<i class="${i < count ? "filled" : ""}"></i>`).join("")}</span></summary><p>${level ? t("One variant is rolled for each faction in a match.", "В матче для каждой фракции выпадает один вариант.") : t(`Add ${next - count} more ${faction} unit to activate.`, `Для активации нужно ещё ${next - count}.`)} ${level ? variants.map(({ variant, power }) => premiumCrewSynergyEffect(faction, variant, power, lang)).join(" / ") : ""}</p>${renderSynergyHistory(faction, level)}</details>${level < 3 ? `<button type="button" class="premium-text-button premium-crew-faction-pick" data-crew-faction="${faction}" aria-label="${e(t(`Find next ${faction} pick`, `Выбрать следующего юнита фракции ${t(...names[faction])}`))}">${t(`${next - count} more for L${level + 1} · pick next`, `Ещё ${next - count} до уровня ${level + 1} · выбрать`)} →</button>` : ""}</div>`,
        )
        .join("");
    return `<div class="premium-crew-toolbar"><span role="status" aria-live="polite">${ids.length} / 6 ${t("units", "юнитов")}</span><div>${library?.units.length ? `<button type="button" class="premium-text-button" data-crew-sample>${t("Fill from battle data", "Взять из записанных боёв")}</button>` : ""}${ids.length ? `<button type="button" class="premium-text-button" data-crew-share>${t("Copy crew link", "Скопировать состав")}</button><button type="button" class="premium-text-button" data-crew-clear>${t("Clear", "Очистить")}</button>` : ""}</div></div><div class="premium-crew-slots" role="group" aria-label="${t("Your six crew slots", "Шесть слотов армии")}">${slots}</div><div data-crew-roster class="premium-crew-roster"></div><section class="premium-crew-picks" data-crew-recommendations aria-label="${t("Best next picks", "Что выбрать дальше")}"></section><div data-crew-share-fallback hidden><label>${t("Crew link", "Ссылка на состав")}<input type="text" readonly data-crew-share-link /></label></div>
    <div class="premium-crew-layout"><div><div class="premium-subheading"><h3>${formation.planned ? t("Game AI formation", "Расстановка игрового ИИ") : t("Starting formation", "Начальная расстановка")}</h3><select data-crew-layout aria-label="${t("Formation style", "Стиль расстановки")}"><option value="screen" ${layout === "screen" ? "selected" : ""}>${t("Protect back line", "Прикрыть тыл")}</option><option value="spread" ${layout === "spread" ? "selected" : ""}>${t("Spread out", "Разнести юнитов")}</option></select></div>${
        ids.length
            ? `<div class="premium-crew-equipped" role="group" aria-label="${t("Equipped artifacts", "Выбранные артефакты")}">${formation.input.artifacts
                  .map((id, index) => {
                      const item = catalog.artifacts[`${index + 1}:${id}`];
                      return item
                          ? `<a href="${kb(item.anchor, lang)}"><img src="${e(item.icon)}" width="26" height="26" alt=""/><span><small>T${index + 1}</small>${e(item.name)}</span></a>`
                          : "";
                  })
                  .join(
                      "",
                  )}<button type="button" class="premium-text-button" data-crew-artifacts-auto>${t("Use suggestions", "По рекомендациям")}</button></div>`
            : ""
    }<div class="premium-crew-board" role="group" aria-label="${t("16 by 16 board, your army deploys on the left", "Поле 16 на 16, ваша армия слева")}">${boardCells}${tokens}${enemyTokens}${axes}<button type="button" class="premium-crew-randomize" data-crew-randomize aria-label="${t("Randomize six unpicked enemy units and rearrange your crew", "Выбрать шесть случайных юнитов врага и перестроить вашу армию")}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h3c4 0 8 14 12 14h3m-4-4 4 4-4 4M3 19h3c2 0 4-3 6-7s4-7 6-7h3m-4-4 4 4-4 4"/></svg> ${t("Randomize enemy", "Случайный враг")}</button>${!enemyIds.length ? `<span class="premium-crew-enemy" aria-hidden="true">${t("Enemy side", "Сторона врага")} →</span>` : ""}</div><p class="premium-fine">${formation.planned ? t("You on the left · Enemy on the right · AI rearranges as you pick", "Вы слева · Враг справа · ИИ перестраивает при выборе") : enemyIds.length ? (ids.length === 6 ? t("Game AI pending · click Randomize enemy to retry if loading fails", "Ожидание игрового ИИ · при ошибке нажмите «Случайный враг» повторно") : t("Complete your six picks to arrange against this enemy", "Выберите шесть юнитов для расстановки против этого врага")) : t("Randomize an enemy to arrange your crew against it", "Выберите случайного врага для расстановки против него")}</p><details class="premium-crew-notes"><summary>${t("Positions & details", "Клетки и подробности")}</summary><ul>${ids.map((id, i) => `<li><a href="${kb(catalog.units[id].anchor, lang)}">${e(catalog.units[id].name)}</a><b>${String.fromCharCode(65 + formation.positions[i].x)}${formation.positions[i].y + 1}</b></li>`).join("")}</ul><p>${formation.planned ? t("Uses the game’s A19 formation planner and public enemy roster. Standard stacks, Battle Trance, Armor 3 / Might 3 / Sniper 1, and the equipped artifacts shown above the board. This is a formation suggestion, not a matchup win forecast. Recorded percentages above cover the selected dataset, not this enemy.", "Игровой планировщик A19 учитывает открытый состав врага. Стандартные отряды, Боевой транс, Броня 3 / Мощь 3 / Снайпер 1 и выбранные артефакты над полем. Это предложение расстановки, а не прогноз победы. Проценты выше относятся к выбранным записям, а не к этому врагу.") : t("A legal starting layout based on roles and unit footprints. Choose six units and randomize an enemy to use the game’s formation planner.", "Начальная расстановка по ролям и размерам юнитов. Выберите шесть юнитов и случайного врага для игрового планировщика.")}</p></details></div><aside class="premium-crew-recommendations"><section class="premium-crew-strategy" data-crew-strategy aria-label="${t("Battle plan", "План боя")}"></section><h3>${t("Artifact results", "Результаты артефактов")}</h3><p>${t("Recorded battle scores · applicable to these units", "Результаты записанных боёв · подходят этим юнитам")}</p>${artifactMarkup}${alternatives ? `<details class="premium-crew-artifact-options"><summary>${t("More artifact options", "Другие артефакты")}</summary>${alternatives}</details>` : ""}<h3>${t("Faction bonuses", "Бонусы фракций")}</h3>${synergyMarkup}<div data-crew-evidence role="status" aria-live="polite"></div></aside></div>`;
}

export function premiumCrewSynergyEffect(faction: string, variant: number, power: number[], lang: Lang): string {
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    const effects: Record<string, string[]> = {
        Life: [
            t(`+${power[0]}% supply`, `+${power[0]}% подкрепления`),
            t(`+${power[0]} morale, +${power[1]} luck`, `+${power[0]} мораль, +${power[1]} удача`),
        ],
        Nature: [
            t(`+${power[0]} board stacks`, `+${power[0]} стеков`),
            t(`+${power[0]}% flying armor`, `+${power[0]}% брони летающих`),
        ],
        Chaos: [
            t(`+${power[0]} movement`, `+${power[0]} движения`),
            t(`${power[0]}% Break on attack`, `${power[0]}% Слом при атаке`),
        ],
        Might: [
            t(`+${power[0]} aura range`, `+${power[0]} радиуса аур`),
            t(`+${power[0]}% ability power`, `+${power[0]}% силы способностей`),
        ],
    };
    return effects[faction]?.[variant - 1] ?? "";
}
