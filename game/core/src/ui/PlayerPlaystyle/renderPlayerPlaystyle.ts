import { STYLE_AXES, type PlayerMetricsSummary } from "../../api/player_metrics_contract";

const copy = {
    en: {
        axes: ["Melee", "Ranged", "Magic", "Area damage", "Flying", "Support"],
        style: "Army preferences",
        window: "most recent ranked games",
        coverage: "with recorded battle data",
        weight: "Share of starting army investment. Roles overlap.",
        versatility: "Versatility",
        variety: "Different creatures",
        change: "How much army style changes between games",
        minimum: "Available after 5 recorded battles",
        habits: "Battle habits",
        choices: ["Attack", "Support", "Advance / move", "Hold", "Utility"],
        decisions: "human decisions",
        automation: "AI decisions excluded",
        advance: "moves closed the distance to an enemy",
        damage: "Damage dealt",
        heal: "Healing delivered",
        raised: "Units resurrected",
        hp: "HP",
        health: "Combat totals include human and AI turns. Unattributed damage is excluded from damage dealt.",
        missing: "games without usable battle data",
        loading: "Loading playstyle…",
        unavailable: "Playstyle is temporarily unavailable.",
    },
    ru: {
        axes: ["Ближний бой", "Дальний бой", "Магия", "Урон по области", "Полёт", "Поддержка"],
        style: "Предпочтения армии",
        window: "последних рейтинговых игр",
        coverage: "с данными боя",
        weight: "Доля вложений в стартовую армию. Роли пересекаются.",
        versatility: "Разнообразие",
        variety: "Разных существ",
        change: "Насколько меняется стиль армии между играми",
        minimum: "Доступно после 5 записанных боёв",
        habits: "Тактика в бою",
        choices: ["Атака", "Поддержка", "Перемещение", "Ожидание", "Контроль"],
        decisions: "решений игрока",
        automation: "решений ИИ исключено",
        advance: "перемещений сократили дистанцию до врага",
        damage: "Нанесено урона",
        heal: "Восстановлено здоровья",
        raised: "Воскрешено существ",
        hp: "ОЗ",
        health: "Итоги боя включают ходы игрока и ИИ. Урон без известного источника не включён в нанесённый урон.",
        missing: "игр без доступных данных боя",
        loading: "Загрузка стиля игры…",
        unavailable: "Стиль игры временно недоступен.",
    },
};
export type PlaystyleState = "ready" | "loading" | "error";
const safe = (value: number): number => (Number.isFinite(value) ? Math.max(0, value) : 0);
export function renderPlayerPlaystyle(
    metrics: PlayerMetricsSummary | null,
    language = "en",
    state: PlaystyleState = "ready",
    compact = false,
): string {
    const russian = language.toLowerCase().startsWith("ru");
    const c = russian ? copy.ru : copy.en;
    if (state !== "ready")
        return `<div class="hoc-playstyle hoc-playstyle--empty" role="status">${state === "loading" ? c.loading : c.unavailable}</div>`;
    // No recorded battles yet: render nothing. Callers hide the surrounding "Playstyle" heading with this.
    if (!metrics?.recordedGames || !metrics.stylePct) return "";
    const pct = (value: number) => Math.round(Math.min(100, safe(value)));
    const number = (value: number) =>
        new Intl.NumberFormat(russian ? "ru" : "en", { maximumFractionDigits: 0 }).format(safe(value));
    const point = (index: number, ratio: number, radius = 106) => {
        const angle = -Math.PI / 2 + (index * Math.PI) / 3;
        return [190 + Math.cos(angle) * radius * ratio, 165 + Math.sin(angle) * radius * ratio];
    };
    const points = (ratio: number) => STYLE_AXES.map((_, i) => point(i, ratio).join(",")).join(" ");
    const vertices = STYLE_AXES.map((axis, i) => point(i, pct(metrics.stylePct![axis]) / 100));
    const radar = `<svg class="hoc-playstyle__radar" viewBox="0 0 380 330" role="img" aria-label="${c.style}"><title>${c.style}</title><desc>${STYLE_AXES.map((axis, i) => `${c.axes[i]} ${pct(metrics.stylePct![axis])}%`).join(", ")}</desc>${[0.25, 0.5, 0.75, 1].map((r) => `<polygon class="hoc-playstyle__grid" points="${points(r)}"/>`).join("")}${STYLE_AXES.map((_, i) => `<line class="hoc-playstyle__grid" x1="190" y1="165" x2="${point(i, 1)[0]}" y2="${point(i, 1)[1]}"/>`).join("")}<text class="hoc-playstyle__scale" x="196" y="62">100%</text><text class="hoc-playstyle__scale" x="196" y="115">50%</text><polygon class="hoc-playstyle__shape" points="${vertices.map((p) => p.join(",")).join(" ")}"/>${vertices.map(([x, y], i) => `<circle class="hoc-playstyle__dot" cx="${x}" cy="${y}" r="3.5"><title>${c.axes[i]}: ${pct(metrics.stylePct![STYLE_AXES[i]])}%</title></circle>`).join("")}${STYLE_AXES.map(
        (axis, i) => {
            const [x, y] = point(i, 1, 137);
            return `<text class="hoc-playstyle__label" x="${x}" y="${y}" text-anchor="${i === 0 || i === 3 ? "middle" : i < 3 ? "start" : "end"}"><tspan x="${x}">${c.axes[i]}</tspan><tspan class="hoc-playstyle__label-value" x="${x}" dy="17">${pct(metrics.stylePct![axis])}%</tspan></text>`;
        },
    ).join("")}</svg>`;
    const choices = metrics.humanChoices;
    const keys = ["attack", "support", "move", "hold", "utility"] as const;
    const total = keys.reduce((sum, key) => sum + safe(choices?.[key] ?? 0), 0);
    const aiTotal = keys.reduce((sum, key) => sum + safe(metrics.automatedChoices?.[key] ?? 0), 0);
    const habits = keys
        .map((key, i) => {
            const value = total ? (100 * safe(choices?.[key] ?? 0)) / total : 0;
            return `<div class="hoc-playstyle__habit"><span>${c.choices[i]}</span><div class="hoc-playstyle__track"><div style="width:${value}%"></div></div><b>${total ? `${pct(value)}%` : "—"}</b></div>`;
        })
        .join("");
    return `<div class="hoc-playstyle${compact ? " hoc-playstyle--compact" : ""}${compact && metrics.versatility === null ? " hoc-playstyle--pending" : ""}"><div class="hoc-playstyle__coverage"><span>${compact ? `${metrics.recordedGames}/${metrics.gamesConsidered} ${c.coverage}` : `${metrics.gamesConsidered} ${c.window}`}</span><span>${metrics.recordedGames}/${metrics.gamesConsidered} ${c.coverage}</span></div><div class="hoc-playstyle__layout"><div><h3>${c.style}</h3>${radar}<p class="hoc-playstyle__note">${c.weight}</p></div><div class="hoc-playstyle__details"><div class="hoc-playstyle__scores"><div><span>${c.versatility}</span><strong>${metrics.versatility === null ? "—" : pct(metrics.versatility)}${metrics.versatility === null ? "" : `<small>/100</small>`}</strong><p>${metrics.versatility === null ? c.minimum : c.change}</p></div><div><span>${c.variety}</span><strong>${metrics.uniqueCreatures ?? "—"}</strong><p>${metrics.recordedGames} ${c.coverage}</p></div></div><h3>${c.habits}</h3><div class="hoc-playstyle__habits">${habits}</div><p class="hoc-playstyle__note">${number(total)} ${c.decisions}${aiTotal ? ` · ${number(aiTotal)} ${c.automation}` : ""}</p>${metrics.human?.moves ? `<p class="hoc-playstyle__note">${number(metrics.human.advances)}/${number(metrics.human.moves)} ${c.advance}</p>` : ""}</div></div><div class="hoc-playstyle__combat">${[
        [c.damage, metrics.health?.damageDealtHp, c.hp],
        [c.heal, metrics.health?.healingDoneHp, c.hp],
        [c.raised, metrics.health?.resurrectedUnits, ""],
    ]
        .map(
            ([label, value, unit]) =>
                `<div><span>${label}</span><b>${value === undefined ? "—" : number(Number(value))} <small>${unit}</small></b></div>`,
        )
        .join(
            "",
        )}</div><p class="hoc-playstyle__note">${c.health}${metrics.missingGames ? ` · ${metrics.missingGames} ${c.missing}` : ""}</p></div>`;
}
