export const MAGIC_DRAGON_LAB_DEATH_SPEED = 1.3;
export const MAGIC_DRAGON_LAB_HIT_SPEED = 1.3;

export const MAGIC_DRAGON_LAB_ACTION_CANVAS_SCALE = 1024 / 768;

export function isMagicDragonLabPaddedAction(state: string | undefined): boolean {
    return /^(?:melee_attack(?:_up|_down)?|cast)$/.test(state ?? "");
}
