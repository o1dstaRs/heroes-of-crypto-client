export type CrusaderAttackState = "melee_attack_up" | "melee_attack" | "melee_attack_down";
export function isCrusaderAttack(state: string | undefined): state is CrusaderAttackState {
    return state === "melee_attack_up" || state === "melee_attack" || state === "melee_attack_down";
}
export type CrusaderAttackPose = {
    blade: readonly [number, number, number, number];
    eye: readonly [number, number, number, number];
};
export const CRUSADER_ATTACK_POSES: Record<CrusaderAttackState, readonly CrusaderAttackPose[]> = {
    melee_attack_up: [
        {
            blade: [736, 774, 987, 651.01],
            eye: [621, 502, 665, 511],
        },
        {
            blade: [814.19, 541.63, 684.96, 394.84],
            eye: [648.58, 511.52, 700.02, 529.09],
        },
        {
            blade: [952.86, 474.87, 1143.82, 309.45],
            eye: [744.41, 505.8, 800.89, 519.25],
        },
        {
            blade: [980.67, 545.49, 1185.96, 424.97],
            eye: [791.28, 578.61, 842.93, 598.47],
        },
        {
            blade: [814.19, 541.63, 684.96, 394.84],
            eye: [648.58, 511.52, 700.02, 529.09],
        },
        {
            blade: [736, 774, 987, 651.01],
            eye: [621, 502, 665, 511],
        },
    ],
    melee_attack: [
        {
            blade: [736, 774, 987, 651.01],
            eye: [621, 502, 665, 511],
        },
        {
            blade: [698.9, 596.35, 694.8, 288.85],
            eye: [629.2, 502.05, 674.3, 512.3],
        },
        {
            blade: [528.75, 407.75, 313.5, 385.2],
            eye: [633.3, 526.65, 686.6, 541.0],
        },
        {
            blade: [731.7, 569.7, 541.05, 342.15],
            eye: [612.8, 543.05, 655.85, 559.45],
        },
        {
            blade: [747.08, 594.3, 902.88, 366.75],
            eye: [624.08, 536.9, 671.23, 551.25],
        },
        {
            blade: [745.02, 721.4, 1046.38, 686.55],
            eye: [619.98, 543.05, 665.08, 557.4],
        },
        {
            blade: [771.67, 741.9, 1013.58, 928.45],
            eye: [656.88, 524.6, 699.92, 541.0],
        },
        {
            blade: [742.97, 762.4, 1015.62, 616.85],
            eye: [628.17, 514.35, 671.22, 530.75],
        },
        {
            blade: [736, 774, 987, 651.01],
            eye: [621, 502, 665, 511],
        },
    ],
    melee_attack_down: [
        {
            blade: [736, 774, 987, 651.01],
            eye: [621, 502, 665, 511],
        },
        {
            blade: [814.19, 541.63, 684.96, 394.84],
            eye: [648.58, 511.52, 700.02, 529.09],
        },
        {
            blade: [982.07, 869.26, 1187.51, 1026.58],
            eye: [828.65, 593.61, 876.76, 618.31],
        },
        {
            blade: [1014.61, 895.72, 1216.74, 1063.55],
            eye: [862.7, 644.58, 908.03, 670.31],
        },
        {
            blade: [797.91, 666.15, 1015.34, 481.78],
            eye: [673.3, 502.13, 717.8, 517.39],
        },
        {
            blade: [736, 774, 987, 651.01],
            eye: [621, 502, 665, 511],
        },
    ],
};
