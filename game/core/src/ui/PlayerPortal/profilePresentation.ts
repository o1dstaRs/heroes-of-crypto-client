const escape = (value: string | number): string =>
    String(value).replace(
        /[&<>"']/g,
        (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
    );

export const PROFILE_MATCH_PAGE_SIZE = 6;
export const PROFILE_MATCH_HISTORY_ID = "profile-match-history";

export const profileWinRateTone = (winRate: number): "strong" | "even" | "weak" =>
    winRate >= 60 ? "strong" : winRate >= 45 ? "even" : "weak";

export const profileRatingTone = (delta: number): "win" | "loss" | "neutral" =>
    delta > 0 ? "win" : delta < 0 ? "loss" : "neutral";

/** Framework-independent profile statistic, shared by React and Astro. */
export function renderProfileStat(label: string, value: string | number): string {
    return `<div class="hoc-profile-stat"><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`;
}

type ProfileSummaryStats = { games: number; wins: number; losses: number; winRate: number };

export function renderProfileSummaryStats(
    stats: ProfileSummaryStats,
    labels: Record<keyof ProfileSummaryStats, string>,
    language: string,
): string {
    const numbers = new Intl.NumberFormat(language);
    const winRate = new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(stats.winRate);
    return [
        renderProfileStat(labels.games, numbers.format(stats.games)),
        renderProfileStat(labels.wins, numbers.format(stats.wins)),
        renderProfileStat(labels.losses, numbers.format(stats.losses)),
        renderProfileStat(labels.winRate, stats.games ? `${winRate}%` : "—"),
    ].join("");
}

export function renderProfileStanding(label: string, details: readonly string[]): string {
    return `<strong>${escape(label)}</strong>${details
        .filter(Boolean)
        .map((detail) => ` · ${escape(detail)}`)
        .join("")}`;
}

export type ProfileFormResult = "win" | "draw" | "loss" | "none";

export function renderProfileForm(
    newestFirst: readonly ProfileFormResult[],
    labels: Record<Exclude<ProfileFormResult, "none"> | "empty" | "title", string>,
): string {
    const results = newestFirst
        .filter((result) => result !== "none")
        .slice(0, 10)
        .reverse();
    if (results.length === 0) return "";
    const counts = { win: 0, draw: 0, loss: 0 };
    for (const result of results) counts[result] += 1;
    const label = `${labels.title}, ${counts.win} ${labels.win}, ${counts.draw} ${labels.draw}, ${counts.loss} ${labels.loss}`;
    const slots = [...Array<"empty">(10 - results.length).fill("empty"), ...results];
    const dots = slots
        .map(
            (result) =>
                `<span class="hoc-profile-form-dot" data-result="${result}" title="${escape(labels[result])}" aria-hidden="true"></span>`,
        )
        .join("");
    return `<div class="hoc-profile-form"><span class="hoc-profile-form-label" aria-hidden="true">${escape(labels.title)}</span><span class="hoc-profile-form-results" role="img" aria-label="${escape(label)}">${dots}</span></div>`;
}
