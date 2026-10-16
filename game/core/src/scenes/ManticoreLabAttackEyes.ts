/** Visible iris centers measured in the padded 896px attack frames. */
const attackEyes: Record<string, readonly (readonly [number, number])[]> = {
    melee_attack: [
        [690, 556],
        [685, 555],
        [680, 549],
        [681, 550],
        [685, 544],
        [686, 551],
        [691, 550],
        [690, 556],
    ],
    melee_attack_up: [
        [690, 556],
        [667, 535],
        [618, 469],
        [596, 446],
        [570, 387],
        [595, 455],
        [691, 553],
        [690, 556],
    ],
    melee_attack_down: [
        [690, 556],
        [705, 578],
        [672, 578],
        [711, 626],
        [723, 653],
        [694, 583],
        [695, 557],
        [690, 556],
    ],
};

export function manticoreLabAttackEye(state: string | undefined, frame: number): readonly [number, number] | undefined {
    return state ? attackEyes[state]?.[frame] : undefined;
}
