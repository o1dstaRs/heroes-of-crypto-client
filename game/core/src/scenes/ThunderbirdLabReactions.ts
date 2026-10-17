/** Reactions retain the native generated detail on a padded 1024px canvas. */
export const THUNDERBIRD_REACTION_SOURCE_SIZE = 640;
export const THUNDERBIRD_REACTION_SOURCE_ORIGIN = 192;
export const THUNDERBIRD_REACTION_CANVAS_SCALE = 1024 / THUNDERBIRD_REACTION_SOURCE_SIZE;

export function isThunderbirdLabReaction(state?: string): boolean {
    return state === "hit" || state === "death";
}

export function isThunderbirdLabAction(state?: string): boolean {
    return (
        isThunderbirdLabReaction(state) ||
        state === "melee_attack" ||
        state === "melee_attack_up" ||
        state === "melee_attack_down"
    );
}

export function thunderbirdReactionAnchorY(idleAnchorY: number): number {
    return (THUNDERBIRD_REACTION_SOURCE_ORIGIN + idleAnchorY * THUNDERBIRD_REACTION_SOURCE_SIZE) / 1024;
}
