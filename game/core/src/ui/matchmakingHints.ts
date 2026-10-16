/** Short tactical reminders, shown beneath the ranked queue headline. */
export const SEARCH_HINTS = [
    "Check the turn order before committing. A threat that acts next may deserve your attention first.",
    "Keep vulnerable stacks apart when facing attacks that can hit several units at once.",
    "Before a melee attack, check whether the target can retaliate.",
    "Protect your ranged attackers from enemies that can reach them on their next turn.",
    "Spell charges are limited. Save them for moments when they can change the fight.",
    "Balance your draft with damage, protection, and support instead of relying on one role.",
    "Spend all your upgrade points before locking in your army.",
    "Read enemy abilities before choosing a target. The nearest stack is not always the biggest threat.",
] as const;

/** Longer than the headline rotation so players can finish reading each reminder. */
export const SEARCH_HINT_SECONDS = 14;

export const searchHint = (elapsedSeconds: number): string => {
    const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
    return SEARCH_HINTS[Math.floor(elapsed / SEARCH_HINT_SECONDS) % SEARCH_HINTS.length];
};
