/** Authored 1024px reaction canvases pad the original 768px figure by 128px per side. */
export const WYVERN_REACTION_CANVAS_SCALE = 1024 / 768;
export const WYVERN_REACTION_DURATION_MS = { hit: 460, death: 1280 / 1.18 } as const;
export type WyvernReaction = keyof typeof WYVERN_REACTION_DURATION_MS;
export const isWyvernReaction = (state?: string): state is WyvernReaction => state === "hit" || state === "death";

export const isWyvernLabAction = (state?: string): boolean =>
    isWyvernReaction(state) || state === "melee_attack" || state === "melee_attack_up" || state === "melee_attack_down";
