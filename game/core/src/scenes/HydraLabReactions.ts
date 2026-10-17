/** Attack is 77% faster than the approved 1.13x; death keeps its approved 1.5x.
 * Frame geometry is registered in the atlas; keep runtime scale constant.
 */
export const HYDRA_LAB_REACTION_SPEED = { hit: 1.1, death: 1.25 * 1.2, melee_attack: 1.13 * 1.77 } as const;

/** All five heads strike radially; target direction does not select a different pose. */
export function hydraLabAtlasState(state: string): string {
    return /^(?:melee_)?attack(?:_up|_down)?$/.test(state) ? "melee_attack" : state;
}
