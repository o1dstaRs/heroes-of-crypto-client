import { cells, valid, propose, type PublicInput, type Point } from "@heroesofcrypto/common/src/ai/placement/layout";
import { creatureInfo, scoreCreature } from "@heroesofcrypto/common/src/ai/setup/creature_score";
import { tier1ArtifactFitScoreV7, tier2ArtifactFitScoreV6 } from "@heroesofcrypto/common/src/ai/setup/artifact_fit";
import { dualStrikeRelativeDamageGain } from "@heroesofcrypto/common/src/ai/setup/dual_strike_fit";
import { DOUBLE_SHOT_ABILITY_NAMES } from "@heroesofcrypto/common/src/abilities/double_shot_names";
import { TIER1_ARTIFACT_WINRATE } from "@heroesofcrypto/common/src/ai/setup/setup_strategy";
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

type Lang = "en" | "ru";
export type CrewLayout = "screen" | "spread";
export const CREW_SIZE = 6;
export const CREW_LEVELS = [1, 1, 2, 2, 3, 4] as const;
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
        .sort((a, b) => scoreCreature(b) - scoreCreature(a) || a - b);
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

/** A legal role-based starting formation, not a measured optimum or a live-game operation. */
export function premiumCrewFormation(
    ids: readonly number[],
    catalog: PremiumCatalog,
    layout: CrewLayout = "screen",
    map = 1,
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
        PlacementPositionType.LEFT_BOTTOM,
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
                ranged: kit.role === "ranged",
                caster: kit.role === "support",
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
        enemyIds: [],
        enemyKits: [],
        map,
        artifacts: [],
        doctrine: 0,
        augments: [],
        left: true,
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
            const score = (p: Point) => Math.abs(p.x - (back ? body.width : 3)) * 10 + Math.abs(p.y - targetY);
            return score(a) - score(b) || a.y - b.y || a.x - b.x;
        });
        const anchor = anchors[0];
        if (!anchor) throw new Error("Crew does not fit the base deployment zone");
        positions[index] = anchor;
        cells(body, anchor).forEach((c) => occupied.add((c.x << 4) | c.y));
    }
    if (!valid(input, positions)) throw new Error("Invalid crew formation");
    return { input, positions: ids.length && layout === "spread" ? propose(input, positions, 2) : positions };
}

export function premiumCrewArtifacts(ids: readonly number[], catalog: PremiumCatalog) {
    if (!ids.length) return [];
    const own = ids.flatMap((id) => creatureInfo(id) ?? []);
    const eligible = (slug: string) => {
        if (["hunters_longbow", "farsight_quiver", "quiver_of_echoes"].includes(slug))
            return own.some((unit) => unit.ranged);
        if (slug === "winged_boots") return own.some((unit) => unit.canFly);
        if (slug === "swift_boots") return own.some((unit) => unit.melee);
        if (["mages_ring", "archmages_ring"].includes(slug)) return own.some((unit) => unit.dealsMagicDamage);
        if (slug === "tome_of_amplification") return own.some((unit) => unit.castsAmplifiableBuff);
        return !["aegis_of_the_arcane", "lava_striders", "barrel_barricade"].includes(slug);
    };
    const pick = (tier: 1 | 2, tier1?: number) =>
        Object.entries(catalog.artifacts)
            .filter(([key, item]) => key.startsWith(`${tier}:`) && eligible(item.slug))
            .map(([key, item]) => {
                const id = Number(key.split(":")[1]);
                const score =
                    tier === 1
                        ? tier1ArtifactFitScoreV7(id, ids, TIER1_ARTIFACT_WINRATE[id] ?? 50)
                        : tier2ArtifactFitScoreV6(id, ids, {
                              decisionPhase: "tier2-artifact",
                              opponentRosterVisibility: "partial",
                              publicOpponentCreatureIds: [],
                              ownArtifactIds: [tier1 ?? 0, 0],
                          });
                return { key, id, tier, item, score };
            })
            .filter((item) => Number.isFinite(item.score) && item.score > 0)
            .sort((a, b) => b.score - a.score || a.id - b.id)[0];
    const first = pick(1);
    return [first, pick(2, first?.id)].filter((item): item is NonNullable<typeof item> => Boolean(item));
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
        .filter((item) => item.count > 0);
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
    return `<section id="premium-crew" class="premium-section premium-crew"><header class="premium-section-heading"><span>02</span><div><h2>${t("Build your crew", "Соберите армию")}</h2><p>${t("Six units are already placed. Click a unit to swap it and update the formation, artifacts and faction bonuses.", "Шесть юнитов уже на поле. Нажмите на юнита, чтобы заменить его и обновить расстановку, артефакты и бонусы фракций.")}</p></div></header><div data-crew-content></div></section>`;
}

export function renderPremiumCrew(
    ids: number[],
    catalog: PremiumCatalog,
    lang: Lang,
    layout: CrewLayout,
    map: number,
    hasEvidence = true,
) {
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    const formation = premiumCrewFormation(ids, catalog, layout, map);
    const slots = premiumCrewSlots(ids, catalog)
        .map((id, index) => {
            const item = id ? catalog.units[id] : undefined;
            return `<div class="premium-crew-slot ${item ? "premium-crew-slot-filled" : ""}"><span class="premium-crew-slot-level">${t("Level", "Уровень")} ${CREW_LEVELS[index]}</span><button type="button" data-crew-slot="${index}" ${item ? `data-knowledge-reference="${e(item.anchor)}"` : ""} aria-label="${e(item ? t(`Replace ${item.name}`, `Заменить ${item.name}`) : t(`Choose level ${CREW_LEVELS[index]} unit, slot ${index + 1}`, `Выбрать юнита ${CREW_LEVELS[index]} уровня, слот ${index + 1}`))}">${item ? `${unitPortrait(item, true)}<strong>${e(item.name)}</strong><small>${crewRole(item.kit?.role, lang)}</small>` : `<span class="premium-crew-add" aria-hidden="true">+</span><strong>${t("Add unit", "Добавить")}</strong><small>${index + 1} / 6</small>`}</button>${item ? `<button type="button" class="premium-crew-remove" data-crew-remove="${index}" aria-label="${e(t(`Remove ${item.name}`, `Убрать ${item.name}`))}">×</button>` : ""}</div>`;
        })
        .join("");
    const boardCells = Array.from({ length: 256 }, (_, i) => {
        const x = i % 16,
            y = 15 - Math.floor(i / 16);
        const zone = x >= 1 && x <= 3 && y >= 1 && y <= 14;
        const lava = map === 3 && x >= 6 && x < 10 && y >= 6 && y < 10;
        const block = map === 4 && [5, 6, 9, 10].includes(x) && [7, 8].includes(y);
        return `<i style="grid-column:${x + 1};grid-row:${16 - y}" class="${zone ? "crew-zone" : ""}${lava ? " crew-lava" : ""}${block ? " crew-block" : ""}" aria-hidden="true"></i>`;
    }).join("");
    const tokens = ids
        .map((id, index) => {
            const item = catalog.units[id],
                body = formation.input.bodies[index],
                point = formation.positions[index];
            const coordinate = `${String.fromCharCode(65 + point.x)}${point.y + 1}`;
            const slot = premiumCrewSlots(ids, catalog).indexOf(id);
            return `<button type="button" class="premium-crew-token" data-crew-slot="${slot}" data-knowledge-reference="${e(item.anchor)}" style="grid-column:${point.x - body.width + 2} / span ${body.width};grid-row:${16 - point.y} / span ${body.height}" aria-label="${e(t(`Replace ${item.name} at ${coordinate}`, `Заменить ${item.name} на ${coordinate}`))}">${unitPortrait(item)}<b>${index + 1}</b></button>`;
        })
        .join("");
    const axes = Array.from(
        { length: 16 },
        (_, i) =>
            `<span class="premium-crew-axis" style="left:${(i + 0.5) * 6.25}%;top:2px" aria-hidden="true">${String.fromCharCode(65 + i)}</span><span class="premium-crew-axis" style="left:3px;top:${(15 - i + 0.5) * 6.25}%" aria-hidden="true">${i + 1}</span>`,
    ).join("");
    const artifactMarkup = premiumCrewArtifacts(ids, catalog)
        .map(({ item, tier }) => {
            const benefit = premiumCrewArtifactBenefit(item.slug, ids, lang);
            return `<a class="premium-crew-artifact" href="${kb(item.anchor, lang)}" data-premium-applies-to="${e(benefit.names.join(", "))}"><img src="${e(item.icon)}" alt="" width="52" height="52"/><span><small>${t("Tier", "Уровень")} ${tier}${/^(Cursed|Проклятие):/.test(item.description) ? ` · <em class="premium-crew-cursed">${t("Cursed", "Проклятие")}</em>` : ""}</small><strong>${e(item.name)}</strong><small class="premium-crew-benefit">${e(benefit.label)}</small></span></a>`;
        })
        .join("");
    const names: Record<string, [string, string]> = {
        Life: ["Life", "Жизнь"],
        Nature: ["Nature", "Природа"],
        Chaos: ["Chaos", "Хаос"],
        Might: ["Might", "Сила"],
    };
    const synergyMarkup = premiumCrewSynergies(ids, catalog)
        .map(
            ({ faction, count, level, next, variants }) =>
                `<details class="premium-crew-synergy"><summary data-premium-help="${e(level ? variants.map(({ variant, power }) => synergyEffect(faction, variant, power, lang)).join(" / ") + " · " + t("One variant is rolled per match.", "В матче выпадает один вариант.") : t(`Add ${next - count} more to activate.`, `Для активации нужно ещё ${next - count}.`))}" data-premium-help-title="${e(t(...names[faction]))}"><img src="/assets/images/units/factions/${faction.toLowerCase()}_128.webp" alt="" width="36" height="36"/><span><strong>${t(...names[faction])}</strong><small>${level ? `${t("Level", "Уровень")} ${level}` : t("Inactive", "Не активна")}</small></span><span class="premium-synergy-pips" aria-label="${count} / ${next}">${Array.from({ length: 6 }, (_, i) => `<i class="${i < count ? "filled" : ""}"></i>`).join("")}</span></summary><p>${level ? t("One variant is rolled for each faction in a match.", "В матче для каждой фракции выпадает один вариант.") : t(`Add ${next - count} more ${faction} unit to activate.`, `Для активации нужно ещё ${next - count}.`)} ${level ? variants.map(({ variant, power }) => synergyEffect(faction, variant, power, lang)).join(" / ") : ""}</p></details>`,
        )
        .join("");
    return `<div class="premium-crew-toolbar"><span role="status" aria-live="polite">${ids.length} / 6 ${t("units", "юнитов")}</span><div>${hasEvidence ? `<button type="button" class="premium-text-button" data-crew-sample>${t("Try meta picks", "Взять юнитов из меты")}</button>` : ""}${ids.length ? `<button type="button" class="premium-text-button" data-crew-share>${t("Copy crew link", "Скопировать состав")}</button><button type="button" class="premium-text-button" data-crew-clear>${t("Clear", "Очистить")}</button>` : ""}</div></div><div class="premium-crew-slots">${slots}</div><div data-crew-share-fallback hidden><label>${t("Crew link", "Ссылка на состав")}<input type="text" readonly data-crew-share-link /></label></div>
    ${ids.length ? `<div class="premium-crew-layout"><div><div class="premium-subheading"><h3>${t("Suggested formation", "Рекомендуемая расстановка")}</h3><select data-crew-layout aria-label="${t("Formation style", "Стиль расстановки")}"><option value="screen" ${layout === "screen" ? "selected" : ""}>${t("Protect back line", "Прикрыть тыл")}</option><option value="spread" ${layout === "spread" ? "selected" : ""}>${t("Spread out", "Разнести юнитов")}</option></select></div><div class="premium-crew-board" role="group" aria-label="${t("16 by 16 board, your army deploys on the left", "Поле 16 на 16, ваша армия слева")}">${boardCells}${tokens}${axes}<span class="premium-crew-enemy" aria-hidden="true">${t("Enemy side", "Сторона врага")} →</span></div><p class="premium-fine">${t("Your deployment · base placement zone · no opponent selected", "Ваша зона · без усиления расстановки · противник не выбран")}</p><details class="premium-crew-notes"><summary>${t("Positions & details", "Клетки и подробности")}</summary><ul>${ids.map((id, i) => `<li><a href="${kb(catalog.units[id].anchor, lang)}">${e(catalog.units[id].name)}</a><b>${String.fromCharCode(65 + formation.positions[i].x)}${formation.positions[i].y + 1}</b></li>`).join("")}</ul><p>${t("A legal starting layout based on roles and unit footprints. It has not been tested as the best formation against an opponent.", "Начальная расстановка по ролям и размерам юнитов. Она не проверена как лучшая против конкретного противника.")}</p></details></div><aside class="premium-crew-recommendations"><h3>${t("Artifacts for this crew", "Артефакты для армии")}</h3><p>${t("Suggested by the game’s roster-fit rules", "По правилам подбора к составу армии")}</p>${artifactMarkup}<h3>${t("Faction bonuses", "Бонусы фракций")}</h3>${synergyMarkup}<div data-crew-evidence role="status" aria-live="polite"></div></aside></div>` : `<p class="premium-crew-empty">${hasEvidence ? t("Choose your first unit, or try a crew from the rankings.", "Выберите первого юнита или возьмите состав из рейтинга.") : t("Choose your first unit to explore formations, artifacts and faction bonuses.", "Выберите первого юнита, чтобы изучить расстановки, артефакты и бонусы фракций.")}</p>`}`;
}

function synergyEffect(faction: string, variant: number, power: number[], lang: Lang): string {
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
