import { catalogIconUrl } from "./catalog-icon";
import { escapePremiumHtml as e } from "./premium-library";

export const CREW_UPGRADE_KINDS = ["Placement", "Armor", "Might", "Sniper", "Movement", "Empower"] as const;
export type CrewUpgradeKind = (typeof CREW_UPGRADE_KINDS)[number];
export interface CrewUpgrade {
    kind: CrewUpgradeKind;
    value: number;
}
export const CREW_UPGRADE_CAPS: Readonly<Record<CrewUpgradeKind, number>> = {
    Placement: 2,
    Armor: 3,
    Might: 3,
    Sniper: 3,
    Movement: 2,
    Empower: 3,
};
/** The crew builder plans for Battle Trance, the doctrine with the most upgrade points. */
export const CREW_UPGRADE_DOCTRINE = 3;
export const CREW_UPGRADE_BUDGET = 7;
/** Drawn until the AI's plan arrives, and for the enemy, whose upgrades stay unknown. */
export const DEFAULT_CREW_UPGRADES: readonly CrewUpgrade[] = Object.freeze([
    { kind: "Armor", value: 3 },
    { kind: "Might", value: 3 },
    { kind: "Sniper", value: 1 },
]);

const icons: Record<CrewUpgradeKind, string> = {
    Placement: "board",
    Armor: "armor",
    Might: "might",
    Sniper: "sniper",
    Movement: "movement",
    Empower: "empower",
};

export const crewUpgradeLevel = (upgrades: readonly CrewUpgrade[], kind: CrewUpgradeKind): number =>
    upgrades.find((choice) => choice.kind === kind)?.value ?? 0;

export const crewUpgradePoints = (upgrades: readonly CrewUpgrade[]): number =>
    upgrades.reduce((sum, choice) => sum + choice.value, 0);

/** A legal plan in canonical order without zero levels, or undefined for anything else. */
export function normalizeCrewUpgrades(value: unknown): CrewUpgrade[] | undefined {
    if (!Array.isArray(value) || value.length > CREW_UPGRADE_KINDS.length) return undefined;
    const levels = new Map<CrewUpgradeKind, number>();
    for (const item of value) {
        const kind = (item as Partial<CrewUpgrade> | null)?.kind;
        const level = (item as Partial<CrewUpgrade> | null)?.value;
        if (
            !CREW_UPGRADE_KINDS.includes(kind as CrewUpgradeKind) ||
            levels.has(kind as CrewUpgradeKind) ||
            !Number.isInteger(level) ||
            level! < 0 ||
            level! > CREW_UPGRADE_CAPS[kind as CrewUpgradeKind]
        )
            return undefined;
        levels.set(kind as CrewUpgradeKind, level!);
    }
    const plan = CREW_UPGRADE_KINDS.flatMap((kind) => (levels.get(kind) ? [{ kind, value: levels.get(kind)! }] : []));
    return crewUpgradePoints(plan) <= CREW_UPGRADE_BUDGET ? plan : undefined;
}

/** Set one upgrade's level; undefined when the plan would go over the doctrine's points. */
export function setCrewUpgradeLevel(
    upgrades: readonly CrewUpgrade[],
    kind: CrewUpgradeKind,
    level: number,
): CrewUpgrade[] | undefined {
    return normalizeCrewUpgrades([
        ...upgrades.filter((choice) => choice.kind !== kind),
        { kind, value: Math.max(0, Math.min(CREW_UPGRADE_CAPS[kind], level)) },
    ]);
}

export const crewUpgradeName = (kind: CrewUpgradeKind, lang: "en" | "ru") =>
    lang === "ru"
        ? {
              Placement: "Расстановка",
              Armor: "Броня",
              Might: "Ближний бой",
              Sniper: "Стрельба",
              Movement: "Движение",
              Empower: "Магия",
          }[kind]
        : kind;

export type CrewUpgradeStatus = "loading" | "ready" | "unavailable";

export function renderCrewUpgrades(
    upgrades: readonly CrewUpgrade[],
    aiPlan: readonly CrewUpgrade[] | undefined,
    automatic: boolean,
    status: CrewUpgradeStatus,
    lang: "en" | "ru",
): string {
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    const used = crewUpgradePoints(upgrades);
    const note =
        status === "loading"
            ? t("Asking the game AI for its plan…", "Запрашиваем план у игрового ИИ…")
            : status === "unavailable" || !aiPlan
              ? t(
                    "The AI's plan is unavailable right now; showing a standard plan.",
                    "План ИИ сейчас недоступен; показан стандартный план.",
                )
              : automatic
                ? t(
                      "The plan the ranked AI takes for this army. Click the dots to change it.",
                      "План, который рейтинговый ИИ берёт для этой армии. Нажмите на точки, чтобы изменить.",
                  )
                : t("Your plan. The ring marks the AI's level.", "Ваш план. Кольцо отмечает уровень ИИ.");
    const rows = CREW_UPGRADE_KINDS.map((kind) => {
        const level = crewUpgradeLevel(upgrades, kind);
        const ai = aiPlan ? crewUpgradeLevel(aiPlan, kind) : undefined;
        const name = crewUpgradeName(kind, lang);
        const dots = Array.from({ length: CREW_UPGRADE_CAPS[kind] }, (_, index) => {
            const step = index + 1;
            const next = step === level ? step - 1 : step;
            const classes = [step <= level ? "on" : "", !automatic && ai === step ? "ai" : ""].filter(Boolean);
            return `<button type="button" data-crew-upgrade="${kind}" data-crew-upgrade-level="${next}"${classes.length ? ` class="${classes.join(" ")}"` : ""} aria-label="${e(`${name} ${next}`)}"></button>`;
        }).join("");
        return `<div class="premium-crew-upgrade${level ? "" : " premium-crew-upgrade-off"}"><img src="${catalogIconUrl(`/assets/images/units/abilities/${icons[kind]}_augment_256.webp`)}" width="28" height="28" alt="" loading="lazy" decoding="async"/><span>${e(name)}</span><div class="premium-crew-upgrade-dots" role="group" aria-label="${e(`${name}: ${level} / ${CREW_UPGRADE_CAPS[kind]}`)}">${dots}</div></div>`;
    }).join("");
    return `<section class="premium-crew-upgrades" aria-busy="${status === "loading"}"><div class="premium-crew-synergy-heading"><h3>${t("Upgrades", "Усиления")}</h3><button type="button" class="premium-text-button" data-crew-upgrades-ai aria-pressed="${automatic}"${aiPlan ? "" : " disabled"}>${automatic ? t("AI plan ✓", "План ИИ ✓") : t("Use the AI plan", "Взять план ИИ")}</button></div><p class="premium-fine">${t("Battle Trance", "Боевой транс")} · ${used} / ${CREW_UPGRADE_BUDGET} ${t("points", "очков")} · <span role="status">${note}</span></p>${rows}</section>`;
}
